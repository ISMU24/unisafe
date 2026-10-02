import db from '../config/db.js';
import crypto from 'crypto';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function createSosEvent(data) {
  const {
    reporter_id,
    latitude,
    longitude,
    location_text,
  } = data;

  const id = generateId();
  
  await db.prepare(`
    INSERT INTO sos_events (id, reporter_id, latitude, longitude, location_text, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)
  `).run(id, reporter_id, latitude, longitude, location_text, now(), now());

  await db.prepare(`
    INSERT INTO sos_status_history (id, sos_id, old_status, new_status, changed_by, note, created_at)
    VALUES (?, ?, NULL, 'Active', ?, 'SOS alert triggered. Help is on the way.', ?)
  `).run(generateId(), id, reporter_id, now());

  return getSosEventById(id);
}

export async function getSosEventById(id) {
  const result = await db.prepare(`
    SELECT s.*, 
       u.full_name as reporter_name, u.student_or_staff_id as reporter_id_str,
       a.full_name as acknowledged_by_name,
       r.full_name as responder_name
    FROM sos_events s
    LEFT JOIN users u ON u.id = s.reporter_id
    LEFT JOIN users a ON a.id = s.acknowledged_by
    LEFT JOIN users r ON r.id = s.responder_id
    WHERE s.id = ?
  `).get(id);
  return result || null;
}

export async function listSosEvents(filters = {}) {
  const { status, limit = 50, offset = 0 } = filters;
  
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push(`s.status = ?`);
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT s.*, 
       u.full_name as reporter_name, u.student_or_staff_id as reporter_id_str,
       a.full_name as acknowledged_by_name,
       r.full_name as responder_name
    FROM sos_events s
    LEFT JOIN users u ON u.id = s.reporter_id
    LEFT JOIN users a ON a.id = s.acknowledged_by
    LEFT JOIN users r ON r.id = s.responder_id
    ${whereClause}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return await db.prepare(query).all(...params);
}

export async function updateSosStatus(id, status, changedBy, note = '') {
  const sos = await getSosEventById(id);
  if (!sos) return null;

  const timestampUpdates = [];
  const params = [];

  if (status === 'Acknowledged') {
    timestampUpdates.push('acknowledged_at = ?', 'acknowledged_by = ?');
    params.push(now(), changedBy);
  }
  if (status === 'Responding') {
    timestampUpdates.push('responding_at = ?', 'responder_id = ?');
    params.push(now(), changedBy);
  }
  if (status === 'Resolved') {
    timestampUpdates.push('resolved_at = ?');
    params.push(now());
  }
  if (status === 'Cancelled') {
    timestampUpdates.push('cancelled_at = ?', 'cancellation_reason = ?');
    params.push(now(), note || 'Cancelled by user/responder');
  }

  timestampUpdates.push('updated_at = ?', 'status = ?');
  params.push(now(), status, id);

  await db.prepare(`UPDATE sos_events SET ${timestampUpdates.join(', ')} WHERE id = ?`).run(...params);

  await db.prepare(`
    INSERT INTO sos_status_history (id, sos_id, old_status, new_status, changed_by, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(generateId(), id, sos.status, status, changedBy, note, now());

  return getSosEventById(id);
}

export async function getSosStatusHistory(id) {
  return await db.prepare(`
    SELECT ssh.*, u.full_name as changed_by_name
    FROM sos_status_history ssh
    LEFT JOIN users u ON u.id = ssh.changed_by
    WHERE ssh.sos_id = ?
    ORDER BY ssh.created_at ASC
  `).all(id);
}

export async function getActiveSosCount() {
  const result = await db.prepare(`SELECT COUNT(*) as count FROM sos_events WHERE status IN ('Active', 'Acknowledged', 'Responding')`).get();
  return result.count;
}

export default {
  createSosEvent,
  getSosEventById,
  listSosEvents,
  updateSosStatus,
  getSosStatusHistory,
  getActiveSosCount,
};