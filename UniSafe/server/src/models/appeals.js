import db from '../config/db.js';
import crypto from 'crypto';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function createAppeal(data) {
  const {
    appellant_id,
    related_incident_id,
    type = 'Other',
    title,
    description,
  } = data;

  const id = generateId();
  
  await db.prepare(`
    INSERT INTO appeals (id, appellant_id, related_incident_id, type, title, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'Submitted', ?, ?)
  `).run(id, appellant_id, related_incident_id, type, title, description, now(), now());

  return getAppealById(id);
}

export async function getAppealById(id) {
  const result = await db.prepare(`
    SELECT a.*, 
       u.full_name as appellant_name, u.student_or_staff_id as appellant_id_str,
       r.full_name as reviewer_name,
       i.title as incident_title
    FROM appeals a
    LEFT JOIN users u ON u.id = a.appellant_id
    LEFT JOIN users r ON r.id = a.reviewer_id
    LEFT JOIN incidents i ON i.id = a.related_incident_id
    WHERE a.id = ?
  `).get(id);
  return result || null;
}

export async function listAppeals(filters = {}) {
  const { status, type, appellant_id, reviewer_id, limit = 50, offset = 0 } = filters;
  
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push(`a.status = ?`);
    params.push(status);
  }
  if (type) {
    conditions.push(`a.type = ?`);
    params.push(type);
  }
  if (appellant_id) {
    conditions.push(`a.appellant_id = ?`);
    params.push(appellant_id);
  }
  if (reviewer_id) {
    conditions.push(`a.reviewer_id = ?`);
    params.push(reviewer_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT a.*, 
       u.full_name as appellant_name, u.student_or_staff_id as appellant_id_str,
       r.full_name as reviewer_name,
       i.title as incident_title
    FROM appeals a
    LEFT JOIN users u ON u.id = a.appellant_id
    LEFT JOIN users r ON r.id = a.reviewer_id
    LEFT JOIN incidents i ON i.id = a.related_incident_id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return await db.prepare(query).all(...params);
}

export async function updateAppealStatus(id, status, reviewerId, decision = '') {
  const allowedStatuses = ['Under Review', 'Additional Info Required', 'Approved', 'Rejected', 'Closed'];
  if (!allowedStatuses.includes(status)) {
    throw new Error('Invalid appeal status');
  }

  const updates = ['status = ?', 'updated_at = ?'];
  const params = [status, now()];

  if (reviewerId) {
    updates.push(`reviewer_id = ?`);
    params.push(reviewerId);
  }
  if (decision) {
    updates.push(`decision = ?`);
    params.push(decision);
  }
  if (['Approved', 'Rejected', 'Closed'].includes(status)) {
    updates.push(`decided_at = ?`);
    params.push(now());
  }

  params.push(id);
  await db.prepare(`UPDATE appeals SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return getAppealById(id);
}

export async function addAppealDocument(appealId, fileUrl, mimeType, fileSize, uploadedBy) {
  const id = generateId();
  await db.prepare(`
    INSERT INTO appeal_documents (id, appeal_id, file_url, mime_type, file_size, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, appealId, fileUrl, mimeType, fileSize, uploadedBy, now());
  return await db.prepare(`SELECT * FROM appeal_documents WHERE id = ?`).get(id);
}

export async function getAppealDocuments(appealId) {
  return await db.prepare(`SELECT * FROM appeal_documents WHERE appeal_id = ? ORDER BY created_at ASC`).all(appealId);
}

export default {
  createAppeal,
  getAppealById,
  listAppeals,
  updateAppealStatus,
  addAppealDocument,
  getAppealDocuments,
};