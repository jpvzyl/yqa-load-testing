import { initializeDatabase } from '../db.js';
import { initializeDatabaseV2 } from '../db-v2.js';

console.log('[Migration] Starting v2 schema migration...');

try {
  await initializeDatabase();
  console.log('[Migration] v1 schema verified');

  await initializeDatabaseV2();
  console.log('[Migration] v2 schema applied (21 new tables)');

  console.log('[Migration] Complete');
  process.exit(0);
} catch (err) {
  console.error('[Migration] Failed:', err.message);
  process.exit(1);
}
