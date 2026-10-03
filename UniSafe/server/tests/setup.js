import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
// Isolate before importing db; never use inherited hosted database configuration.
process.env.DATABASE_URL = '';
process.env.DB_HOST = '';
process.env.SQLITE_PATH = ':memory:';
process.env.DOTENV_CONFIG_PATH = '__unisafe_test_no_dotenv__';
const { default: db, initializeDatabase, closePool, isPostgres } = await import('../src/config/db.js');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.JWT_ACCESS_EXPIRY = '900';
process.env.JWT_REFRESH_EXPIRY = '604800';
// The admin bootstrap is refused unless these are explicitly configured, so
// tests declare their own fixture rather than depending on a default password.
process.env.INITIAL_ADMIN_EMAIL = 'admin@unisafe.local';
process.env.INITIAL_ADMIN_PASSWORD = 'TestAdmin1234!';

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closePool();
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
