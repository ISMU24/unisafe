import db from '../config/db.js';
import { revokeAllUserRefreshTokens } from '../auth/database.js';

const TABLES = {
  incident: 'incidents',
  sos: 'sos_events',
  alert: 'safety_alerts',
  assistance: 'assistance_requests',
  appeal: 'appeals',
  user: 'users',
};

function now() {
  return new Date().toISOString();
}

export async function listRecycleBin() {
  const rows = await db.prepare(`
    SELECT id, 'incident' AS type, title AS label, deleted_at
      FROM incidents WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT id, 'sos' AS type, COALESCE(location_text, 'SOS alert') AS label, deleted_at
      FROM sos_events WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT id, 'alert' AS type, title AS label, deleted_at
      FROM safety_alerts WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT id, 'assistance' AS type, title AS label, deleted_at
      FROM assistance_requests WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT id, 'appeal' AS type, title AS label, deleted_at
      FROM appeals WHERE deleted_at IS NOT NULL
    UNION ALL
    SELECT id, 'user' AS type, full_name AS label, deleted_at
      FROM users WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `).all();
  return rows;
}

export async function listActiveRecords(currentUserId) {
  return db.prepare(`
    SELECT id, 'incident' AS type, title AS label, created_at
      FROM incidents WHERE deleted_at IS NULL
    UNION ALL
    SELECT id, 'sos' AS type, COALESCE(location_text, 'SOS alert') AS label, created_at
      FROM sos_events WHERE deleted_at IS NULL
    UNION ALL
    SELECT id, 'alert' AS type, title AS label, created_at
      FROM safety_alerts WHERE deleted_at IS NULL
    UNION ALL
    SELECT id, 'assistance' AS type, title AS label, created_at
      FROM assistance_requests WHERE deleted_at IS NULL
    UNION ALL
    SELECT id, 'appeal' AS type, title AS label, created_at
      FROM appeals WHERE deleted_at IS NULL
    UNION ALL
    SELECT id, 'user' AS type, full_name AS label, created_at
      FROM users WHERE deleted_at IS NULL AND id <> ?
    ORDER BY created_at DESC
  `).all(currentUserId);
}

async function isLastAdministrator(userId, roles) {
  for (const role of roles.filter(value => ['ADMIN', 'ICT_ADMIN'].includes(value))) {
    const other = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN users u ON u.id = ur.user_id
      WHERE r.name = ? AND u.id <> ? AND u.deleted_at IS NULL AND u.is_active = 1
    `).get(role, userId);
    if (other.count === 0) return true;
  }
  return false;
}

export async function moveToRecycleBin(type, id, actorId) {
  const table = TABLES[type];
  if (!table) throw new Error('Unsupported recycle-bin record type.');
  if (type === 'user' && id === actorId) {
    const error = new Error('You cannot delete your own account.');
    error.statusCode = 400;
    throw error;
  }

  return db.transaction(async () => {
    const record = await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id);
    if (!record) return null;

    if (type === 'user') {
      const roles = (await db.prepare(`
        SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?
      `).all(id)).map(row => row.name);
      if (await isLastAdministrator(id, roles)) {
        const error = new Error('Cannot delete the last active administrator for an assigned admin role.');
        error.statusCode = 400;
        throw error;
      }
    }

    const deletedAt = now();
    await db.prepare(`UPDATE ${table} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(deletedAt, id);
    if (type === 'user') await revokeAllUserRefreshTokens(id);
    return { ...record, deleted_at: deletedAt };
  });
}

export async function restoreFromRecycleBin(type, id) {
  const table = TABLES[type];
  if (!table) throw new Error('Unsupported recycle-bin record type.');
  const result = await db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  return result.changes > 0;
}

async function permanentlyDeleteUser(id) {
  // Remove rows whose required actor/requester references prevent deleting the
  // account. Records authored by this account are deleted as part of erasure.
  await db.prepare('DELETE FROM audit_logs WHERE user_id = ? OR (resource_type = ? AND resource_id = ?)').run(id, 'user', id);

  await db.prepare('DELETE FROM incident_assignments WHERE assignee_id = ? OR assigned_by = ?').run(id, id);
  await db.prepare('DELETE FROM incident_status_history WHERE changed_by = ?').run(id);
  await db.prepare('DELETE FROM incident_media WHERE uploaded_by = ?').run(id);
  await db.prepare('DELETE FROM incidents WHERE reporter_id = ?').run(id);

  await db.prepare('DELETE FROM sos_status_history WHERE changed_by = ?').run(id);
  await db.prepare('DELETE FROM sos_events WHERE reporter_id = ?').run(id);
  await db.prepare('UPDATE sos_events SET acknowledged_by = NULL WHERE acknowledged_by = ?').run(id);
  await db.prepare('UPDATE sos_events SET responder_id = NULL WHERE responder_id = ?').run(id);

  await db.prepare('DELETE FROM safety_alerts WHERE sent_by = ?').run(id);
  await db.prepare('DELETE FROM assistance_requests WHERE requester_id = ?').run(id);
  await db.prepare('UPDATE assistance_requests SET assignee_id = NULL WHERE assignee_id = ?').run(id);

  await db.prepare('DELETE FROM appeal_documents WHERE uploaded_by = ?').run(id);
  await db.prepare('DELETE FROM appeals WHERE appellant_id = ?').run(id);
  await db.prepare('UPDATE appeals SET reviewer_id = NULL WHERE reviewer_id = ?').run(id);

  const result = await db.prepare('DELETE FROM users WHERE id = ? AND deleted_at IS NOT NULL').run(id);
  return result.changes > 0;
}

export async function permanentlyDelete(type, id) {
  const table = TABLES[type];
  if (!table) throw new Error('Unsupported recycle-bin record type.');

  return db.transaction(async () => {
    if (type === 'user') {
      const roles = (await db.prepare(`
        SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?
      `).all(id)).map(row => row.name);
      if (await isLastAdministrator(id, roles)) {
        const error = new Error('Cannot permanently delete the last active administrator for an assigned admin role.');
        error.statusCode = 400;
        throw error;
      }
      return permanentlyDeleteUser(id);
    }
    const result = await db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
    return result.changes > 0;
  });
}

export default { listRecycleBin, listActiveRecords, moveToRecycleBin, restoreFromRecycleBin, permanentlyDelete };
