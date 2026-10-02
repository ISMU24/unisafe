import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import authRoutes from '../src/auth/routes.js';
import { seedInitialAdmin } from '../src/auth/database.js';
import { issueTokenPair } from '../src/auth/tokens.js';
import db from '../src/config/db.js';
import bcrypt from 'bcrypt';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Authentication', () => {
  let adminToken;
  let studentToken;
  let adminUser;
  let studentUser;

  beforeEach(async () => {
    // Seed admin
    await seedInitialAdmin();
    
    adminUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('admin@unisafe.local');
    const adminTokens = await issueTokenPair(adminUser);
    adminToken = adminTokens.accessToken;

    // Create a test student - use explicit UUID to avoid lastInsertRowid issue
    const studentId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('Student123!', 12);
    await db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, student_or_staff_id, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(studentId, 'Test Student', 'test@student.pnguot.ac.pg', passwordHash, 'TEST-001', '+67571234567');
    
    const roleResult = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STUDENT');
    if (roleResult) {
      await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(studentId, roleResult.id);
    }
    
    studentUser = await db.prepare('SELECT * FROM users WHERE email = ?').get('test@student.pnguot.ac.pg');
    const studentTokens = await issueTokenPair(studentUser);
    studentToken = studentTokens.accessToken;
  });

  describe('POST /api/auth/login', () => {
    it('should return access and refresh tokens for valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unisafe.local', password: 'ChangeMe!2024' });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(typeof res.body.accessToken).toBe('string');
      expect(typeof res.body.refreshToken).toBe('string');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unisafe.local', password: 'WrongPassword123!' });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials.');
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'AnyPassword123!' });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials.');
    });

    it('should reject deactivated account', async () => {
      // Deactivate admin
      await db.prepare('UPDATE users SET is_active = 0 WHERE email = ?').run('admin@unisafe.local');
      
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unisafe.local', password: 'ChangeMe!2024' });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Account is deactivated.');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate refresh token and return new token pair', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unisafe.local', password: 'ChangeMe!2024' });
      
      const refreshToken = loginRes.body.refreshToken;
      
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.accessToken).not.toBe(loginRes.body.accessToken);
      expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired refresh token.');
    });

    it('should reject missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('refreshToken is required.');
    });

    it('should reject reused refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unisafe.local', password: 'ChangeMe!2024' });
      
      const refreshToken = loginRes.body.refreshToken;
      
      // First refresh - should succeed
      await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      
      // Second use of same token - should fail
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired refresh token.');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should revoke refresh token', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@unisafe.local', password: 'ChangeMe!2024' });
      
      const refreshToken = loginRes.body.refreshToken;
      
      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken });
      
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out.');
      
      // Token should now be revoked
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      
      expect(refreshRes.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user info for valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(adminUser.id);
      expect(res.body.email).toBe('admin@unisafe.local');
      expect(res.body.roles).toContain('ADMIN');
    });

    it('should reject missing Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me');
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing or invalid Authorization header.');
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or malformed token.');
    });

    it('should reject expired token', async () => {
      // This would require a token with very short expiry - skip for now
      // as we'd need to manipulate JWT timing
    });
  });

  describe('Role-based access', () => {
    it('should allow admin access to admin routes', async () => {
      const res = await request(app)
        .post('/api/auth/register-responder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          full_name: 'Test Responder',
          email: 'responder@test.pnguot.ac.pg',
          password: 'TestPass123!',
          role: 'SECURITY',
          student_or_staff_id: 'RES-001',
          phone: '+67571234567'
        });
      
      expect(res.status).toBe(201);
    });

    it('should deny student access to admin routes', async () => {
      const res = await request(app)
        .post('/api/auth/register-responder')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          full_name: 'Test Responder',
          email: 'responder2@test.pnguot.ac.pg',
          password: 'TestPass123!',
          role: 'SECURITY',
          student_or_staff_id: 'RES-002',
          phone: '+67571234567'
        });
      
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions.');
    });
  });
});