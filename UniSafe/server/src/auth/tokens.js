import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getUserById, storeRefreshToken, getRefreshTokenByHash, revokeRefreshTokenByHash } from './database.js';
import db from '../config/db.js';

/**
 * Read a numeric expiry from the environment, falling back rather than throwing,
 * so a typo cannot stop the server from booting.
 */
function expiry(name, fallback, maximum) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 60 || value > maximum) {
    console.warn(`Ignoring invalid ${name}=${process.env[name]}; using ${fallback}.`);
    return fallback;
  }
  return value;
}

const ACCESS_TOKEN_EXPIRES = expiry('JWT_ACCESS_EXPIRY', 900, 3600);
const REFRESH_TOKEN_EXPIRES = expiry('JWT_REFRESH_EXPIRY', 604800, 2592000);

// Refuse to start without signing secrets: an unset secret would otherwise
// surface much later as an opaque jwt error on the first login attempt.
// Render generateValue creates 32 random bytes encoded as 44 Base64 characters,
// which satisfies this minimum; no hex-only or fixed-length format is required.
if (process.env.NODE_ENV === 'production') {
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = process.env[name];
    if (!value || value.trim().length < 32 || new Set(value).size < 8 ||
        /change[-_ ]?me|replace[-_ ]?me|your[-_ ]?(?:access|refresh|jwt|secret)|example|for-testing-only/i.test(value)) {
      throw new Error(`${name} must be a strong, non-placeholder secret of at least 32 characters in production.`);
    }
  }
  if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.');
  }
}

export function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, roles: user.roles || [] },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES, issuer: 'unisafe', algorithm: 'HS256', jwtid: crypto.randomUUID() },
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, roles: user.roles || [] },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES, issuer: 'unisafe', algorithm: 'HS256', jwtid: crypto.randomUUID() },
  );
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, { issuer: 'unisafe', algorithms: ['HS256'] });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, { issuer: 'unisafe', algorithms: ['HS256'] });
}

export async function issueTokenPair(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000).toISOString();
  await storeRefreshToken(user.id, tokenHash, expiresAt);
  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(refreshToken) {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);
  return db.transaction(async () => {
    const stored = await getRefreshTokenByHash(tokenHash);
    if (!stored || stored.revoked || new Date(stored.expires_at).getTime() <= Date.now() || stored.user_id !== payload.userId) {
      throw new jwt.TokenExpiredError('Invalid or expired refresh token', new Date());
    }
    const user = await getUserById(payload.userId);
    if (!user || !user.is_active) throw new jwt.JsonWebTokenError('User unavailable');
    const revoked = await revokeRefreshTokenByHash(tokenHash);
    if (revoked !== 1) throw new jwt.JsonWebTokenError('Refresh token already used');
    return issueTokenPair(user);
  });
}

export function revokeRefreshToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  return revokeRefreshTokenByHash(tokenHash);
}
