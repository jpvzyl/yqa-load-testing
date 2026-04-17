import { createHash } from 'crypto';
import { getPool } from './db.js';
import { logAudit } from './db-v2.js';

// ── Role & Permission Definitions ──

const ROLES = {
  viewer:   { level: 0, permissions: ['read'] },
  operator: { level: 1, permissions: ['read', 'write', 'execute'] },
  admin:    { level: 2, permissions: ['read', 'write', 'execute', 'admin'] },
  owner:    { level: 3, permissions: ['read', 'write', 'execute', 'admin'] },
};

const PERMISSION_DESCRIPTIONS = {
  read:    'View tests, runs, results, and configurations',
  write:   'Create and modify tests, scenarios, and configurations',
  execute: 'Start and stop test runs, trigger chaos experiments',
  admin:   'Manage users, roles, API keys, and platform settings',
};

// ── Core Authorization ──

export function hasPermission(role, permission) {
  const roleConfig = ROLES[role];
  if (!roleConfig) return false;
  return roleConfig.permissions.includes(permission);
}

export function hasRole(userRole, requiredRole) {
  const user = ROLES[userRole];
  const required = ROLES[requiredRole];
  if (!user || !required) return false;
  return user.level >= required.level;
}

export function getRolePermissions(role) {
  return ROLES[role]?.permissions || [];
}

export function getAllRoles() {
  return Object.entries(ROLES).map(([name, config]) => ({
    name,
    level: config.level,
    permissions: config.permissions,
  }));
}

// ── Express Middleware ──

export function authorize(permission) {
  return async (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const role = user.role || 'viewer';
    if (!hasPermission(role, permission)) {
      await logAuditEvent(req, 'authorization_denied', {
        required_permission: permission,
        user_role: role,
      });
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
        your_role: role,
        your_permissions: getRolePermissions(role),
      });
    }

    next();
  };
}

export function requireRole(requiredRole) {
  return async (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const role = user.role || 'viewer';
    if (!hasRole(role, requiredRole)) {
      await logAuditEvent(req, 'role_check_denied', {
        required_role: requiredRole,
        user_role: role,
      });
      return res.status(403).json({
        error: 'Insufficient role',
        required: requiredRole,
        your_role: role,
      });
    }

    next();
  };
}

export function authorizeResource(permission, getResourceOwnerId) {
  return async (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const role = user.role || 'viewer';

    if (hasPermission(role, 'admin')) return next();

    if (typeof getResourceOwnerId === 'function') {
      try {
        const ownerId = await getResourceOwnerId(req);
        if (ownerId === user.id) return next();
      } catch {
        // Fall through to permission check
      }
    }

    if (!hasPermission(role, permission)) {
      await logAuditEvent(req, 'resource_authorization_denied', {
        required_permission: permission,
        user_role: role,
        resource_id: req.params.id,
      });
      return res.status(403).json({
        error: 'Insufficient permissions for this resource',
        required: permission,
      });
    }

    next();
  };
}

// ── Role Management ──

export async function getUserRole(userId, projectId) {
  const db = getPool();
  const result = await db.query(
    `SELECT role FROM project_members WHERE user_id = $1 AND project_id = $2`,
    [userId, projectId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].role;
}

export async function setUserRole(userId, projectId, role, assignedBy) {
  if (!ROLES[role]) throw new Error(`Invalid role: ${role}`);

  const db = getPool();
  await db.query(
    `INSERT INTO project_members (user_id, project_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, project_id)
     DO UPDATE SET role = $3`,
    [userId, projectId, role]
  );

  await logAudit({
    user_id: assignedBy,
    action: 'role_assigned',
    resource_type: 'user',
    resource_id: userId,
    details: { project_id: projectId, role },
  });
}

export async function removeUserRole(userId, projectId, removedBy) {
  const db = getPool();
  await db.query(
    'DELETE FROM project_members WHERE user_id = $1 AND project_id = $2',
    [userId, projectId]
  );

  await logAudit({
    user_id: removedBy,
    action: 'role_removed',
    resource_type: 'user',
    resource_id: userId,
    details: { project_id: projectId },
  });
}

export async function getProjectMembers(projectId) {
  const db = getPool();
  const result = await db.query(
    `SELECT pm.user_id, pm.role, u.email, u.name
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY pm.role DESC, u.name ASC`,
    [projectId]
  );
  return result.rows;
}

// ── Audit Logging ──

async function logAuditEvent(req, action, details = {}) {
  try {
    await logAudit({
      user_id: req.user?.id,
      action,
      resource_type: details.resource_type || req.baseUrl?.split('/').pop(),
      resource_id: details.resource_id || req.params?.id,
      details,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get?.('user-agent'),
    });
  } catch (err) {
    console.error('[RBAC] Audit log write failed:', err.message);
  }
}

export function auditMiddleware(action, getResourceInfo) {
  return async (req, res, next) => {
    const originalEnd = res.end;
    res.end = function (...args) {
      const resourceInfo = typeof getResourceInfo === 'function'
        ? getResourceInfo(req, res)
        : {};

      if (res.statusCode < 400) {
        logAuditEvent(req, action, {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          ...resourceInfo,
        }).catch(() => {});
      }

      originalEnd.apply(res, args);
    };
    next();
  };
}

// ── API Key Authorization ──

function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

export async function validateApiKey(key) {
  if (!key) return null;

  const db = getPool();
  const result = await db.query(
    `SELECT ak.*, u.email, u.name, u.role
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = $1 AND ak.is_active = TRUE AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
    [hashApiKey(key)]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  await db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]);

  return {
    id: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    api_key_id: row.id,
    scopes: row.scopes || [],
  };
}

export async function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  if (authHeader.startsWith('Bearer sk-')) {
    const key = authHeader.slice(7);
    const user = await validateApiKey(key);
    if (user) {
      req.user = user;
      return next();
    }
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}
