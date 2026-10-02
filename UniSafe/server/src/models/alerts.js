import db, { arrayParameter, parseJson } from '../config/db.js';
import crypto from 'crypto';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

// Postgres returns SMALLINT[] as a real JS array; SQLite stores a JSON string.
function parseIdArray(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

// The column holds role *ids*, but the API speaks role *names*.
async function resolveRoleIds(roleNames) {
  if (!Array.isArray(roleNames) || roleNames.length === 0) return [];
  const ids = [];
  for (const name of roleNames) {
    const row = await db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
    if (row) ids.push(row.id);
  }
  return ids;
}

async function resolveRoleNames(roleIds) {
  const ids = Array.isArray(roleIds) ? roleIds : [];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT id, name FROM roles WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map(row => [Number(row.id), row.name]));
  // Preserve the stored order and drop ids whose role has since been deleted.
  return ids.map(id => byId.get(Number(id))).filter(Boolean);
}

/**
 * Present an alert row with `target_roles` as role *names*, which is the shape
 * the API has always used, and `target_role_ids` for internal callers.
 */
async function presentAlert(row) {
  if (!row) return row;
  const ids = parseIdArray(row.target_roles);
  return {
    ...row,
    target_role_ids: ids,
    target_roles: await resolveRoleNames(ids),
    target_all: Boolean(row.target_all),
    is_active: Boolean(row.is_active),
  };
}

export async function createAlert(data) {
  const {
    title,
    message,
    severity = 'Info',
    target_roles = [],
    target_all = false,
    sent_by,
    expires_at = null,
  } = data;

  const id = generateId();
  const roleIds = await resolveRoleIds(target_roles);

  await db.prepare(`
    INSERT INTO safety_alerts (id, title, message, severity, target_roles, target_all, sent_by, expires_at, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, message, severity, arrayParameter(roleIds), target_all, sent_by, expires_at, now(), now(), now());

  return getAlertById(id);
}

export async function getAlertById(id) {
  const result = await db.prepare(`
    SELECT a.*, u.full_name as sent_by_name
    FROM safety_alerts a
    LEFT JOIN users u ON u.id = a.sent_by
    WHERE a.id = ?
  `).get(id);

  return presentAlert(result);
}

export async function listAlerts(filters = {}) {
  const { is_active, severity, limit = 50, offset = 0 } = filters;
  
  const conditions = [];
  const params = [];

  if (is_active !== undefined) {
    conditions.push(`a.is_active = ?`);
    params.push(Boolean(is_active));
  }
  if (severity) {
    conditions.push(`a.severity = ?`);
    params.push(severity);
  }
  if (!is_active) {
    conditions.push(`(a.expires_at IS NULL OR a.expires_at > ?)`);
    params.push(now());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT a.*, u.full_name as sent_by_name
    FROM safety_alerts a
    LEFT JOIN users u ON u.id = a.sent_by
    ${whereClause}
    ORDER BY a.sent_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const results = await db.prepare(query).all(...params);
  return Promise.all(results.map(presentAlert));
}

export async function updateAlert(id, data) {
  const allowedFields = ['title', 'message', 'severity', 'target_roles', 'target_all', 'is_active', 'expires_at'];
  const updates = [];
  const params = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      if (key === 'target_roles') {
        const roleIds = await resolveRoleIds(value);
        updates.push(`${key} = ?`);
        params.push(arrayParameter(roleIds));
      } else if (key === 'target_all' || key === 'is_active') {
        updates.push(`${key} = ?`);
        params.push(Boolean(value));
      } else {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }
  }

  if (updates.length === 0) return getAlertById(id);

  updates.push(`updated_at = ?`);
  params.push(now(), id);

  await db.prepare(`UPDATE safety_alerts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return getAlertById(id);
}

export async function deleteAlert(id) {
  const result = await db.prepare(`DELETE FROM safety_alerts WHERE id = ?`).run(id);
  return result.changes > 0;
}

export async function getAlertsForUser(userId, userRoles) {
  const roleIds = [];
  for (const roleName of userRoles || []) {
    const roleResult = await db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName);
    if (roleResult) roleIds.push(Number(roleResult.id));
  }

  // Role targeting is filtered in JS: `json_array_length` does not exist in
  // Postgres and SMALLINT[] needs a different containment operator anyway.
  const alerts = await db.prepare(`
    SELECT a.*, u.full_name as sent_by_name,
       CASE WHEN ad.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
    FROM safety_alerts a
    LEFT JOIN users u ON u.id = a.sent_by
    LEFT JOIN alert_deliveries ad ON ad.alert_id = a.id AND ad.user_id = ?
    WHERE a.is_active = 1
      AND (a.expires_at IS NULL OR a.expires_at > ?)
    ORDER BY a.sent_at DESC
  `).all(userId, now());

  const targeted = alerts.filter(alert => {
    if (alert.target_all) return true;
    return parseIdArray(alert.target_roles).some(id => roleIds.includes(Number(id)));
  });

  return Promise.all(targeted.map(async (alert) => ({
    ...(await presentAlert(alert)),
    is_read: Boolean(alert.is_read),
  })));
}

export async function markAlertAsRead(alertId, userId) {
  await db.prepare(`
    INSERT INTO alert_deliveries (id, alert_id, user_id, read_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (alert_id, user_id) DO UPDATE SET read_at = ?
  `).run(generateId(), alertId, userId, now(), now());
}

export async function deliverAlertToUsers(alertId, userIds) {
  if (!userIds || userIds.length === 0) return;
  
  const stmt = db.prepare(`
    INSERT INTO alert_deliveries (id, alert_id, user_id, delivered_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (alert_id, user_id) DO NOTHING
  `);
  
  await db.transaction(async () => {
    for (const userId of userIds) {
      await stmt.run(generateId(), alertId, userId, now());
    }
  });
}

export default {
  createAlert,
  getAlertById,
  listAlerts,
  updateAlert,
  deleteAlert,
  getAlertsForUser,
  markAlertAsRead,
  deliverAlertToUsers,
};