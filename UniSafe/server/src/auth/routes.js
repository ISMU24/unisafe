import crypto from 'node:crypto';
import express from 'express';
import { loginLimiter, refreshLimiter } from '../config/rate-limits.js';
import z from 'zod';
import { getUserByEmail, createUser, getUserById, updateUserLastLogin, hashPassword, comparePassword, isValidEmail, meetsPasswordStrength, seedInitialAdmin, revokeAllUserRefreshTokens } from './database.js';
import { issueTokenPair, rotateRefreshToken, revokeRefreshToken } from './tokens.js';
import { requireAuth, requireRole } from './middleware.js';
import { createAuditLog } from '../models/audit.js';
import * as usersModel from '../models/users.js';

const router = express.Router();
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const loginRateLimiter = loginLimiter;

const registerSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).regex(/\d/),
  student_or_staff_id: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const DUMMY_HASH = await hashPassword(crypto.randomBytes(32).toString('hex'));

async function auditLog(req, action, resourceType, resourceId, oldValues, newValues, success = true, errorMessage) {
  try {
    (await createAuditLog({
      user_id: req.user?.userId || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      success,
      error_message: errorMessage,
    }));
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// ── Auth ──

router.post('/register', loginLimiter, asyncHandler(async (req, res) => {
  const parseResult = registerSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
  }

  const { full_name, email, password, student_or_staff_id, phone } = parseResult.data;

  const existing = await getUserByEmail(email);
  if (existing) {
    (await auditLog(req, 'REGISTER', 'user', null, null, { email }, false, 'Email already registered'));
    return res.status(409).json({ error: 'Email already registered.' });
  }

  try {
    const password_hash = await hashPassword(password);
    const user = await createUser({ full_name, email, password_hash, role: 'STUDENT', student_or_staff_id: student_or_staff_id || null, phone });
    (await auditLog(req, 'REGISTER', 'user', user.id, null, { email, full_name, role: 'STUDENT' }));
    res.status(201).json({ message: 'Registration successful. Please log in.', userId: user.id });
  } catch (err) {
    console.error('register error:', err.message);
    (await auditLog(req, 'REGISTER', 'user', null, null, { email }, false, err.message));
    res.status(500).json({ error: 'Internal server error.' });
  }
}));

router.post('/register-responder', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), asyncHandler(async (req, res) => {
  const { full_name, email, password, role, student_or_staff_id, phone } = req.body || {};

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email, and password are required.' });
  }
  if (!['SECURITY', 'MEDICAL', 'ADMIN', 'ICT_ADMIN', 'STAFF'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (!meetsPasswordStrength(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters and contain at least one number.' });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered.' });
  }

  try {
    const password_hash = await hashPassword(password);
    const user = await createUser({ full_name, email, password_hash, role, student_or_staff_id: student_or_staff_id || null, phone });
    (await auditLog(req, 'CREATE_USER', 'user', user.id, null, { email, full_name, role }));
    res.status(201).json({ message: 'Account created.', userId: user.id });
  } catch (err) {
    console.error('register-responder error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
}));

router.post('/login', loginRateLimiter, asyncHandler(async (req, res) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
  }

  const { email, password } = parseResult.data;

  const user = await getUserByEmail(email);
  let valid = false;

  if (user) {
    valid = await comparePassword(password, user.password_hash);
  } else {
    await comparePassword(password, DUMMY_HASH);
  }

  if (!user || !valid) {
    (await auditLog(req, 'LOGIN', 'user', null, null, { email }, false, 'Invalid credentials'));
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (!user.is_active) {
    (await auditLog(req, 'LOGIN', 'user', user.id, null, { email }, false, 'Account deactivated'));
    return res.status(403).json({ error: 'Account is deactivated.' });
  }

  await updateUserLastLogin(user.id);

  const tokens = (await issueTokenPair(user));
  (await auditLog(req, 'LOGIN', 'user', user.id, null, { email, roles: user.roles }));
  res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
}));

router.post('/refresh', refreshLimiter, asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ error: 'refreshToken is required.' });
  }

  try {
    const tokens = (await rotateRefreshToken(refreshToken));
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try { (await revokeRefreshToken(refreshToken)); } catch {}
  }
  res.json({ message: 'Logged out.' });
}));

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(/\d/),
});

// POST /api/auth/change-password - Self-service password change.
// Reuses loginLimiter so the current password cannot be brute-forced.
router.post('/change-password', requireAuth, loginRateLimiter, asyncHandler(async (req, res) => {
  const parseResult = changePasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
  }

  const { currentPassword, newPassword } = parseResult.data;
  const user = await getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const matches = await comparePassword(currentPassword, user.password_hash);
  if (!matches) {
    (await auditLog(req, 'CHANGE_PASSWORD', 'user', user.id, null, null, false, 'Incorrect current password'));
    return res.status(401).json({ error: 'Your current password is incorrect.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'The new password must be different from the current one.' });
  }

  const password_hash = await hashPassword(newPassword);
  await usersModel.updateUser(user.id, { password_hash }, user.id);
  // Revoke every other session, then hand back a fresh pair so the caller is
  // not logged out by their own password change.
  await revokeAllUserRefreshTokens(user.id);

  const tokens = await issueTokenPair(user);
  (await auditLog(req, 'CHANGE_PASSWORD', 'user', user.id, null, { self_service: true }));
  res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({
    userId: user.id,
    fullName: user.full_name,
    email: user.email,
    roles: user.roles,
    studentOrStaffId: user.student_or_staff_id,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    isActive: user.is_active,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
  });
}));

export default router;