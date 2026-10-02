import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import db, { initializeDatabase, closePool, isPostgres } from '../src/config/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.JWT_ACCESS_EXPIRY = '900';
process.env.JWT_REFRESH_EXPIRY = '604800';
// The admin bootstrap is refused unless these are explicitly configured, so
// tests declare their own fixture rather than depending on a default password.
process.env.INITIAL_ADMIN_EMAIL = 'admin@unisafe.local';
process.env.INITIAL_ADMIN_PASSWORD = 'ChangeMe!2024';
// Use a file-based SQLite database for tests so all test files share the same DB
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.SQLITE_PATH = path.join(__dirname, 'test.db');

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closePool();
  // Clean up test database file
  try {
    const fs = await import('fs');
    fs.unlinkSync(process.env.SQLITE_PATH);
  } catch (e) {
    // ignore
  }
});

beforeEach(async () => {
  // Clean up tables between tests (only for SQLite)
  if (!isPostgres()) {
    const tables = [
      'audit_logs',
      'incident_assignments',
      'incident_status_history',
      'incident_media',
      'incidents',
      'sos_status_history',
      'sos_events',
      'alert_deliveries',
      'safety_alerts',
      'assistance_requests',
      'appeal_documents',
      'appeals',
      'refresh_tokens',
      'user_roles',
      'users'
    ];
    for (const table of tables) {
      try {
        await db.prepare(`DELETE FROM ${table}`).run();
      } catch (e) {
        // Table might not exist
      }
    }
  }
});

// Mock console.error to reduce noise in tests
const originalError = console.error;
beforeAll(() => {
  console.error = vi.fn();
});
afterAll(() => {
  console.error = originalError;
});