/**
 * Create the database schema.
 *
 * Works on both engines:
 *  - PostgreSQL (DATABASE_URL or DB_HOST set): applies src/config/schema.sql,
 *    statement by statement, in one transaction. Safe to re-run.
 *  - SQLite (no Postgres variables): creates the local development file via the
 *    same module the server uses, so the schema can never drift from runtime.
 *
 * Usage: npm run db:init
 */
import 'dotenv/config';
import { isPostgres, initializeDatabase, runPostgreSQLSchema, closePool } from '../src/config/db.js';

async function main() {
  if (isPostgres()) {
    console.log('Initializing PostgreSQL schema...');
    await runPostgreSQLSchema();
  } else {
    console.log('No DATABASE_URL or DB_HOST found - initializing local SQLite database...');
    await initializeDatabase();
    console.log('SQLite schema initialized.');
  }
  console.log('Database initialization complete.');
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Database initialization failed:', error.message);
    await closePool().catch(() => {});
    process.exit(1);
  });