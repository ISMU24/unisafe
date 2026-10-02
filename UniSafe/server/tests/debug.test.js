import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import db, { initializeDatabase, isPostgres } from '../src/config/db.js';

describe('Debug database state', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  beforeEach(async () => {
    if (!isPostgres()) {
      const tables = [
        'audit_logs', 'incident_assignments', 'incident_status_history',
        'incident_media', 'incidents', 'sos_status_history', 'sos_events',
        'alert_deliveries', 'safety_alerts', 'assistance_requests',
        'appeal_documents', 'appeals', 'refresh_tokens', 'user_roles', 'users'
      ];
      for (const table of tables) {
        try {
          await db.prepare(`DELETE FROM ${table}`).run();
        } catch (e) {
          // ignore
        }
      }
    }
  });

  it('should have roles after initialization', async () => {
    const roles = await db.prepare('SELECT * FROM roles').all();
    console.log('Roles:', roles);
    expect(roles.length).toBe(6);
  });

  it('should be able to create user with role', async () => {
    const crypto = await import('crypto');
    const bcrypt = await import('bcrypt');
    
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('Test123!', 12);
    
    await db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, student_or_staff_id, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, 'Test User', 'test@example.com', passwordHash, 'TEST-001', '+67571234567');
    
    const roleResult = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STUDENT');
    console.log('Role result:', roleResult);
    
    await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, roleResult.id);
    
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    console.log('User:', user);
    
    expect(user).toBeDefined();
  });
});