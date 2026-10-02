import db, { parseJson } from '../config/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

function generateId() {
  return crypto.randomUUID();
}

export async function getUserByEmail(email) {
  const result = await db.prepare(`
    SELECT u.*, 
      (SELECT json_group_array(r.name) 
       FROM user_roles ur 
       JOIN roles r ON r.id = ur.role_id 
       WHERE ur.user_id = u.id) as roles
    FROM users u
    WHERE u.email = ? AND u.deleted_at IS NULL
  `).get(email);
  
  if (result) {
    result.roles = parseJson(result.roles, []);
  }
  return result || null;
}

export async function getUserById(id) {
  const result = await db.prepare(`
    SELECT u.*, 
      (SELECT json_group_array(r.name) 
       FROM user_roles ur 
       JOIN roles r ON r.id = ur.role_id 
       WHERE ur.user_id = u.id) as roles
    FROM users u
    WHERE u.id = ? AND u.deleted_at IS NULL
  `).get(id);
  
  if (result) {
    result.roles = parseJson(result.roles, []);
  }
  return result || null;
}

export async function createUser({ full_name, email, password_hash, role, student_or_staff_id, phone }) {
  const userId = generateId();
  
  const userResult = await db.prepare(`
    INSERT INTO users (id, full_name, email, password_hash, student_or_staff_id, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, full_name, email, password_hash, student_or_staff_id || null, phone || null);
  
  if (userResult.changes === 0) {
    throw new Error('Failed to create user');
  }
  
  const roleResult = await db.prepare(`SELECT id FROM roles WHERE name = ?`).get(role || 'STUDENT');
  
  if (roleResult) {
    await db.prepare(`
      INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
      ON CONFLICT (user_id, role_id) DO NOTHING
    `).run(userId, roleResult.id);
  }
  
  return getUserById(userId);
}

export async function updateUserLastLogin(userId) {
  await db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(userId);
}

export async function storeRefreshToken(userId, tokenHash, expiresAt) {
  const id = generateId();
  await db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, tokenHash, expiresAt);
  return id;
}

export async function getRefreshTokenByHash(tokenHash) {
  const result = await db.prepare(`
    SELECT * FROM refresh_tokens 
    WHERE token_hash = ? AND revoked = 0 AND expires_at > datetime('now')
  `).get(tokenHash);
  return result || null;
}

export async function revokeRefreshTokenByHash(tokenHash) {
  const result = await db.prepare(`
    UPDATE refresh_tokens SET revoked = 1, revoked_at = datetime('now')
    WHERE token_hash = ? AND revoked = 0
  `).run(tokenHash);
  return result.changes;
}

export async function revokeAllUserRefreshTokens(userId) {
  await db.prepare(`
    UPDATE refresh_tokens SET revoked = 1, revoked_at = datetime('now')
    WHERE user_id = ? AND revoked = 0
  `).run(userId);
}

export async function seedInitialAdmin() {
  const existing = await db.prepare(`
    SELECT u.id FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.name = 'ADMIN' AND u.deleted_at IS NULL
    LIMIT 1
  `).get();
  
  if (existing) return null;

  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  // A weak default admin password would be a public backdoor once the API is
  // deployed, so the bootstrap account requires explicit, valid credentials.
  // Accounts created by `npm run db:seed` already exist, so this is skipped.
  if (!email || !password || !isValidEmail(email) || !meetsPasswordStrength(password)) {
    console.warn(
      'Skipped initial admin creation: set INITIAL_ADMIN_EMAIL and a strong INITIAL_ADMIN_PASSWORD ' +
      '(8+ characters with a number), or run "npm run db:seed" instead.'
    );
    return null;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  return createUser({
    full_name: 'Security Admin',
    email,
    password_hash: passwordHash,
    role: 'ADMIN',
    student_or_staff_id: 'ADM-0001',
  });
}

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function isValidEmail(email) {
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

export function meetsPasswordStrength(password) {
  if (!password || typeof password !== 'string' || password.length < 8) return false;
  if (!/\d/.test(password)) return false;
  return true;
}

export function generateTokenHash() {
  return crypto.randomBytes(32).toString('hex');
}