import db from '../config/db.js';
import crypto from 'crypto';

function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

// Columns that are safe to send over HTTP. `password_hash` is deliberately
// excluded so a user object can never leak the bcrypt hash by accident.
const PUBLIC_USER_COLUMNS = `u.id, u.email, u.full_name, u.student_or_staff_id, u.phone,
  u.avatar_url, u.is_active, u.last_login_at, u.created_at, u.updated_at, u.deleted_at`;

async function getUserWithRoles(id) {
  const user = await db.prepare(`
    SELECT ${PUBLIC_USER_COLUMNS} FROM users u WHERE u.id = ? AND u.deleted_at IS NULL
  `).get(id);

  if (!user) return null;

  const roles = (await db.prepare(`
    SELECT r.name FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).all(id)).map(r => r.name);

  return { ...user, roles };
}

export async function getUserById(id) {
  return getUserWithRoles(id);
}

export async function getUserByEmail(email) {
  const user = await db.prepare(`
    SELECT ${PUBLIC_USER_COLUMNS} FROM users u WHERE u.email = ? AND u.deleted_at IS NULL
  `).get(email);

  if (!user) return null;

  const roles = (await db.prepare(`
    SELECT r.name FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).all(user.id)).map(r => r.name);

  return { ...user, roles };
}

export async function listUsers(filters = {}) {
  const { role, is_active, limit = 50, offset = 0, search } = filters;
  
  const conditions = ['u.deleted_at IS NULL'];
  const params = [];

  if (role) {
    conditions.push(`EXISTS (
      SELECT 1 FROM user_roles ur2
      JOIN roles r2 ON r2.id = ur2.role_id
      WHERE ur2.user_id = u.id AND r2.name = ?
    )`);
    params.push(role);
  }
  if (is_active !== undefined) {
    conditions.push(`u.is_active = ?`);
    params.push(Boolean(is_active));
  }
  if (search) {
    conditions.push(`(u.full_name LIKE ? OR u.email LIKE ? OR u.student_or_staff_id LIKE ?)`);
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT ${PUBLIC_USER_COLUMNS}
    FROM users u
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const users = await db.prepare(query).all(...params);

  // Add roles to each user
  const usersWithRoles = [];
  for (const user of users) {
    const roles = (await db.prepare(`
      SELECT r.name FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).all(user.id)).map(r => r.name);
    usersWithRoles.push({ ...user, roles });
  }
  return usersWithRoles;
}

export async function countUsers(filters = {}) {
  const { role, is_active, search } = filters;
  
  const conditions = ['deleted_at IS NULL'];
  const params = [];

  if (role) {
    conditions.push(`EXISTS (
      SELECT 1 FROM user_roles ur2
      JOIN roles r2 ON r2.id = ur2.role_id
      WHERE ur2.user_id = users.id AND r2.name = ?
    )`);
    params.push(role);
  }
  if (is_active !== undefined) {
    conditions.push(`is_active = ?`);
    params.push(Boolean(is_active));
  }
  if (search) {
    conditions.push(`(full_name LIKE ? OR email LIKE ? OR student_or_staff_id LIKE ?)`);
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db.prepare(`SELECT COUNT(*) as count FROM users ${whereClause}`).get(...params);
  return result.count;
}

export async function updateUser(id, data, changedBy) {
  const allowedFields = ['full_name', 'email', 'student_or_staff_id', 'phone', 'avatar_url', 'is_active', 'password_hash'];
  const updates = [];
  const params = [];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      if (key === 'is_active') {
        updates.push(`${key} = ?`);
        params.push(Boolean(value));
      } else {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }
  }

  if (updates.length === 0) return getUserById(id);

  updates.push(`updated_at = ?`);
  params.push(now(), id);

  await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...params);

  return getUserById(id);
}

export async function assignUserRole(userId, roleName, assignedBy) {
  const roleResult = await db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName);
  if (!roleResult) {
    throw new Error(`Role ${roleName} not found`);
  }

  await db.prepare(`
    INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id, role_id) DO NOTHING
  `).run(userId, roleResult.id, assignedBy, now());

  return getUserById(userId);
}

export async function removeUserRole(userId, roleName) {
  const roleResult = await db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName);
  if (!roleResult) {
    throw new Error(`Role ${roleName} not found`);
  }

  await db.prepare(`DELETE FROM user_roles WHERE user_id = ? AND role_id = ?`).run(userId, roleResult.id);

  return getUserById(userId);
}

export async function getAllRoles() {
  return await db.prepare('SELECT * FROM roles ORDER BY id').all();
}

export async function userHasRole(userId, roleNames) {
  const placeholders = roleNames.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.name IN (${placeholders})
    ) AS has_role
  `).get(userId, ...roleNames);
  // Postgres returns a real boolean here; SQLite returns 0/1.
  return Boolean(result?.has_role);
}

export async function getUsersByRole(roleName) {
  const users = await db.prepare(`
    SELECT ${PUBLIC_USER_COLUMNS} FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name = ? AND u.deleted_at IS NULL AND u.is_active = 1
    ORDER BY u.full_name
  `).all(roleName);
  
  const usersWithRoles = [];
  for (const user of users) {
    const roles = (await db.prepare(`
      SELECT r.name FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).all(user.id)).map(r => r.name);
    usersWithRoles.push({ ...user, roles });
  }
  return usersWithRoles;
}

export default {
  getUserById,
  getUserByEmail,
  listUsers,
  countUsers,
  updateUser,
  assignUserRole,
  removeUserRole,
  getAllRoles,
  userHasRole,
  getUsersByRole,
};