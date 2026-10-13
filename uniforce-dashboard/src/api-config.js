// Shared by Vite's build validation and the browser client. Never contains secrets.
export function resolveApiBase(value, { production = false, netlify = false } = {}) {
  const origin = typeof value === 'string' ? value.trim() : '';
  if (!origin) {
    if (!production) return ''; // Vite proxies /api and /socket.io in development.
    throw new Error('Dashboard API is not configured. Set VITE_API_URL to the backend HTTPS origin in the build environment and rebuild.');
  }
  // Explicit opt-in for the included nginx proxy; never valid on static Netlify.
  if (origin === '/' && !netlify) return '';
  let url;
  try { url = new URL(origin); } catch { /* diagnostic below */ }
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Invalid VITE_API_URL. Use only the backend origin (https://host), without /api, credentials, query or fragment.');
  }
  if (production && (url.protocol !== 'https:' || /^(localhost|.*\.localhost|127\..*|0\.0\.0\.0|\[::1\])$/i.test(url.hostname))) {
    throw new Error('Invalid production VITE_API_URL. A public HTTPS backend origin is required; localhost is development only.');
  }
  return url.origin;
}
