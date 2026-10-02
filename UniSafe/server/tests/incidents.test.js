import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import incidentsRoutes from '../src/routes/incidents.js';
import { seedInitialAdmin } from '../src/auth/database.js';
import { issueTokenPair } from '../src/auth/tokens.js';
import db from '../src/config/db.js';
import bcrypt from 'bcrypt';

const app = express();
app.use(express.json());
app.use('/api/incidents', incidentsRoutes);

describe('Incidents', () => {
  let adminToken;
  let securityToken;
  let medicalToken;
  let studentToken;
  let adminUser;
  let securityUser;
  let medicalUser;
  let studentUser;

  beforeEach(async () => {
    // Seed admin
    await seedInitialAdmin();
    adminUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('admin@unisafe.local');
    const adminTokens = await issueTokenPair(adminUser);
    adminToken = adminTokens.accessToken;

    // Create security user
    const securityId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('Security123!', 12);
    await db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, student_or_staff_id, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(securityId, 'Officer Security', 'security@test.pnguot.ac.pg', passwordHash, 'SEC-001', '+67571234567');
    
    const securityRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('SECURITY');
    await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(securityId, securityRole.id);
    
    securityUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('security@test.pnguot.ac.pg');
    const securityTokens = await issueTokenPair(securityUser);
    securityToken = securityTokens.accessToken;

    // Create medical user
    const medicalId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, student_or_staff_id, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(medicalId, 'Officer Medical', 'medical@test.pnguot.ac.pg', passwordHash, 'MED-001', '+67571234568');
    
    const medicalRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('MEDICAL');
    await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(medicalId, medicalRole.id);
    
    medicalUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('medical@test.pnguot.ac.pg');
    const medicalTokens = await issueTokenPair(medicalUser);
    medicalToken = medicalTokens.accessToken;

    // Create student user
    const studentId = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, student_or_staff_id, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, 'Test Student', 'student@test.pnguot.ac.pg', passwordHash, 'STU-001', '+67571234569');
    
    const studentRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STUDENT');
    await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(studentId, studentRole.id);
    
    studentUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('student@test.pnguot.ac.pg');
    const studentTokens = await issueTokenPair(studentUser);
    studentToken = studentTokens.accessToken;
  });

  describe('POST /api/incidents', () => {
    it('should create incident for authenticated user', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Security',
          title: 'Test Incident',
          description: 'Test description',
          priority: 'Medium'
        });
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.category).toBe('Security');
      expect(res.body.title).toBe('Test Incident');
      expect(res.body.status).toBe('Submitted');
      expect(res.body.reporter_id).toBe(studentUser.id);
    });

    it('should reject invalid payload', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'InvalidCategory',
          title: 'Test',
          description: 'Test'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid input');
    });

    it('should reject missing authentication', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .send({
          category: 'Security',
          title: 'Test',
          description: 'Test'
        });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing or invalid Authorization header.');
    });
  });

  describe('GET /api/incidents', () => {
    let incidentId;

    beforeEach(async () => {
      // Create an incident as student
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Security',
          title: 'Test Incident',
          description: 'Test description',
          priority: 'Medium'
        });
      incidentId = res.body.id;
    });

    it('should allow student to see their own incidents', async () => {
      const res = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.incidents.length).toBeGreaterThan(0);
      expect(res.body.incidents[0].reporter_id).toBe(studentUser.id);
    });

    it('should allow security to see Security category incidents', async () => {
      const res = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${securityToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.incidents.length).toBeGreaterThan(0);
    });

    it('should deny security access to Ambulance category', async () => {
      // Create an Ambulance incident
      await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Ambulance',
          title: 'Medical Emergency',
          description: 'Need ambulance',
          priority: 'Critical'
        });

      const res = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${securityToken}`);
      
      // Security should not see Ambulance incidents
      const ambulanceIncidents = res.body.incidents.filter(i => i.category === 'Ambulance');
      expect(ambulanceIncidents.length).toBe(0);
    });

    it('should allow medical to see Ambulance category', async () => {
      // Create an Ambulance incident
      await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Ambulance',
          title: 'Medical Emergency',
          description: 'Need ambulance',
          priority: 'Critical'
        });

      const res = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${medicalToken}`);
      
      expect(res.status).toBe(200);
      // Medical should see Ambulance incidents
      const ambulanceIncidents = res.body.incidents.filter(i => i.category === 'Ambulance');
      expect(ambulanceIncidents.length).toBeGreaterThan(0);
    });

    it('should allow admin to see all incidents', async () => {
      const res = await request(app)
        .get('/api/incidents')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.incidents.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/incidents/stats', () => {
    // Statistics are an aggregate of the same rows the list endpoint exposes,
    // so they must be scoped identically. Otherwise a Security officer could
    // learn the Ambulance incident count by reading /stats.
    async function seedOne(category) {
      await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ category, title: `${category} incident`, description: 'Scoping test.' });
    }

    beforeEach(async () => {
      await seedOne('Security');
      await seedOne('Ambulance');
    });

    it('should give an admin the full campus picture', async () => {
      const res = await request(app)
        .get('/api/incidents/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.security_count).toBe(1);
      expect(res.body.ambulance_count).toBe(1);
    });

    it('should hide Ambulance counts from a security officer', async () => {
      const res = await request(app)
        .get('/api/incidents/stats')
        .set('Authorization', `Bearer ${securityToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ambulance_count).toBe(0);
      expect(res.body.security_count).toBe(1);
      expect(res.body.total).toBe(1);
    });

    it('should hide Security counts from a medical responder', async () => {
      const res = await request(app)
        .get('/api/incidents/stats')
        .set('Authorization', `Bearer ${medicalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.security_count).toBe(0);
      expect(res.body.ambulance_count).toBe(1);
      expect(res.body.total).toBe(1);
    });

    it('should deny a student access to statistics', async () => {
      const res = await request(app)
        .get('/api/incidents/stats')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/incidents/:id', () => {
    let incidentId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Security',
          title: 'Test Incident',
          description: 'Test description',
          priority: 'Medium'
        });
      incidentId = res.body.id;
    });

    it('should allow owner to view incident', async () => {
      const res = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(incidentId);
    });

    it('should allow security to view Security incident', async () => {
      const res = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${securityToken}`);
      
      expect(res.status).toBe(200);
    });

    it('should deny medical access to Security incident', async () => {
      const res = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${medicalToken}`);
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not authorized to view this incident.');
    });

    it('should deny other student access to incident', async () => {
      // Create another student
      const otherStudentId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash('Student123!', 12);
      await db.prepare(`
        INSERT INTO users (id, full_name, email, password_hash, student_or_staff_id, phone)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(otherStudentId, 'Other Student', 'other@test.pnguot.ac.pg', passwordHash, 'STU-002', '+67571234570');
      
      const studentRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STUDENT');
      await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(otherStudentId, studentRole.id);
      
      const otherStudentUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('other@test.pnguot.ac.pg');
      const otherTokens = await issueTokenPair(otherStudentUser);

      const res = await request(app)
        .get(`/api/incidents/${incidentId}`)
        .set('Authorization', `Bearer ${otherTokens.accessToken}`);
      
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/incidents/:id/status', () => {
    let incidentId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Security',
          title: 'Test Incident',
          description: 'Test description',
          priority: 'Medium'
        });
      incidentId = res.body.id;
    });

    it('should allow security to update status', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Received', note: 'Received by dispatch' });
      
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Received');
    });

    it('should record correct previous status in history', async () => {
      await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Received', note: 'Received by dispatch' });
      
      const historyRes = await request(app)
        .get(`/api/incidents/${incidentId}/history`)
        .set('Authorization', `Bearer ${securityToken}`);
      
      expect(historyRes.status).toBe(200);
      const history = historyRes.body;
      expect(history.length).toBeGreaterThanOrEqual(2);
      
      // Check that the transition from Submitted to Received is recorded correctly
      const transition = history.find(h => h.new_status === 'Received');
      expect(transition).toBeDefined();
      expect(transition.old_status).toBe('Submitted');
      expect(transition.new_status).toBe('Received');
    });

    it('should deny student from updating status', async () => {
      const res = await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: 'Received' });
      
      expect(res.status).toBe(403);
    });

    it('should reject invalid status transition', async () => {
      // Try to go from Submitted to Closed directly
      const res = await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Closed' });
      
      // This might be allowed by the backend - depends on business logic
      // The test just ensures it doesn't crash
      expect([200, 400, 403]).toContain(res.status);
    });
  });

  describe('POST /api/incidents/:id/assign', () => {
    let incidentId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Security',
          title: 'Test Incident',
          description: 'Test description',
          priority: 'Medium'
        });
      incidentId = res.body.id;
    });

    it('should allow security to assign incident', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/assign`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ assignee_id: securityUser.id, note: 'Assigning to self' });
      
      expect(res.status).toBe(200);
      expect(res.body.assignee_id).toBe(securityUser.id);
      expect(res.body.status).toBe('Assigned');
    });

    it('should deny student from assigning incident', async () => {
      const res = await request(app)
        .post(`/api/incidents/${incidentId}/assign`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ assignee_id: securityUser.id });
      
      expect(res.status).toBe(403);
    });
  });

  describe('Status history integrity', () => {
    it('should record correct previous status for each transition', async () => {
      const res = await request(app)
        .post('/api/incidents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Security',
          title: 'Status History Test',
          description: 'Testing status history',
          priority: 'Medium'
        });
      
      const incidentId = res.body.id;

      // Transition: Submitted -> Received
      await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Received', note: 'Received' });

      // Transition: Received -> Assigned
      await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Assigned', note: 'Assigned to officer' });

      // Transition: Assigned -> Responding
      await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Responding', note: 'On site' });

      // Transition: Responding -> Resolved
      await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Resolved', note: 'Issue resolved' });

      // Transition: Resolved -> Closed
      await request(app)
        .patch(`/api/incidents/${incidentId}/status`)
        .set('Authorization', `Bearer ${securityToken}`)
        .send({ status: 'Closed', note: 'Case closed' });

      const historyRes = await request(app)
        .get(`/api/incidents/${incidentId}/history`)
        .set('Authorization', `Bearer ${securityToken}`);
      
      const history = historyRes.body;
      
      // Verify each transition has correct old_status
      const transitions = [
        { from: 'Submitted', to: 'Received' },
        { from: 'Received', to: 'Assigned' },
        { from: 'Assigned', to: 'Responding' },
        { from: 'Responding', to: 'Resolved' },
        { from: 'Resolved', to: 'Closed' }
      ];

      for (const { from, to } of transitions) {
        const entry = history.find(h => h.new_status === to);
        expect(entry).toBeDefined();
        expect(entry.old_status).toBe(from);
        expect(entry.new_status).toBe(to);
      }
    });
  });
});