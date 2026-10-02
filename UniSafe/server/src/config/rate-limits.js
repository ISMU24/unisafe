import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Read a numeric limit from the environment, falling back rather than throwing.
 * A typo in a rate-limit variable should not stop the server from booting.
 */
function integer(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    console.warn(`Ignoring invalid ${name}=${raw}; using ${fallback}.`);
    return fallback;
  }
  return value;
}

export function limiter(name, fallback, options = {}) {
  return rateLimit({
    windowMs: integer(`${name}_RATE_LIMIT_WINDOW_MS`, process.env.RATE_LIMIT_WINDOW_MS || 900000, 1000, 3600000),
    limit: integer(`${name}_RATE_LIMIT_MAX_REQUESTS`, fallback, 1, 100000),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
    ...options,
  });
}

// Login is keyed by IP *and* the submitted email. Keying on IP alone means one
// confused user on a shared campus NAT address could lock every other student
// out of their account at the same time.
const loginKey = req =>
  `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').trim().toLowerCase()}`;

export const loginLimiter = limiter('LOGIN', 10, { skipSuccessfulRequests: true, keyGenerator: loginKey });
export const refreshLimiter = limiter('REFRESH', 120);
// A busy campus sits behind one public address, so the general limit has to be
// sized for the whole institution rather than a single device.
export const apiLimiter = limiter('API', process.env.RATE_LIMIT_MAX_REQUESTS || 5000);
export const uploadLimiter = limiter('UPLOAD', 60, { keyGenerator: req => req.user?.userId || ipKeyGenerator(req.ip) });
export const aiLimiter = limiter('AI', 30, { keyGenerator: req => req.user?.userId || ipKeyGenerator(req.ip) });