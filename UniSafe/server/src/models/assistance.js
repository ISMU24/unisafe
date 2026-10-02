import db from '../config/db.js';
import crypto from 'crypto';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function createAssistanceRequest(data) {
  const {
    requester_id,
    type = 'General',
    title,
    description,
    latitude,
    longitude,
    location_text,
    priority = 'Medium',
  } = data;

  const id = generateId();
  
  await db.prepare(`
    INSERT INTO assistance_requests (id, requester_id, type, title, description, latitude, longitude, location_text, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
  `).run(id, requester_id, type, title, description, latitude, longitude, location_text, priority, now(), now());

  return getAssistanceRequestById(id);
}

export async function getAssistanceRequestById(id) {
  const result = await db.prepare(`
    SELECT ar.*, 
       u.full_name as requester_name, u.student_or_staff_id as requester_id_str,
       a.full_name as assignee_name
    FROM assistance_requests ar
    LEFT JOIN users u ON u.id = ar.requester_id
    LEFT JOIN users a ON a.id = ar.assignee_id
    WHERE ar.id = ?
  `).get(id);
  return result || null;
}

export async function listAssistanceRequests(filters = {}) {
  const { status, type, assignee_id, requester_id, limit = 50, offset = 0 } = filters;
  
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push(`ar.status = ?`);
    params.push(status);
  }
  if (type) {
    conditions.push(`ar.type = ?`);
    params.push(type);
  }
  if (assignee_id) {
    conditions.push(`ar.assignee_id = ?`);
    params.push(assignee_id);
  }
  if (requester_id) {
    conditions.push(`ar.requester_id = ?`);
    params.push(requester_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT ar.*, 
       u.full_name as requester_name, u.student_or_staff_id as requester_id_str,
       a.full_name as assignee_name
    FROM assistance_requests ar
    LEFT JOIN users u ON u.id = ar.requester_id
    LEFT JOIN users a ON a.id = ar.assignee_id
    ${whereClause}
    ORDER BY ar.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return await db.prepare(query).all(...params);
}

export async function updateAssistanceRequest(id, data, changedBy) {
  const allowedFields = ['type', 'title', 'description', 'latitude', 'longitude', 'location_text', 'priority', 'status', 'assignee_id'];
  const updates = [];
  const params = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updates.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (updates.length === 0) return getAssistanceRequestById(id);

  updates.push(`updated_at = ?`);
  params.push(now());

  if (data.status === 'Completed') {
    updates.push(`completed_at = ?`);
    params.push(now());
  }
  if (data.status === 'Assigned' && data.assignee_id) {
    updates.push(`assignee_id = ?`);
    params.push(data.assignee_id);
  }

  params.push(id);
  await db.prepare(`UPDATE assistance_requests SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return getAssistanceRequestById(id);
}

export default {
  createAssistanceRequest,
  getAssistanceRequestById,
  listAssistanceRequests,
  updateAssistanceRequest,
};