import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import db from '../src/config/db.js';
import { seedInitialAdmin } from '../src/auth/database.js';
import { issueTokenPair } from '../src/auth/tokens.js';
import incidentsRoutes from '../src/routes/incidents.js';
import recycleBinRoutes from '../src/routes/recycle-bin.js';

const app = express();
app.use(express.json());
app.use('/api/incidents', incidentsRoutes);
app.use('/api/recycle-bin', recycleBinRoutes);

describe('Recycle Bin', () => {
  let admin;
  let adminToken;

  beforeEach(async () => {
    await seedInitialAdmin();
    admin = await db.prepare('SELECT * FROM users WHERE email = ?').get('admin@unisafe.local');
    adminToken = (await issueTokenPair(admin)).accessToken;
  });

  it('archives an incident, hides it from normal queries, then restores it', async () => {
    const incident = await request(app)
      .post('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ category: 'Security', title: 'Recycle test', description: 'Test record' });
    expect(incident.status).toBe(201);

    const archived = await request(app)
      .delete(`/api/recycle-bin/incident/${incident.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(archived.status).toBe(200);
    expect(archived.body.recycled).toBe(true);

    const list = await request(app)
      .get('/api/incidents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.incidents.some(item => item.id === incident.body.id)).toBe(false);

    const bin = await request(app)
      .get('/api/recycle-bin')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bin.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: incident.body.id, type: 'incident', label: 'Recycle test' }),
    ]));

    const restored = await request(app)
      .post(`/api/recycle-bin/incident/${incident.body.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(restored.status).toBe(200);

    const visibleAgain = await request(app)
      .get(`/api/incidents/${incident.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(visibleAgain.status).toBe(200);
  });

  it('permanently removes an archived account and its owned operational records', async () => {
    const studentId = crypto.randomUUID();
    const role = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STUDENT');
    await db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(studentId, 'Recycle Student', `recycle-${studentId}@example.test`, 'hash');
    await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(studentId, role.id);
    const incidentId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO incidents (id, reporter_id, category, title, description)
      VALUES (?, ?, 'Security', 'Owned report', 'Will be erased with the account')
    `).run(incidentId, studentId);

    const archived = await request(app)
      .delete(`/api/recycle-bin/user/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(archived.status).toBe(200);

    const erased = await request(app)
      .delete(`/api/recycle-bin/user/${studentId}/permanent`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(erased.status).toBe(200);
    expect(await db.prepare('SELECT id FROM users WHERE id = ?').get(studentId)).toBeUndefined();
    expect(await db.prepare('SELECT id FROM incidents WHERE id = ?').get(incidentId)).toBeUndefined();
  });

  it('archives and restores every supported record type', async () => {
    const ids = Object.fromEntries(
      ['sos', 'alert', 'assistance', 'appeal', 'user'].map(type => [type, crypto.randomUUID()])
    );
    await db.prepare('INSERT INTO sos_events (id, reporter_id, location_text) VALUES (?, ?, ?)').run(ids.sos, admin.id, 'Bin test location');
    await db.prepare('INSERT INTO safety_alerts (id, title, message, sent_by) VALUES (?, ?, ?, ?)').run(ids.alert, 'Bin test alert', 'Test message', admin.id);
    await db.prepare('INSERT INTO assistance_requests (id, requester_id, type, title, description) VALUES (?, ?, ?, ?, ?)').run(ids.assistance, admin.id, 'General', 'Bin test assistance', 'Test');
    await db.prepare('INSERT INTO appeals (id, appellant_id, title, description) VALUES (?, ?, ?, ?)').run(ids.appeal, admin.id, 'Bin test appeal', 'Test');
    await db.prepare('INSERT INTO users (id, full_name, email, password_hash) VALUES (?, ?, ?, ?)').run(ids.user, 'Bin test user', `bin-${ids.user}@example.test`, 'hash');

    const active = await request(app).get('/api/recycle-bin/records').set('Authorization', `Bearer ${adminToken}`);
    expect(active.status).toBe(200);
    expect(active.body.records).toEqual(expect.arrayContaining(
      Object.entries(ids).map(([type, id]) => expect.objectContaining({ type, id }))
    ));
    expect(active.body.records.some(record => record.type === 'user' && record.id === admin.id)).toBe(false);

    for (const [type, id] of Object.entries(ids)) {
      const response = await request(app)
        .delete(`/api/recycle-bin/${type}/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status, `${type} should be archived`).toBe(200);
    }

    const activeAfterArchive = await request(app).get('/api/recycle-bin/records').set('Authorization', `Bearer ${adminToken}`);
    expect(activeAfterArchive.body.records).not.toEqual(expect.arrayContaining(
      Object.entries(ids).map(([type, id]) => expect.objectContaining({ type, id }))
    ));

    const bin = await request(app).get('/api/recycle-bin').set('Authorization', `Bearer ${adminToken}`);
    expect(bin.body.items).toEqual(expect.arrayContaining(
      Object.entries(ids).map(([type, id]) => expect.objectContaining({ type, id }))
    ));

    for (const [type, id] of Object.entries(ids)) {
      const response = await request(app)
        .post(`/api/recycle-bin/${type}/${id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status, `${type} should be restored`).toBe(200);
    }

    expect((await request(app).get('/api/recycle-bin').set('Authorization', `Bearer ${adminToken}`)).body.items)
      .not.toEqual(expect.arrayContaining(Object.entries(ids).map(([type, id]) => expect.objectContaining({ type, id }))));
  });

  it('does not allow non-admins to read the Recycle Bin', async () => {
    const studentId = crypto.randomUUID();
    const role = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STUDENT');
    await db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(studentId, 'Recycle Student', `recycle-${studentId}@example.test`, 'hash');
    await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(studentId, role.id);
    const studentToken = (await issueTokenPair({ id: studentId, roles: ['STUDENT'] })).accessToken;

    const response = await request(app)
      .get('/api/recycle-bin')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(response.status).toBe(403);
  });
});
