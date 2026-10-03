// Writes a LOGIN audit row through the real API, then reads it as an admin.
// No dotenv loading, database resets, or credential/token output.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { AUDIT_API_URL, AUDIT_ADMIN_EMAIL, AUDIT_ADMIN_PASSWORD } = process.env;
if (!AUDIT_API_URL || !AUDIT_ADMIN_EMAIL || !AUDIT_ADMIN_PASSWORD) {
  throw new Error('Set AUDIT_API_URL, AUDIT_ADMIN_EMAIL and AUDIT_ADMIN_PASSWORD.');
}
const base = AUDIT_API_URL.replace(/\/+$/, '');
const marker = `unisafe-audit-check/${crypto.randomUUID()}`;
let tokens;
async function request(path, { body, token } = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json', 'User-Agent': marker,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(75000),
  });
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
  return response.json();
}
try {
  const health = await request('/api/health');
  assert.equal(health.db?.connected, true);
  assert.equal(health.db?.engine, 'postgresql', 'This smoke check requires PostgreSQL.');
  tokens = await request('/api/auth/login', {
    body: { email: AUDIT_ADMIN_EMAIL, password: AUDIT_ADMIN_PASSWORD },
  });
  const rows = await request('/api/audit-logs?action=LOGIN&success=true&limit=500', { token: tokens.accessToken });
  const row = rows.find(item => item.user_agent === marker);
  assert.ok(row, 'The LOGIN audit row must be readable through the API.');
  assert.equal(row.success, true);
  assert.equal(row.old_values, null);
  assert.equal(typeof row.new_values, 'object');
  assert.equal(row.new_values.email === AUDIT_ADMIN_EMAIL, true);
  assert.ok(Array.isArray(row.new_values.roles));
  console.log('PASS: PostgreSQL LOGIN audit JSON round trip through the API.');
} finally {
  if (tokens?.refreshToken) {
    await request('/api/auth/logout', { body: { refreshToken: tokens.refreshToken } });
  }
}
