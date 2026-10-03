import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { io as ioClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');

// The Socket.IO client and the Socket.IO server cannot share one Node process
// on Windows: the long-polling handshake deadlocks. The server is therefore
// booted as a real subprocess, exactly like it runs in production, and the
// assertions below drive it over real HTTP + a real WebSocket.
const PORT = 3231;
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let studentToken;
let securityToken;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 8000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket did not connect in time'));
    }, 10000);
    socket.on('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.on('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function once(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" event received`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

describe('Realtime push (live server subprocess)', () => {
  const sockets = [];

  beforeAll(async () => {
    // Strip all database connection variables from the inherited environment
    // and pass empty strings for DATABASE_URL and DB_HOST so the subprocess
    // dotenv/config import does NOT override them (dotenv skips variables that
    // are already set in process.env, even to an empty string). This forces the
    // subprocess to use in-memory SQLite rather than
    // attempting to connect to the Docker Postgres container (which is not
    // running during unit tests).
    const { DATABASE_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL, ...inheritedEnv } = process.env;
    child = spawn(process.execPath, ['index.js'], {
      cwd: SERVER_ROOT,
      env: {
        ...inheritedEnv,
        // Explicitly set to empty so dotenv/config does not re-inject from .env
        DATABASE_URL: '',
        DB_HOST: '',
        PORT: String(PORT),
        NODE_ENV: 'test',
        SQLITE_PATH: ':memory:',
        // Production requires signing secrets of at least 32 characters.
        JWT_ACCESS_SECRET: 'realtime-test-access-secret-value-0123456789',
        JWT_REFRESH_SECRET: 'realtime-test-refresh-secret-value-9876543210',
        CLIENT_ORIGINS: 'https://dashboard.example.test',
        ALLOWED_ORIGINS: '',
        ANTHROPIC_API_KEY: '',
        VOYAGE_API_KEY: '',
        DOTENV_CONFIG_PATH: '__unisafe_test_no_dotenv__',
      },
      stdio: 'ignore',
    });

    // Wait for the server to accept requests.
    let up = false;
    for (let i = 0; i < 40 && !up; i += 1) {
      await wait(500);
      try {
        const res = await fetch(`${BASE}/api/health`);
        up = res.ok;
      } catch { /* not listening yet */ }
    }
    if (!up) throw new Error('server subprocess did not become healthy');

    // Register a student and a security officer through the public API, then
    // sign in so we hold genuine tokens issued by the running server.
    const studentEmail = `rt-student-${Date.now()}@test.local`;
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { full_name: 'Realtime Student', email: studentEmail, password: 'Student123!' },
    });
    expect(reg.status).toBe(201);

    const studentLogin = await api('/api/auth/login', {
      method: 'POST',
      body: { email: studentEmail, password: 'Student123!' },
    });
    expect(studentLogin.status).toBe(200);
    studentToken = studentLogin.data.accessToken;

    // The seeded admin is the only account with a staff role available at boot.
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@unisafe.local';
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
    const adminLogin = await api('/api/auth/login', {
      method: 'POST',
      body: { email: adminEmail, password: adminPassword },
    });
    expect(adminLogin.status).toBe(200);
    securityToken = adminLogin.data.accessToken;
  }, 120000);

  afterAll(async () => {
    sockets.forEach((s) => { try { s.close(); } catch { /* already closed */ } });
    if (child) child.kill();
  }, 30000);

  async function open(token) {
    const socket = await connect(token);
    sockets.push(socket);
    return socket;
  }

  it('serves both health endpoints without auth and reports database status', async () => {
    for (const endpoint of ['/health', '/api/health']) {
      const res = await api(endpoint);
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('ok');
      expect(res.data.db).toEqual({ engine: 'sqlite', connected: true });
    }
  });

  it('shares the configured browser origin between HTTP and Socket.IO', async () => {
    const origin = 'https://dashboard.example.test';
    for (const endpoint of ['/health', '/socket.io/?EIO=4&transport=polling']) {
      const res = await fetch(`${BASE}${endpoint}`, { headers: { Origin: origin } });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      await res.text();
    }
    const blocked = await fetch(`${BASE}/health`, { headers: { Origin: 'https://not-allowed.example.test' } });
    expect(blocked.status).toBe(403);
    await blocked.text();
  });

  it('rejects a socket connection carrying an invalid token', async () => {
    await expect(connect(`bad-${crypto.randomUUID()}`)).rejects.toThrow();
  });

  it('pushes a student-created incident to a responder socket', async () => {
    const responder = await open(securityToken);

    const pushed = once(responder, 'incident-update');

    const created = await api('/api/incidents', {
      method: 'POST',
      token: studentToken,
      body: { category: 'Security', title: 'Realtime incident', description: 'Verifies live push to dashboard' },
    });
    expect(created.status).toBe(201);

    const payload = await pushed;
    expect(payload.action).toBe('created');
    expect(payload.incident.id).toBe(created.data.id);
    expect(payload.incident.title).toBe('Realtime incident');
  });

  it('pushes a dashboard status change back to the reporting student', async () => {
    const reporter = await open(studentToken);
    const responder = await open(securityToken);

    const created = await api('/api/incidents', {
      method: 'POST',
      token: studentToken,
      body: { category: 'Security', title: 'Status round trip', description: 'Student must observe the dashboard change' },
    });
    expect(created.status).toBe(201);

    const studentSees = once(reporter, 'incident-update');
    const responderSees = once(responder, 'incident-update');

    const updated = await api(`/api/incidents/${created.data.id}/status`, {
      method: 'PATCH',
      token: securityToken,
      body: { status: 'Responding', note: 'Officer dispatched to scene' },
    });
    expect(updated.status).toBe(200);

    const studentPayload = await studentSees;
    expect(studentPayload.action).toBe('status-changed');
    expect(studentPayload.incident.status).toBe('Responding');

    const responderPayload = await responderSees;
    expect(responderPayload.incident.status).toBe('Responding');
  });

  it('pushes a new SOS to responders so the emergency console updates live', async () => {
    const responder = await open(securityToken);

    const pushed = once(responder, 'sos-update');

    const sos = await api('/api/sos', {
      method: 'POST',
      token: studentToken,
      body: { latitude: -6.67, longitude: 146.995, location_text: 'Library forecourt' },
    });
    expect(sos.status).toBe(201);

    const payload = await pushed;
    expect(payload.action).toBe('created');
    expect(payload.sos.id).toBe(sos.data.id);
    expect(payload.sos.status).toBe('Active');
  });

  it('pushes an SOS resolution back to the reporting student', async () => {
    const reporter = await open(studentToken);

    const sos = await api('/api/sos', {
      method: 'POST',
      token: studentToken,
      body: { latitude: -6.671, longitude: 146.996, location_text: 'Dining Hall' },
    });
    expect(sos.status).toBe(201);

    const studentSees = once(reporter, 'sos-update');

    const resolved = await api(`/api/sos/${sos.data.id}/status`, {
      method: 'PATCH',
      token: securityToken,
      body: { status: 'Resolved', note: 'Handled on site' },
    });
    expect(resolved.status).toBe(200);

    const payload = await studentSees;
    expect(payload.sos.status).toBe('Resolved');
  });

  it('refuses dashboard-only mutations from a student token', async () => {
    const created = await api('/api/incidents', {
      method: 'POST',
      token: studentToken,
      body: { category: 'Security', title: 'Role check', description: 'Student must not manage this case' },
    });
    expect(created.status).toBe(201);

    const statusAttempt = await api(`/api/incidents/${created.data.id}/status`, {
      method: 'PATCH',
      token: studentToken,
      body: { status: 'Resolved' },
    });
    expect(statusAttempt.status).toBe(403);

    const usersAttempt = await api('/api/users', { token: studentToken });
    expect(usersAttempt.status).toBe(403);
  });

  it('allows a responder to change status and assign', async () => {
    const created = await api('/api/incidents', {
      method: 'POST',
      token: studentToken,
      body: { category: 'Fire', title: 'Responder action', description: 'Officer manages this case' },
    });
    expect(created.status).toBe(201);

    const responder = await open(securityToken);

    const me = await api('/api/auth/me', { token: securityToken });
    expect(me.status).toBe(200);

    const pushed = once(responder, 'incident-update');

    const assigned = await api(`/api/incidents/${created.data.id}/assign`, {
      method: 'POST',
      token: securityToken,
      body: { assignee_id: me.data.userId },
    });
    expect(assigned.status).toBe(200);
    expect(assigned.data.assignee_id).toBe(me.data.userId);

    const payload = await pushed;
    expect(payload.action).toBe('assigned');

    const statusUpdate = await api(`/api/incidents/${created.data.id}/status`, {
      method: 'PATCH',
      token: securityToken,
      body: { status: 'Assigned', note: 'Responder attached' },
    });
    expect(statusUpdate.status).toBe(200);
    expect(statusUpdate.data.status).toBe('Assigned');
  });
});
