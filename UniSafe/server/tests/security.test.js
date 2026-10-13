import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { io as clientIo } from 'socket.io-client';
import { createUser, getUserById, hashPassword } from '../src/auth/database.js';
import { issueTokenPair, rotateRefreshToken } from '../src/auth/tokens.js';
import { updateUser, removeUserRole } from '../src/models/users.js';
import { createIncident } from '../src/models/incidents.js';
import { createAppeal } from '../src/models/appeals.js';
import { moveToRecycleBin, restoreFromRecycleBin } from '../src/models/recycle-bin.js';
import { policyRoutes } from '../src/routes/policies.js';
import dashboardRoutes from '../src/routes/dashboard.js';
import authRoutes from '../src/auth/routes.js';
import { passwordChangeLimiter } from '../src/config/rate-limits.js';
import { resolveSsl } from '../src/config/db.js';
import { initRealtime, emitIncidentUpdate, emitAppealUpdate, emitAlertUpdate } from '../src/realtime.js';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fixture(role = 'STUDENT', password_hash = 'unused') {
  const user = await createUser({ full_name: `${role} fixture`, email: `${crypto.randomUUID()}@test.local`, role, password_hash });
  return { ...user, ...await issueTokenPair(user) };
}
const sockets = [];
let io;
afterEach(async () => {
  sockets.splice(0).forEach(socket => socket.close());
  if (io) await new Promise(resolve => io.close(resolve));
  io = null;
});
async function socketServer() {
  const server = createServer();
  io = initRealtime(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return async token => {
    const socket = clientIo(`http://127.0.0.1:${server.address().port}`, {
      auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true,
    });
    sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  };
}
function collect(socket, event) {
  const payloads = [];
  socket.on(event, payload => payloads.push(payload));
  return payloads;
}

describe('Security regressions', () => {
  it('verifies managed database certificates by default and preserves explicit local no-TLS', () => {
    expect(resolveSsl({ host: 'db.render.com' }, {})).toEqual({ rejectUnauthorized: true });
    expect(resolveSsl({ host: 'private.example' }, { DB_SSL: 'true' })).toEqual({ rejectUnauthorized: true });
    expect(resolveSsl({ host: 'localhost' }, { DB_SSL: 'false' })).toBe(false);
  });
  it('serves PDFs and rejects directory/traversal paths without crashing the HTTP server', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'unisafe-policy-test-'));
    await mkdir(path.join(root, 'public', 'directory.pdf'), { recursive: true });
    await writeFile(path.join(root, 'public', 'policy.pdf'), '%PDF-1.4\nfixture');
    const pdfApp = express();
    pdfApp.use('/policies', policyRoutes(root));
    const server = pdfApp.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const rawGet = pathname => new Promise((resolve, reject) => {
      httpRequest({ hostname: '127.0.0.1', port: server.address().port, path: pathname }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      }).on('error', reject).end();
    });
    try {
      for (const target of ['public/directory.pdf', '%2e%2e/%2e', 'public/%2e%2e', 'public/%2e%2e%2fsecret.pdf', 'public/missing.pdf']) {
        expect(await rawGet(`/policies/${target}`)).toBe(404);
      }
      expect(await rawGet('/policies/public/policy.pdf')).toBe(200);
    } finally {
      await new Promise(resolve => server.close(resolve));
      await rm(root, { recursive: true, force: true });
    }
  });

  it('masks anonymous dashboard identities and scopes appeals to administrators or their owner', async () => {
    const student = await fixture();
    const officer = await fixture('SECURITY');
    const admin = await fixture('ADMIN');
    const incident = await createIncident({ reporter_id: student.id, category: 'Security', title: 'Private', description: 'Private', is_anonymous: true });
    await createAppeal({ appellant_id: student.id, title: 'Private appeal', description: 'Private' });
    const own = await createAppeal({ appellant_id: officer.id, title: 'Own appeal', description: 'Own' });
    const response = await request(app).get('/dashboard/recent').auth(officer.accessToken, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.incidents.find(item => item.id === incident.id)).toMatchObject({ reporter_id: null, reporter_name: null, reporter_id_str: null });
    expect(response.body.appeals.map(item => item.id)).toEqual([own.id]);
    const all = await request(app).get('/dashboard/recent').auth(admin.accessToken, { type: 'bearer' });
    expect(all.body.appeals).toHaveLength(2);
  });

  it('invalidates access and refresh tokens on password reset, deactivation and recycle/restore', async () => {
    const admin = await fixture('ADMIN');
    for (const action of ['password', 'deactivate', 'recycle']) {
      const user = await fixture();
      if (action === 'password') await updateUser(user.id, { password_hash: 'replacement' }, admin.id);
      if (action === 'deactivate') {
        await updateUser(user.id, { is_active: false }, admin.id);
        await updateUser(user.id, { is_active: true }, admin.id);
      }
      if (action === 'recycle') {
        await moveToRecycleBin('user', user.id, admin.id);
        await restoreFromRecycleBin('user', user.id);
      }
      expect((await request(app).get('/auth/me').auth(user.accessToken, { type: 'bearer' })).status).toBe(401);
      await expect(rotateRefreshToken(user.refreshToken)).rejects.toThrow();
      const fresh = await issueTokenPair(await getUserById(user.id));
      expect((await request(app).get('/auth/me').auth(fresh.accessToken, { type: 'bearer' })).status).toBe(200);
    }
  });

  it('returns a working new session after changing a password and revokes the previous access token', async () => {
    const user = await fixture('STUDENT', await hashPassword('Original123!'));
    const changed = await request(app).post('/auth/change-password').auth(user.accessToken, { type: 'bearer' })
      .send({ currentPassword: 'Original123!', newPassword: 'Replacement456!' });
    expect(changed.status).toBe(200);
    expect((await request(app).get('/auth/me').auth(user.accessToken, { type: 'bearer' })).status).toBe(401);
    expect((await request(app).get('/auth/me').auth(changed.body.accessToken, { type: 'bearer' })).status).toBe(200);
    await expect(rotateRefreshToken(changed.body.refreshToken)).resolves.toHaveProperty('accessToken');
  }, 30000);

  it('cannot bypass the password limiter with changing email fields', async () => {
    const limited = express();
    limited.use(express.json());
    limited.use((req, res, next) => { req.user = { userId: 'same-account' }; next(); });
    limited.post('/', passwordChangeLimiter, (req, res) => res.sendStatus(401));
    for (let index = 0; index < 10; index++) {
      expect((await request(limited).post('/').send({ email: `${index}@test.local` })).status).toBe(401);
    }
    expect((await request(limited).post('/').send({ email: 'new@test.local' })).status).toBe(429);
  });

  it('blocks arbitrary room subscriptions, confidential appeals and untargeted alerts', async () => {
    const student = await fixture();
    const other = await fixture();
    const officer = await fixture('SECURITY');
    const admin = await fixture('ADMIN');
    const open = await socketServer();
    const studentSocket = await open(student.accessToken);
    const officerSocket = await open(officer.accessToken);
    const adminSocket = await open(admin.accessToken);
    for (const room of ['responders', 'role:SECURITY', `user:${other.id}`]) studentSocket.emit('join-room', room);
    await wait(50);
    const studentIncidents = collect(studentSocket, 'incident-update');
    const officerIncidents = collect(officerSocket, 'incident-update');
    const officerAppeals = collect(officerSocket, 'appeal-update');
    const adminAppeals = collect(adminSocket, 'appeal-update');
    const officerAlerts = collect(officerSocket, 'alert-update');
    const studentAlerts = collect(studentSocket, 'alert-update');
    await emitIncidentUpdate({ id: 'private-case', reporter_id: other.id, reporter_name: 'Private identity', category: 'Security', is_anonymous: true }, 'created');
    await emitAppealUpdate({ id: 'private-appeal', appellant_id: other.id }, 'created');
    await emitAlertUpdate({ id: 'student-alert', target_all: false, target_roles: ['STUDENT'] }, 'created');
    await wait(100);
    expect(studentIncidents).toEqual([]);
    expect(officerIncidents).toHaveLength(1);
    expect(officerIncidents[0].incident.reporter_name).toBeNull();
    expect(officerAppeals).toEqual([]);
    expect(adminAppeals).toHaveLength(1);
    expect(officerAlerts).toEqual([]);
    expect(studentAlerts).toHaveLength(1);
  });

  it('rechecks current roles and revocation before delivering to existing sockets', async () => {
    const officer = await fixture('SECURITY');
    const open = await socketServer();
    const socket = await open(officer.accessToken);
    const events = collect(socket, 'incident-update');
    await removeUserRole(officer.id, 'SECURITY');
    await emitIncidentUpdate({ reporter_id: 'another-user', category: 'Security' }, 'created');
    await wait(50);
    expect(events).toEqual([]);
    await updateUser(officer.id, { is_active: false }, officer.id);
    await emitIncidentUpdate({ reporter_id: officer.id, category: 'Security' }, 'created');
    await wait(50);
    expect(events).toEqual([]);
    expect(socket.connected).toBe(false);
  });

  it('expires idle sockets even without further events', async () => {
    const user = await fixture();
    const token = jwt.sign({ userId: user.id, sv: user.auth_version }, process.env.JWT_ACCESS_SECRET,
      { issuer: 'unisafe', algorithm: 'HS256', expiresIn: 2 });
    const open = await socketServer();
    const socket = await open(token);
    const expired = collect(socket, 'session-expired');
    await wait(2100);
    expect(expired).toHaveLength(1);
    expect(socket.connected).toBe(false);
  });
});
