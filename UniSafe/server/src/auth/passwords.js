import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email);
}

export function meetsPasswordStrength(password) {
  if (!password || typeof password !== 'string' || password.length < 8) return false;
  if (!/\d/.test(password)) return false;
  return true;
}
