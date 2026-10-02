import { describe, it, expect } from 'vitest';
import db, { parseJson, arrayParameter, splitSqlStatements, isPostgres } from '../src/config/db.js';
import { createUser, hashPassword } from '../src/auth/database.js';
import * as alertsModel from '../src/models/alerts.js';
import * as usersModel from '../src/models/users.js';
import * as auditModel from '../src/models/audit.js';
import * as incidentsModel from '../src/models/incidents.js';

// These cover the fixes that let one set of queries run on both SQLite and
// PostgreSQL, plus the hardening that keeps bcrypt hashes off the wire.
describe('Database portability', () => {
  describe('splitSqlStatements', () => {
    it('keeps a PL/pgSQL function body in one statement', () => {
      const sql = `
        CREATE FUNCTION bump() RETURNS trigger AS $$
        BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TABLE afterwards (id TEXT PRIMARY KEY);
      `;
      const statements = splitSqlStatements(sql);
      expect(statements).toHaveLength(2);
      expect(statements[0]).toContain('LANGUAGE plpgsql');
      expect(statements[1]).toContain('CREATE TABLE afterwards');
    });

    it('does not split on a semicolon inside a string literal', () => {
      const statements = splitSqlStatements(`INSERT INTO t (note) VALUES ('a; b');`);
      expect(statements).toHaveLength(1);
    });

    it('drops comment-only chunks', () => {
      const statements = splitSqlStatements(`-- just a comment\nSELECT 1;\n-- another\n`);
      expect(statements).toEqual(['SELECT 1']);
    });
  });

  describe('parseJson', () => {
    it('parses JSON text from SQLite', () => {
      expect(parseJson('[1,2]', [])).toEqual([1, 2]);
    });

    it('passes through a value the driver already decoded', () => {
      expect(parseJson([1, 2], [])).toEqual([1, 2]);
    });

    it('falls back on null or malformed input', () => {
      expect(parseJson(null, 'fallback')).toBe('fallback');
      expect(parseJson('{oops', [])).toEqual([]);
    });
  });

  it('arrayParameter matches the active engine', () => {
    expect(arrayParameter([1, 2])).toBe(isPostgres() ? [1, 2] : '[1,2]');
  });

  describe('alerts', () => {
    it('stores role names as role ids and returns booleans, not integers', async () => {
      const admin = await createUser({
        full_name: 'Alert Author', email: 'alert-author@example.com',
        password_hash: await hashPassword('Author123!'), role: 'ADMIN',
      });

      const alert = await alertsModel.createAlert({
        title: 'Targeted alert',
        message: 'Only staff should see this.',
        severity: 'Warning',
        target_roles: ['STAFF'],
        target_all: false,
        sent_by: admin.id,
      });

      const studentRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STUDENT');
      const staffRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STAFF');

      expect(Array.isArray(alert.target_roles)).toBe(true);
      expect(alert.target_roles).toEqual(['STAFF']);
      expect(alert.target_all).toBe(false);
      expect(alert.is_active).toBe(true);
      expect(studentRole.id).not.toBe(staffRole.id);
      expect(alert.target_role_ids).toEqual([staffRole.id]);
    });

    it('delivers an alert only to the targeted role', async () => {
      const admin = await createUser({
        full_name: 'Alert Author', email: 'alert-author-2@example.com',
        password_hash: await hashPassword('Author123!'), role: 'ADMIN',
      });
      const student = await createUser({
        full_name: 'Alert Student', email: 'alert-student@example.com',
        password_hash: await hashPassword('Student123!'), role: 'STUDENT',
      });
      const staff = await createUser({
        full_name: 'Alert Staff', email: 'alert-staff@example.com',
        password_hash: await hashPassword('Staff123!'), role: 'STAFF',
      });

      await alertsModel.createAlert({
        title: 'Staff only', message: 'Briefing at 3pm.', severity: 'Info',
        target_roles: ['STAFF'], sent_by: admin.id,
      });

      expect(await alertsModel.getAlertsForUser(staff.id, ['STAFF'])).toHaveLength(1);
      expect(await alertsModel.getAlertsForUser(student.id, ['STUDENT'])).toHaveLength(0);
    });

    it('broadcasts an alert with target_all', async () => {
      const admin = await createUser({
        full_name: 'Alert Author', email: 'alert-author-3@example.com',
        password_hash: await hashPassword('Author123!'), role: 'ADMIN',
      });
      const student = await createUser({
        full_name: 'Broadcast Student', email: 'broadcast-student@example.com',
        password_hash: await hashPassword('Student123!'), role: 'STUDENT',
      });

      await alertsModel.createAlert({
        title: 'Campus wide', message: 'Everyone sees this.', severity: 'Info',
        target_all: true, sent_by: admin.id,
      });

      expect(await alertsModel.getAlertsForUser(student.id, ['STUDENT'])).toHaveLength(1);
    });

    it('returns role names, not the stored role ids', async () => {
      const admin = await createUser({
        full_name: 'Alert Author', email: 'alert-author-5@example.com',
        password_hash: await hashPassword('Author123!'), role: 'ADMIN',
      });

      const alert = await alertsModel.createAlert({
        title: 'Name round trip', message: 'STAFF and SECURITY.',
        target_roles: ['STAFF', 'SECURITY'], sent_by: admin.id,
      });

      // The API contract is role names; the SMALLINT[] column is internal.
      expect(alert.target_roles).toEqual(['STAFF', 'SECURITY']);

      const staffRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('STAFF');
      const securityRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('SECURITY');
      expect(alert.target_role_ids).toEqual([staffRole.id, securityRole.id]);

      const reread = await alertsModel.getAlertById(alert.id);
      expect(reread.target_roles).toEqual(['STAFF', 'SECURITY']);

      const [listed] = await alertsModel.listAlerts({});
      expect(listed.target_roles).toEqual(['STAFF', 'SECURITY']);
    });

    it('keeps target_roles as names through updateAlert', async () => {
      const admin = await createUser({
        full_name: 'Alert Author', email: 'alert-author-6@example.com',
        password_hash: await hashPassword('Author123!'), role: 'ADMIN',
      });
      const alert = await alertsModel.createAlert({
        title: 'Initially STAFF', message: 'Staff only.', target_roles: ['STAFF'], sent_by: admin.id,
      });

      const updated = await alertsModel.updateAlert(alert.id, { target_roles: ['MEDICAL'] });
      expect(updated.target_roles).toEqual(['MEDICAL']);
    });

    it('updates targeting through updateAlert', async () => {
      const admin = await createUser({
        full_name: 'Alert Author', email: 'alert-author-4@example.com',
        password_hash: await hashPassword('Author123!'), role: 'ADMIN',
      });

      const alert = await alertsModel.createAlert({
        title: 'Initially broad', message: 'Everyone.', severity: 'Info',
        target_all: true, sent_by: admin.id,
      });

      const updated = await alertsModel.updateAlert(alert.id, { target_all: false, target_roles: ['SECURITY'] });
      const securityRole = await db.prepare('SELECT id FROM roles WHERE name = ?').get('SECURITY');

      expect(updated.target_all).toBe(false);
      expect(updated.target_roles).toEqual(['SECURITY']);
      expect(updated.target_role_ids).toEqual([securityRole.id]);
    });
  });

  describe('audit logs', () => {
    it('accepts object payloads and a real boolean for success', async () => {
      await createAuditEntry();
      const [log] = await auditModel.listAuditLogs({});
      expect(log).toBeTruthy();
      expect(log.success === true || log.success === 1).toBe(true);

      const failed = await auditModel.createAuditLog({
        action: 'LOGIN', resource_type: 'user', success: false, error_message: 'Invalid credentials',
      });
      expect(failed.success === false || failed.success === 0).toBe(true);
    });

    async function createAuditEntry() {
      return auditModel.createAuditLog({
        action: 'CREATE_INCIDENT', resource_type: 'incident', resource_id: 'INC-1',
        new_values: { title: 'Test', nested: { ok: true } }, success: true,
      });
    }
  });

  describe('incident stats', () => {
    it('returns numeric zero counts instead of null on an empty table', async () => {
      const stats = await incidentsModel.getIncidentStats();
      expect(stats.total).toBe(0);
      expect(stats.sos_count).toBe(0);
      expect(Number.isNaN(Number(stats.total))).toBe(false);
    });

    it('counts incidents by status, category and SOS flag', async () => {
      const reporter = await createUser({
        full_name: 'Stats Reporter', email: 'stats-reporter@example.com',
        password_hash: await hashPassword('Reporter123!'), role: 'STUDENT',
      });

      await incidentsModel.createIncident({
        reporter_id: reporter.id, category: 'Security', title: 'Counted one', description: 'First',
      });
      await incidentsModel.createIncident({
        reporter_id: reporter.id, category: 'Fire', title: 'Counted two', description: 'Second', is_sos: true,
      });

      const stats = await incidentsModel.getIncidentStats();
      expect(stats.total).toBe(2);
      expect(stats.submitted).toBe(2);
      expect(stats.security_count).toBe(1);
      expect(stats.fire_count).toBe(1);
      expect(stats.sos_count).toBe(1);
    });
  });

  describe('user queries', () => {
    it('never returns a password hash', async () => {
      await createUser({
        full_name: 'Hash Check', email: 'hash-check@example.com',
        password_hash: await hashPassword('Hash12345!'), role: 'STUDENT',
      });

      for (const user of [
        ...(await usersModel.listUsers({})),
        ...(await usersModel.getUsersByRole('STUDENT')),
        await usersModel.getUserByEmail('hash-check@example.com'),
      ]) {
        expect(user).toBeTruthy();
        expect(user.password_hash).toBeUndefined();
      }
    });

    it('reports role membership as a boolean on both engines', async () => {
      const user = await createUser({
        full_name: 'Role Check', email: 'role-check@example.com',
        password_hash: await hashPassword('Role12345!'), role: 'SECURITY',
      });

      expect(await usersModel.userHasRole(user.id, ['SECURITY'])).toBe(true);
      expect(await usersModel.userHasRole(user.id, ['ADMIN'])).toBe(false);
    });
  });
});