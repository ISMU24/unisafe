/**
 * Clears reported activity so a demo or handover starts from a clean slate.
 *
 * Removes incidents, SOS events, alerts, appeals and assistance requests along
 * with the status history, assignments and deliveries that reference them, plus
 * the audit log and refresh tokens left behind by testing. Accounts and roles
 * are kept, because you still need to sign in afterwards.
 *
 *   node scripts/reset-reports.mjs
 *   npm run db:reset-reports
 *
 * This only ever touches the local SQLite development file. It refuses to run
 * against PostgreSQL: production data is not something a convenience script
 * should be able to empty.
 */
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

if (process.env.DATABASE_URL || process.env.DB_HOST) {
  console.error(
    'Refusing to run: DATABASE_URL / DB_HOST is set, so this would target a real database.\n' +
    'This script is only for the local development SQLite file.'
  );
  process.exit(1);
}

const file = path.join(process.cwd(), 'data', 'unisafe.db');
if (!fs.existsSync(file)) {
  console.error(`No local database at ${file}. Nothing to reset.`);
  process.exit(1);
}

const db = new Database(file);
db.pragma('foreign_keys = OFF');

// Child rows first - each of these is referenced by a foreign key.
const TABLES = [
  'appeal_documents',
  'appeals',
  'alert_deliveries',
  'safety_alerts',
  'incident_media',
  'incident_assignments',
  'incident_status_history',
  'incidents',
  'sos_status_history',
  'sos_events',
  'assistance_requests',
  'audit_logs',
  'refresh_tokens',
];

const count = (t) => {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  } catch {
    return 0;
  }
};

console.log(`Resetting ${file}\n`);
console.log('BEFORE');
for (const t of TABLES) {
  const n = count(t);
  if (n) console.log(`  ${t.padEnd(26)} ${n}`);
}

db.transaction((tables) => {
  for (const t of tables) {
    try {
      db.prepare(`DELETE FROM ${t}`).run();
    } catch (err) {
      console.log(`  skipped ${t}: ${err.message}`);
    }
  }
  // Clear autoincrement counters so new reports get fresh ids.
  try {
    db.prepare('DELETE FROM sqlite_sequence').run();
  } catch {
    /* only exists when some column is AUTOINCREMENT */
  }
})(TABLES);

console.log('\nAFTER');
for (const t of TABLES) {
  const n = count(t);
  if (n) console.log(`  ${t.padEnd(26)} ${n}`);
}

console.log('\nKept (needed to sign in):');
for (const t of ['users', 'roles']) console.log(`  ${t.padEnd(26)} ${count(t)}`);

console.log('\nDone. Re-run `npm run db:seed` if you want the demo records back.');

db.close();