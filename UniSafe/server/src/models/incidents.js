import db from '../config/db.js';
import crypto from 'crypto';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function createIncident(data) {
  const {
    reporter_id,
    category,
    title,
    description,
    latitude,
    longitude,
    location_text,
    priority = 'Medium',
    is_anonymous = false,
    is_sos = false,
    assignee_id = null,
  } = data;

  const id = generateId();
  
  await db.prepare(`
    INSERT INTO incidents (id, reporter_id, category, title, description, latitude, longitude,
       location_text, priority, is_anonymous, is_sos, assignee_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?)
  `).run(id, reporter_id, category, title, description, latitude, longitude, location_text, priority, Boolean(is_anonymous), Boolean(is_sos), assignee_id, now(), now());

  await db.prepare(`
    INSERT INTO incident_status_history (id, incident_id, old_status, new_status, changed_by, note, created_at)
    VALUES (?, ?, NULL, 'Submitted', ?, 'Report received by security office.', ?)
  `).run(generateId(), id, reporter_id, now());

  return getIncidentById(id);
}

export async function getIncidentById(id) {
  const result = await db.prepare(`
    SELECT i.*, 
       u.full_name as reporter_name, u.student_or_staff_id as reporter_id_str,
       a.full_name as assignee_name, a.student_or_staff_id as assignee_id_str
    FROM incidents i
    LEFT JOIN users u ON u.id = i.reporter_id
    LEFT JOIN users a ON a.id = i.assignee_id
    WHERE i.id = ? AND i.deleted_at IS NULL
  `).get(id);
  return result || null;
}

export async function listIncidents(filters = {}) {
  const { category, categories, status, priority, assignee_id, reporter_id, limit = 50, offset = 0, orderBy = 'created_at', orderDir = 'DESC' } = filters;
  
  const conditions = ['i.deleted_at IS NULL'];
  const params = [];

  if (categories && Array.isArray(categories) && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',');
    conditions.push(`i.category IN (${placeholders})`);
    params.push(...categories);
  } else if (category) {
    conditions.push(`i.category = ?`);
    params.push(category);
  }
  if (status) {
    conditions.push(`i.status = ?`);
    params.push(status);
  }
  if (priority) {
    conditions.push(`i.priority = ?`);
    params.push(priority);
  }
  if (assignee_id) {
    conditions.push(`i.assignee_id = ?`);
    params.push(assignee_id);
  }
  if (reporter_id) {
    conditions.push(`i.reporter_id = ?`);
    params.push(reporter_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const validOrderBy = ['created_at', 'updated_at', 'priority', 'status', 'category'];
  const validOrderDir = ['ASC', 'DESC'];
  const safeOrderBy = validOrderBy.includes(orderBy) ? orderBy : 'created_at';
  const safeOrderDir = validOrderDir.includes(orderDir.toUpperCase()) ? orderDir.toUpperCase() : 'DESC';

  const query = `
    SELECT i.*, 
       u.full_name as reporter_name, u.student_or_staff_id as reporter_id_str,
       a.full_name as assignee_name, a.student_or_staff_id as assignee_id_str
    FROM incidents i
    LEFT JOIN users u ON u.id = i.reporter_id
    LEFT JOIN users a ON a.id = i.assignee_id
    ${whereClause}
    ORDER BY i.${safeOrderBy} ${safeOrderDir}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return await db.prepare(query).all(...params);
}

export async function countIncidents(filters = {}) {
  const { category, categories, status, priority, assignee_id, reporter_id } = filters;
  
  const conditions = ['deleted_at IS NULL'];
  const params = [];

  if (categories && Array.isArray(categories) && categories.length > 0) {
    const placeholders = categories.map(() => '?').join(',');
    conditions.push(`category IN (${placeholders})`);
    params.push(...categories);
  } else if (category) {
    conditions.push(`category = ?`);
    params.push(category);
  }
  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  }
  if (priority) {
    conditions.push(`priority = ?`);
    params.push(priority);
  }
  if (assignee_id) {
    conditions.push(`assignee_id = ?`);
    params.push(assignee_id);
  }
  if (reporter_id) {
    conditions.push(`reporter_id = ?`);
    params.push(reporter_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.prepare(`SELECT COUNT(*) as count FROM incidents ${whereClause}`).get(...params);
  return result.count;
}

export async function updateIncident(id, data, changedBy) {
  const allowedFields = ['category', 'title', 'description', 'latitude', 'longitude', 'location_text', 'priority', 'status', 'assignee_id', 'is_anonymous'];
  const updates = [];
  const params = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updates.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (updates.length === 0) return getIncidentById(id);

  // Read the current status before the UPDATE so the history row records the
  // real transition. incident_status_history.old_status is enum-typed and the
  // enum has no 'Unknown' member, so the old default of 'Unknown' was rejected
  // outright by PostgreSQL and silently stored as text by SQLite.
  let previousStatus = null;
  if (data.status !== undefined && data.status !== null) {
    previousStatus = (await getIncidentById(id))?.status ?? data.old_status ?? null;
  }

  updates.push(`updated_at = ?`);
  params.push(now());
  params.push(id);

  const result = await db.prepare(
    `UPDATE incidents SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`
  ).run(...params);

  if (result.changes === 0) return null;

  // Handle status change history
  if (data.status) {
    await db.prepare(`
      INSERT INTO incident_status_history (id, incident_id, old_status, new_status, changed_by, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(generateId(), id, previousStatus, data.status, changedBy, data.note || '', now());

    // Update timestamp fields based on status
    const timestampUpdates = [];
    if (data.status === 'Acknowledged') timestampUpdates.push('acknowledged_at = ?');
    if (data.status === 'Assigned') timestampUpdates.push('assigned_at = ?');
    if (data.status === 'Responding') timestampUpdates.push('responding_at = ?');
    if (data.status === 'Resolved') timestampUpdates.push('resolved_at = ?');
    if (data.status === 'Closed') timestampUpdates.push('closed_at = ?');

    if (timestampUpdates.length > 0) {
      const tsParams = [now(), id];
      await db.prepare(`UPDATE incidents SET ${timestampUpdates.join(', ')} WHERE id = ?`).run(...tsParams);
    }

    // Handle assignment
    if (data.status === 'Assigned' && data.assignee_id) {
      await db.prepare(`
        INSERT INTO incident_assignments (id, incident_id, assignee_id, assigned_by, status, note, created_at)
        VALUES (?, ?, ?, ?, 'Assigned', ?, ?)
      `).run(generateId(), id, data.assignee_id, changedBy, data.note || 'Assigned via status update', now());
    }
  }

  return getIncidentById(id);
}

export async function updateIncidentStatus(id, status, changedBy, note = '') {
  const incident = await getIncidentById(id);
  if (!incident) return null;

  return updateIncident(id, { status, old_status: incident.status, note }, changedBy);
}

export async function assignIncident(id, assigneeId, assignedBy, note = '') {
  const incident = await getIncidentById(id);
  if (!incident) return null;

  await db.prepare(`
    UPDATE incidents SET assignee_id = ?, status = 'Assigned', assigned_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(assigneeId, now(), now(), id);

  await db.prepare(`
    INSERT INTO incident_status_history (id, incident_id, old_status, new_status, changed_by, note, created_at)
    VALUES (?, ?, ?, 'Assigned', ?, ?, ?)
  `).run(generateId(), id, incident.status, assignedBy, note || `Assigned to responder`, now());

  await db.prepare(`
    INSERT INTO incident_assignments (id, incident_id, assignee_id, assigned_by, status, note, created_at)
    VALUES (?, ?, ?, ?, 'Assigned', ?, ?)
  `).run(generateId(), id, assigneeId, assignedBy, note || 'Assigned via assignment endpoint', now());

  return getIncidentById(id);
}

export async function getIncidentStatusHistory(id) {
  return await db.prepare(`
    SELECT ish.*, u.full_name as changed_by_name
    FROM incident_status_history ish
    LEFT JOIN users u ON u.id = ish.changed_by
    WHERE ish.incident_id = ?
    ORDER BY ish.created_at ASC
  `).all(id);
}

export async function getIncidentMedia(id) {
  return await db.prepare(`SELECT * FROM incident_media WHERE incident_id = ? ORDER BY created_at ASC`).all(id);
}

export async function addIncidentMedia(incidentId, fileUrl, mimeType, fileSize, uploadedBy) {
  const id = generateId();
  await db.prepare(`
    INSERT INTO incident_media (id, incident_id, file_url, mime_type, file_size, uploaded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, incidentId, fileUrl, mimeType, fileSize, uploadedBy, now());
  return await db.prepare(`SELECT * FROM incident_media WHERE id = ?`).get(id);
}

export async function deleteIncident(id) {
  const result = await db.prepare(
    `UPDATE incidents SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`
  ).run(now(), now(), id);
  return result.changes > 0;
}

/** All-zero statistics, used when a caller has access to no category at all. */
function emptyStats() {
  return {
    total: 0, submitted: 0, received: 0, under_review: 0, assigned: 0,
    responding: 0, resolved: 0, closed: 0, sos_count: 0,
    security_count: 0, fire_count: 0, ambulance_count: 0, other_count: 0,
  };
}

/**
 * Aggregate incident counts.
 *
 * `filters` accepts the same `categories` and `reporter_id` narrowing that
 * `listIncidents` uses, so a responder's statistics can never reveal counts for
 * categories they are not allowed to list. Callers must pass the result of
 * `incidentFilters(req.user)` rather than calling this with no arguments.
 */
export async function getIncidentStats(filters = {}) {
  // Soft-deleted incidents are never counted, for anyone.
  const conditions = ['deleted_at IS NULL'];
  const params = [];

  if (Array.isArray(filters.categories)) {
    if (filters.categories.length === 0) return emptyStats();
    const placeholders = filters.categories.map(() => '?').join(',');
    conditions.push(`category IN (${placeholders})`);
    params.push(...filters.categories);
  }
  if (filters.reporter_id) {
    conditions.push('reporter_id = ?');
    params.push(filters.reporter_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // SUM(CASE ...) rather than COUNT(CASE ...): Postgres has no COUNT(CASE),
  // and SUM yields 0 instead of NULL on an empty table.
  const result = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) as submitted,
      SUM(CASE WHEN status = 'Received' THEN 1 ELSE 0 END) as received,
      SUM(CASE WHEN status = 'Under Review' THEN 1 ELSE 0 END) as under_review,
      SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as assigned,
      SUM(CASE WHEN status = 'Responding' THEN 1 ELSE 0 END) as responding,
      SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN is_sos = 1 THEN 1 ELSE 0 END) as sos_count,
      SUM(CASE WHEN category = 'Security' THEN 1 ELSE 0 END) as security_count,
      SUM(CASE WHEN category = 'Fire' THEN 1 ELSE 0 END) as fire_count,
      SUM(CASE WHEN category = 'Ambulance' THEN 1 ELSE 0 END) as ambulance_count,
      SUM(CASE WHEN category = 'Other' THEN 1 ELSE 0 END) as other_count
    FROM incidents
    ${whereClause}
  `).get(...params);

  const stats = result || {};
  Object.keys(stats).forEach((key) => { stats[key] = Number(stats[key] || 0); });
  return stats;
}

export default {
  createIncident,
  getIncidentById,
  listIncidents,
  countIncidents,
  updateIncident,
  updateIncidentStatus,
  assignIncident,
  getIncidentStatusHistory,
  getIncidentMedia,
  addIncidentMedia,
  deleteIncident,
  getIncidentStats,
};