import { verifyAccessToken } from './tokens.js';
import { getUserById } from './database.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }

  const token = authHeader.substring(7);
  try {
    const payload = verifyAccessToken(token);
    if (typeof payload.userId !== 'string') return res.status(401).json({ error: 'Invalid token subject.' });
    const user = await getUserById(payload.userId);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Account unavailable.' });
    req.user = { userId: user.id, roles: user.roles || [] };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired.' });
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Invalid or malformed token.' });
    }
    next(err);
  }
}

export function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const userRoles = req.user.roles || [];
    const hasRole = userRoles.some(r => allowed.has(r));
    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}
