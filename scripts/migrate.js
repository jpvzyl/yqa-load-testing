// Run database migrations.
// Creates all tables, indexes, and the default admin user.
//
// Usage: DATABASE_URL=postgres://... node scripts/migrate.js

import { initializeDatabase, getPool } from '../db.js';

async function migrate() {
  console.log('[Migrate] Running database migrations...');

  try {
    await initializeDatabase();
    console.log('[Migrate] Migrations completed successfully.');
  } catch (err) {
    console.error('[Migrate] Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    const pool = getPool();
    await pool.end();
  }
}

migrate();
