/**
 * End-to-end verification against a running UniSafe API.
 *
 * This exercises the paths the unit tests cannot reach, because the vitest
 * suite pins itself to SQLite (see tests/setup.js). Run it against PostgreSQL
 * to catch engine-specific bugs that SQLite silently tolerates - non-UUID
 * primary keys being the usual one.
 *
 * Usage:
 *   $env:BASE_URL = "http://127.0.0.1:3198"
 *   $env:ADMIN_EMAIL / ADMIN_PASSWORD
 *   $env:SECURITY_EMAIL / SECURITY_PASSWORD
 *   $env:STUDENT_EMAIL / STUDENT_PASSWORD
 *   node scripts/e2e-verify.mjs
 *
 * Credentials come from `npm run db:seed`, which prints them once.
 */
import { io } from 'socket.io-client';

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:3198').replace(/\/$/, '');
const results = [];

function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` - ${detail}` : ''}`);
}

async function api(path, { method = 'GET', token, body, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // A browser always sends Origin; the app does not. Both are covered.
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { status: res.status, body: payload };
}

async function login(email, password) {
  const { status, body } = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (status !== 200) throw new Error(`login failed for ${email}: ${status}`);
  return body;
}

console.log(`Verifying ${BASE}\n`);

// ── Health ────────────────────────────────────────────────────────────────
{
  const { status, body } = await api('/health');
  check('GET /health returns 200', status === 200, JSON.stringify(body));
}
{
  const { status, body } = await api('/api/health');
  const engine = body?.db?.engine ?? body?.engine ?? 'unknown';
  const connected = body?.db?.connected ?? body?.connected;
  check('GET /api/health returns 200', status === 200, `engine=${engine} connected=${connected}`);
  if (engine !== 'sqlite') {
    check(
      'database engine is PostgreSQL',
      String(engine).includes('postgres'),
      `engine=${engine}`
    );
    check('database reports connected', connected === true);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────
const admin = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
check('admin login returns tokens', Boolean(admin.accessToken && admin.refreshToken));

const security = await login(process.env.SECURITY_EMAIL, process.env.SECURITY_PASSWORD);
const student = await login(process.env.STUDENT_EMAIL, process.env.STUDENT_PASSWORD);
check('security + student login return tokens', Boolean(security.accessToken && student.accessToken));

{
  const { status } = await api('/api/auth/login', {
    method: 'POST',
    body: { email: process.env.ADMIN_EMAIL, password: 'definitely-wrong-password' },
  });
  check('login rejects a wrong password', status === 401, `status=${status}`);
}

// ── Password hashes must never leave the server ───────────────────────────
{
  const { status, body } = await api('/api/users', { token: admin.accessToken });
  const serialised = JSON.stringify(body ?? {});
  check('GET /api/users succeeds for admin', status === 200, `status=${status}`);
  check('GET /api/users never leaks password_hash', !serialised.includes('password_hash'));
  check(
    'GET /api/users never leaks a bcrypt hash',
    !/\$2[aby]\$\d{2}\$/.test(serialised)
  );
}

// ── Role scoping ──────────────────────────────────────────────────────────
{
  const { status } = await api('/api/incidents/stats', { token: student.accessToken });
  check('student is refused incident stats', status === 403, `status=${status}`);
}
{
  const { status } = await api('/api/incidents/stats', { token: security.accessToken });
  check('security may read incident stats', status === 200, `status=${status}`);
}

// ── CORS ──────────────────────────────────────────────────────────────────
{
  const res = await fetch(`${BASE}/api/incidents`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://not-your-dashboard.example',
      'Access-Control-Request-Method': 'GET',
    },
  });
  check(
    'unknown Origin is not given CORS access',
    !res.headers.get('access-control-allow-origin'),
    `allow-origin=${res.headers.get('access-control-allow-origin')}`
  );
}

// ── Incident lifecycle + realtime ─────────────────────────────────────────
let incidentId = null;
const studentSocket = io(BASE, {
  auth: { token: student.accessToken },
  transports: ['websocket'],
});

try {
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no incident-update within 10s')), 10000);
    studentSocket.on('incident-update', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  // Give the socket a moment to authenticate before triggering the write.
  await new Promise((resolve) => {
    if (studentSocket.connected) return resolve();
    studentSocket.on('connect', resolve);
    setTimeout(resolve, 3000);
  });

  const created = await api('/api/incidents', {
    method: 'POST',
    token: student.accessToken,
    body: {
      category: 'Security',
      title: 'E2E verification incident',
      description: 'Created by scripts/e2e-verify.mjs',
      latitude: -6.67,
      longitude: 146.995,
      location_text: 'Library, North Campus',
      priority: 'Medium',
    },
  });
  incidentId = created.body?.incident?.id ?? created.body?.id ?? null;
  check('student can create an incident', created.status === 201 || created.status === 200, `status=${created.status}`);
  check('created incident id is a UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(incidentId)), `id=${incidentId}`);

  let realtime = null;
  try {
    realtime = await received;
    check('realtime incident-update pushed to the reporter', Boolean(realtime));
  } catch (err) {
    check('realtime incident-update pushed to the reporter', false, err.message);
  }

  if (incidentId) {
    const detail = await api(`/api/incidents/${incidentId}`, { token: student.accessToken });
    check('reporter can read back their incident', detail.status === 200, `status=${detail.status}`);

    const assigned = await api(`/api/incidents/${incidentId}`, {
      method: 'PATCH',
      token: security.accessToken,
      body: { status: 'Assigned' },
    });
    check('security can advance incident status', assigned.status === 200, `status=${assigned.status}`);

    const stats = await api('/api/dashboard/stats', { token: security.accessToken });
    check('dashboard stats readable by security', stats.status === 200, `status=${stats.status}`);
  }
} finally {
  studentSocket.close();
}

// ── Targeted alert delivery ───────────────────────────────────────────────
{
  const created = await api('/api/alerts', {
    method: 'POST',
    token: admin.accessToken,
    body: {
      title: 'E2E verification alert',
      message: 'Created by scripts/e2e-verify.mjs',
      severity: 'Info',
      target_roles: ['STAFF'],
    },
  });
  const alert = created.body?.alert ?? created.body;
  const targetRoles = alert?.target_roles;
  check('admin can create a targeted alert', created.status === 201 || created.status === 200, `status=${created.status}`);
  check(
    'target_roles contains role NAMES, not numeric ids',
    Array.isArray(targetRoles) && targetRoles.every((r) => typeof r === 'string'),
    `target_roles=${JSON.stringify(targetRoles)}`
  );

  const mine = await api('/api/alerts/my', { token: student.accessToken });
  const leaked = JSON.stringify(mine.body ?? '');
  check('student does not receive a STAFF-only alert', !leaked.includes('E2E verification alert'));
}

// ── Graceful AI degradation ───────────────────────────────────────────────
{
  const missing = await api('/api/policy-search', {
    method: 'POST',
    token: student.accessToken,
    body: { not_the_right_key: 'x' },
  });
  check('policy search rejects a body with no "question"', missing.status === 400, `status=${missing.status}`);

  const { status } = await api('/api/policy-search', {
    method: 'POST',
    token: student.accessToken,
    body: { question: 'what is the emergency procedure' },
  });
  check(
    'policy search returns 503 rather than crashing without AI keys',
    status === 503 || status === 200,
    `status=${status}`
  );
}

// ── Summary ───────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFailed:');
  for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
  process.exitCode = 1;
}
