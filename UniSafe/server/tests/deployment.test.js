import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import auditRoutes from '../src/routes/audit.js';
import { createAuditLog } from '../src/models/audit.js';
import { createUser, hashPassword } from '../src/auth/database.js';
import { generateAccessToken } from '../src/auth/tokens.js';
import { loginLimiter } from '../src/config/rate-limits.js';

describe('Deployment safeguards', () => {
  it('rejects missing, short, repeated, placeholder and identical production secrets', () => {
    const strong = () => crypto.randomBytes(32).toString('hex');
    const cases = [
      ['', strong()], ['short', strong()], ['a'.repeat(64), strong()],
      ['replace-me-with-your-secret-at-least-32-chars', strong()],
    ];
    const same = strong();
    cases.push([same, same]);
    for (const [access, refresh] of cases) {
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/auth/tokens.js')"], {
        env: { ...process.env, NODE_ENV: 'production', JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh },
        encoding: 'utf8', timeout: 10000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/JWT_.*SECRET/);
    }
    const valid = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/auth/tokens.js')"], {
      env: { ...process.env, NODE_ENV: 'production', JWT_ACCESS_SECRET: strong(), JWT_REFRESH_SECRET: strong() },
      encoding: 'utf8', timeout: 10000,
    });
    expect(valid.status).toBe(0);
  }, 30000);

  it('accepts Render-style 256-bit Base64 secrets in production', () => {
    const access = crypto.randomBytes(32).toString('base64');
    const refresh = crypto.randomBytes(32).toString('base64');
    expect(access).toHaveLength(44);
    expect(refresh).toHaveLength(44);
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/auth/tokens.js')"], {
      env: { ...process.env, NODE_ENV: 'production', JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh },
      encoding: 'utf8', timeout: 10000,
    });
    expect(result.status).toBe(0);
  });

  it('uses forwarded client IP/email for failed logins and excludes successful logins', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/login', loginLimiter, (req, res) => res.sendStatus(req.body.valid ? 200 : 401));
    const login = (ip, email, valid = false) => request(app).post('/login')
      .set('X-Forwarded-For', ip).send({ email, valid });
    for (let i = 0; i < 12; i++) expect((await login('192.0.2.1', 'success@example.test', true)).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await login('192.0.2.2', 'failed@example.test')).status).toBe(401);
    expect((await login('192.0.2.2', 'failed@example.test')).status).toBe(429);
    expect((await login('192.0.2.3', 'failed@example.test')).status).toBe(401);
    expect((await login('192.0.2.2', 'other@example.test')).status).toBe(401);
  });

  it('round-trips audit JSON through the API and filters failures correctly', async () => {
    const admin = await createUser({ full_name: 'Audit Tester', email: 'audit@example.test',
      password_hash: await hashPassword('Fixture123!'), role: 'ADMIN' });
    const oldValues = { nested: { status: 'before' }, roles: ['ADMIN'] };
    const newValues = { nested: { status: 'after' }, enabled: false };
    const created = await createAuditLog({ action: 'LOGIN', resource_type: 'user',
      resource_id: admin.id, old_values: oldValues, new_values: newValues, success: false });
    expect(created.old_values).toEqual(oldValues);
    expect(created.new_values).toEqual(newValues);
    await createAuditLog({ action: 'LOGIN', resource_type: 'user', success: true });
    const app = express();
    app.use('/api/audit-logs', auditRoutes);
    expect((await request(app).get('/api/audit-logs')).status).toBe(401);
    const res = await request(app).get('/api/audit-logs?success=false')
      .auth(generateAccessToken(admin), { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: created.id, old_values: oldValues, new_values: newValues, success: false });
  });
});
