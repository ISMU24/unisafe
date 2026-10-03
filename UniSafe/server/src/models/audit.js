import db, { parseJson } from '../config/db.js';
import crypto from 'crypto';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function normalizeAudit(row) {
  return {
    ...row,
    old_values: parseJson(row.old_values, null),
    new_values: parseJson(row.new_values, null),
    success: Boolean(row.success),
  };
}

export async function createAuditLog(data) {
  const {
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values,
    ip_address,
    user_agent,
    success = true,
    error_message,
  } = data;

  const id = generateId();

  // JSON/boolean columns are handled by the driver: pg serialises objects to
  // jsonb and booleans natively, while SQLite gets JSON text and 0/1.
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent, success, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, user_id, action, resource_type, resource_id,
    old_values ?? null,
    new_values ?? null,
    ip_address, user_agent, Boolean(success), error_message, now());

  return normalizeAudit(await db.prepare(`SELECT * FROM audit_logs WHERE id = ?`).get(id));
}

export async function listAuditLogs(filters = {}) {
  const { user_id, action, resource_type, resource_id, success, start_date, end_date, limit = 100, offset = 0 } = filters;
  
  const conditions = [];
  const params = [];

  if (user_id) {
    conditions.push(`user_id = ?`);
    params.push(user_id);
  }
  if (action) {
    conditions.push(`action = ?`);
    params.push(action);
  }
  if (resource_type) {
    conditions.push(`resource_type = ?`);
    params.push(resource_type);
  }
  if (resource_id) {
    conditions.push(`resource_id = ?`);
    params.push(resource_id);
  }
  if (success !== undefined) {
    conditions.push(`success = ?`);
    params.push(Boolean(success));
  }
  if (start_date) {
    conditions.push(`created_at >= ?`);
    params.push(start_date);
  }
  if (end_date) {
    conditions.push(`created_at <= ?`);
    params.push(end_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT al.*, u.full_name as user_name, u.email as user_email
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const results = await db.prepare(query).all(...params);
  return results.map(normalizeAudit);
}

export default {
  createAuditLog,
  listAuditLogs,
};
