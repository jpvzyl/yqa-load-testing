import { createHash, randomBytes } from 'crypto';
import { getPool } from './db.js';
import { logAudit } from './db-v2.js';

// ── Provider Registry ──

const providers = new Map();

const WELL_KNOWN_PROVIDERS = {
  okta:             (domain) => `https://${domain}/.well-known/openid-configuration`,
  'azure-ad':       (tenant) => `https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`,
  'google-workspace': ()     => 'https://accounts.google.com/.well-known/openid-configuration',
  auth0:            (domain) => `https://${domain}/.well-known/openid-configuration`,
  onelogin:         (domain) => `https://${domain}.onelogin.com/oidc/2/.well-known/openid-configuration`,
};

// ── OIDC ──

export function configureOIDC(config) {
  validateOIDCConfig(config);

  const discoveryUrl = config.discovery_url
    || (WELL_KNOWN_PROVIDERS[config.provider]
      ? WELL_KNOWN_PROVIDERS[config.provider](config.domain || config.tenant)
      : null);

  const provider = {
    type: 'oidc',
    id: config.id || `oidc-${config.provider || 'custom'}`,
    name: config.name || config.provider || 'OIDC Provider',
    client_id: config.client_id,
    client_secret: config.client_secret,
    discovery_url: discoveryUrl,
    authorization_endpoint: config.authorization_endpoint,
    token_endpoint: config.token_endpoint,
    userinfo_endpoint: config.userinfo_endpoint,
    jwks_uri: config.jwks_uri,
    redirect_uri: config.redirect_uri,
    scopes: config.scopes || ['openid', 'profile', 'email'],
    claim_mapping: {
      email: config.claim_mapping?.email || 'email',
      name: config.claim_mapping?.name || 'name',
      groups: config.claim_mapping?.groups || 'groups',
      ...config.claim_mapping,
    },
    role_mapping: config.role_mapping || {},
    default_role: config.default_role || 'viewer',
    auto_provision: config.auto_provision !== false,
    allowed_domains: config.allowed_domains || [],
    _discovered: false,
  };

  providers.set(provider.id, provider);
  console.log(`[SSO] OIDC provider configured: ${provider.name} (${provider.id})`);
  return provider.id;
}

function validateOIDCConfig(config) {
  if (!config.client_id) throw new Error('OIDC: client_id is required');
  if (!config.client_secret) throw new Error('OIDC: client_secret is required');
  if (!config.redirect_uri) throw new Error('OIDC: redirect_uri is required');
  if (!config.discovery_url && !config.authorization_endpoint) {
    if (!config.provider || !WELL_KNOWN_PROVIDERS[config.provider]) {
      throw new Error('OIDC: discovery_url or authorization_endpoint is required');
    }
  }
}

export async function getOIDCAuthorizationUrl(providerId, state) {
  const provider = await resolveOIDCProvider(providerId);
  const nonce = randomBytes(16).toString('hex');
  const finalState = state || randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: provider.client_id,
    response_type: 'code',
    scope: provider.scopes.join(' '),
    redirect_uri: provider.redirect_uri,
    state: finalState,
    nonce,
  });

  return {
    url: `${provider.authorization_endpoint}?${params}`,
    state: finalState,
    nonce,
  };
}

async function resolveOIDCProvider(providerId) {
  const provider = providers.get(providerId);
  if (!provider || provider.type !== 'oidc') {
    throw new Error(`OIDC provider "${providerId}" not found`);
  }

  if (!provider._discovered && provider.discovery_url && !provider.authorization_endpoint) {
    await discoverOIDCEndpoints(provider);
  }

  return provider;
}

async function discoverOIDCEndpoints(provider) {
  try {
    const res = await fetch(provider.discovery_url);
    if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
    const doc = await res.json();

    provider.authorization_endpoint = doc.authorization_endpoint;
    provider.token_endpoint = doc.token_endpoint;
    provider.userinfo_endpoint = doc.userinfo_endpoint;
    provider.jwks_uri = doc.jwks_uri;
    provider._discovered = true;
    console.log(`[SSO] OIDC discovery completed for ${provider.name}`);
  } catch (err) {
    throw new Error(`OIDC discovery failed for ${provider.name}: ${err.message}`);
  }
}

export async function handleOIDCCallback(code, providerId) {
  const provider = await resolveOIDCProvider(providerId);

  const tokenPayload = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: provider.redirect_uri,
    client_id: provider.client_id,
    client_secret: provider.client_secret,
  });

  const tokenRes = await fetch(provider.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenPayload.toString(),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${tokenRes.status} — ${err}`);
  }

  const tokens = await tokenRes.json();
  const idClaims = decodeJwtPayload(tokens.id_token);

  let userinfoClaims = {};
  if (provider.userinfo_endpoint && tokens.access_token) {
    try {
      const uiRes = await fetch(provider.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (uiRes.ok) userinfoClaims = await uiRes.json();
    } catch { /* userinfo is optional */ }
  }

  const claims = { ...idClaims, ...userinfoClaims };
  const mapping = provider.claim_mapping;
  const email = claims[mapping.email];
  const name = claims[mapping.name] || email?.split('@')[0] || 'Unknown';
  const groups = claims[mapping.groups] || [];

  if (!email) throw new Error('OIDC: no email claim in token response');

  if (provider.allowed_domains.length > 0) {
    const domain = email.split('@')[1];
    if (!provider.allowed_domains.includes(domain)) {
      throw new Error(`Domain "${domain}" is not allowed for this provider`);
    }
  }

  const role = mapGroupsToRole(groups, provider.role_mapping, provider.default_role);
  const user = await provisionUser({ email, name, role, provider: provider.id, provider_type: 'oidc' }, provider.auto_provision);

  await logAudit({
    user_id: user.id,
    action: 'sso_login',
    resource_type: 'session',
    details: { provider: provider.id, provider_type: 'oidc', email },
  });

  return {
    user,
    tokens: { access_token: tokens.access_token, id_token: tokens.id_token },
  };
}

// ── SAML ──

export function configureSAML(config) {
  validateSAMLConfig(config);

  const provider = {
    type: 'saml',
    id: config.id || `saml-${config.provider || 'custom'}`,
    name: config.name || config.provider || 'SAML Provider',
    entry_point: config.entry_point || config.sso_url,
    issuer: config.issuer || config.entity_id,
    cert: config.cert || config.idp_cert,
    audience: config.audience || config.sp_entity_id,
    callback_url: config.callback_url || config.acs_url,
    signature_algorithm: config.signature_algorithm || 'sha256',
    digest_algorithm: config.digest_algorithm || 'sha256',
    want_assertions_signed: config.want_assertions_signed !== false,
    attribute_mapping: {
      email: config.attribute_mapping?.email || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      name: config.attribute_mapping?.name || 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
      groups: config.attribute_mapping?.groups || 'http://schemas.xmlsoap.org/claims/Group',
      ...config.attribute_mapping,
    },
    role_mapping: config.role_mapping || {},
    default_role: config.default_role || 'viewer',
    auto_provision: config.auto_provision !== false,
    allowed_domains: config.allowed_domains || [],
  };

  providers.set(provider.id, provider);
  console.log(`[SSO] SAML provider configured: ${provider.name} (${provider.id})`);
  return provider.id;
}

function validateSAMLConfig(config) {
  if (!config.entry_point && !config.sso_url) throw new Error('SAML: entry_point / sso_url is required');
  if (!config.cert && !config.idp_cert) throw new Error('SAML: cert / idp_cert is required');
  if (!config.callback_url && !config.acs_url) throw new Error('SAML: callback_url / acs_url is required');
}

export async function getSAMLAuthorizationUrl(providerId, relayState) {
  const provider = providers.get(providerId);
  if (!provider || provider.type !== 'saml') {
    throw new Error(`SAML provider "${providerId}" not found`);
  }

  const samlRequestId = `_${randomBytes(16).toString('hex')}`;
  const issueInstant = new Date().toISOString();

  const samlRequest = `<samlp:AuthnRequest
    xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="${samlRequestId}"
    Version="2.0"
    IssueInstant="${issueInstant}"
    Destination="${provider.entry_point}"
    AssertionConsumerServiceURL="${provider.callback_url}"
    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
    <saml:Issuer>${provider.issuer}</saml:Issuer>
  </samlp:AuthnRequest>`;

  const encoded = Buffer.from(samlRequest).toString('base64');
  const params = new URLSearchParams({ SAMLRequest: encoded });
  if (relayState) params.set('RelayState', relayState);

  return {
    url: `${provider.entry_point}?${params}`,
    request_id: samlRequestId,
  };
}

export async function handleSAMLResponse(samlResponse, providerId) {
  const provider = providers.get(providerId);
  if (!provider || provider.type !== 'saml') {
    throw new Error(`SAML provider "${providerId}" not found`);
  }

  const xml = Buffer.from(samlResponse, 'base64').toString('utf-8');
  const attributes = extractSAMLAttributes(xml);
  const mapping = provider.attribute_mapping;

  const email = attributes[mapping.email] || attributes.email;
  const name = attributes[mapping.name] || attributes.name || email?.split('@')[0] || 'Unknown';
  const groups = parseGroupAttribute(attributes[mapping.groups] || attributes.groups);

  if (!email) throw new Error('SAML: no email attribute in assertion');

  if (provider.allowed_domains.length > 0) {
    const domain = email.split('@')[1];
    if (!provider.allowed_domains.includes(domain)) {
      throw new Error(`Domain "${domain}" is not allowed for this provider`);
    }
  }

  const role = mapGroupsToRole(groups, provider.role_mapping, provider.default_role);
  const user = await provisionUser({ email, name, role, provider: provider.id, provider_type: 'saml' }, provider.auto_provision);

  await logAudit({
    user_id: user.id,
    action: 'sso_login',
    resource_type: 'session',
    details: { provider: provider.id, provider_type: 'saml', email },
  });

  return { user };
}

function extractSAMLAttributes(xml) {
  const attrs = {};
  const attrRegex = /<(?:saml2?:)?Attribute\s+Name="([^"]+)"[^>]*>\s*<(?:saml2?:)?AttributeValue[^>]*>([^<]+)<\//g;
  let match;
  while ((match = attrRegex.exec(xml)) !== null) {
    const name = match[1];
    const value = match[2].trim();
    if (attrs[name]) {
      attrs[name] = Array.isArray(attrs[name]) ? [...attrs[name], value] : [attrs[name], value];
    } else {
      attrs[name] = value;
    }
  }
  return attrs;
}

function parseGroupAttribute(groups) {
  if (!groups) return [];
  if (Array.isArray(groups)) return groups;
  if (typeof groups === 'string') return groups.split(',').map(g => g.trim());
  return [];
}

// ── Shared Helpers ──

function mapGroupsToRole(groups, roleMapping, defaultRole) {
  if (!groups?.length || !roleMapping || Object.keys(roleMapping).length === 0) {
    return defaultRole;
  }

  const rolePriority = { owner: 3, admin: 2, operator: 1, viewer: 0 };
  let bestRole = defaultRole;
  let bestPriority = rolePriority[defaultRole] ?? -1;

  for (const [group, role] of Object.entries(roleMapping)) {
    if (groups.includes(group) && (rolePriority[role] ?? -1) > bestPriority) {
      bestRole = role;
      bestPriority = rolePriority[role] ?? -1;
    }
  }

  return bestRole;
}

function decodeJwtPayload(jwt) {
  if (!jwt) return {};
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return {};
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

async function provisionUser(info, autoProvision) {
  const db = getPool();

  const existing = await db.query('SELECT * FROM users WHERE email = $1', [info.email]);
  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    await db.query(
      'UPDATE users SET last_login_at = NOW(), sso_provider = $1 WHERE id = $2',
      [info.provider, user.id]
    );
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  if (!autoProvision) {
    throw new Error(`User ${info.email} not found and auto-provisioning is disabled`);
  }

  const placeholderHash = createHash('sha256').update(randomBytes(32)).digest('hex');
  const result = await db.query(
    `INSERT INTO users (email, name, password_hash, role, sso_provider, last_login_at)
     VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, email, name, role`,
    [info.email, info.name, placeholderHash, info.role, info.provider]
  );

  return result.rows[0];
}

// ── Provider Management ──

export function getProvider(id) {
  const p = providers.get(id);
  if (!p) return null;
  const { client_secret, cert, ...safe } = p;
  return safe;
}

export function listProviders() {
  return Array.from(providers.values()).map(p => ({
    id: p.id,
    type: p.type,
    name: p.name,
  }));
}

export function removeProvider(id) {
  return providers.delete(id);
}
