// REST is authoritative. Errors must never be replaced with sample data.
import { connectRealtime, disconnectRealtime, onRealtimeStatus, subscribeRealtime } from './realtime.js';

export const API_BASE = (import.meta.env?.VITE_API_URL ?? (import.meta.env?.DEV ? 'http://localhost:3001' : ''))
  .replace(/\/api\/?$/, '').replace(/\/+$/, '');
let accessToken;
let refreshToken;
let refreshFlight = null;
let sessionVersion = 0;
const sessionListeners = new Set();
function readStored(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writeStored(key, value) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch {} }
export function setToken(value) { accessToken = value || null; writeStored('uf_token', accessToken); }
// `== null` (not `=== undefined`) so a cleared session can be restored by a
// later sign-in without reloading the page.
export function getToken() { if (accessToken == null) accessToken = readStored('uf_token'); return accessToken; }
export function getRefreshToken() { if (refreshToken == null) refreshToken = readStored('uf_refresh_token'); return refreshToken; }
function storeSession(data) {
  if (!data.accessToken || !data.refreshToken) throw new Error('The server returned an incomplete session.');
  setToken(data.accessToken);
  refreshToken = data.refreshToken;
  writeStored('uf_refresh_token', refreshToken);
}
export function clearSession() {
  sessionVersion += 1;
  setToken(null);
  refreshToken = null;
  writeStored('uf_refresh_token', null);
  disconnectRealtime();
  sessionListeners.forEach(listener => listener());
}
export function onSessionEnded(listener) { sessionListeners.add(listener); return () => sessionListeners.delete(listener); }
export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'ApiError'; this.status = status; }
}
async function send(method, endpoint, body, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method, headers, signal: controller.signal, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status}).`, response.status);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.name === 'AbortError'
      ? 'The server did not respond in time. Please retry.'
      : 'Unable to reach the server. Check your connection and retry.');
  } finally { clearTimeout(timeout); }
}
export async function refreshAccessToken(token = getRefreshToken()) {
  if (refreshFlight) return refreshFlight;
  if (!token) { clearSession(); throw new ApiError('Your session expired. Please sign in again.', 401); }
  const version = sessionVersion;
  refreshFlight = (async () => {
    try {
      const data = await send('POST', '/api/auth/refresh', { refreshToken: token });
      if (version !== sessionVersion) throw new ApiError('This session has ended. Please sign in again.', 401);
      storeSession(data);
      return data;
    } catch (error) {
      if (version === sessionVersion && [400, 401, 403].includes(error.status)) clearSession();
      throw error;
    } finally { refreshFlight = null; }
  })();
  return refreshFlight;
}
async function req(method, endpoint, body) {
  const token = getToken();
  try { return await send(method, endpoint, body, token); }
  catch (error) {
    if (error.status !== 401) throw error;
    // A concurrent request may already have rotated this session.
    if (!getToken() || getToken() === token) await refreshAccessToken();
    try { return await send(method, endpoint, body, getToken()); }
    catch (retryError) { if (retryError.status === 401) clearSession(); throw retryError; }
  }
}
export async function login(email, password) {
  const data = await send('POST', '/api/auth/login', { email, password });
  sessionVersion += 1;
  storeSession(data);
  connectRealtime();
  return data;
}
export function getMe() { return req('GET', '/api/auth/me'); }
// The server revokes every refresh token on a password change and returns a
// fresh pair, so adopt it here or the next access-token refresh would fail.
export async function changePassword(currentPassword, newPassword) {
  const data = await send('POST', '/api/auth/change-password', { currentPassword, newPassword });
  storeSession(data);
  connectRealtime();
  return data;
}
export async function logout() {
  if (refreshFlight) await refreshFlight.catch(() => {});
  const token = getRefreshToken();
  clearSession();
  if (token) await send('POST', '/api/auth/logout', { refreshToken: token });
}
function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== null) params.append(key, String(value)); });
  return params.size ? `?${params}` : '';
}
function list(data, key) { return Array.isArray(data) ? data : (data[key] || []); }
function normalizeIncident(raw) {
  const anonymous = raw.is_anonymous === true || raw.is_anonymous === 1 || raw.anonymous === true;
  const submittedAt = raw.created_at || raw.submittedAt;
  return {
    ...raw, docId: raw.id, anonymous,
    reporter: anonymous ? 'Anonymous' : (raw.reporter_name || raw.reporter || 'Unknown'),
    userId: anonymous ? null : raw.reporter_id, assignee: raw.assignee_name || 'Unassigned',
    type: raw.category, desc: raw.description || raw.title, loc: raw.location_text || 'Location not supplied',
    submittedAt, createdAt: submittedAt, updatedAt: raw.updated_at,
    isSOS: raw.is_sos === true || raw.is_sos === 1,
    time: submittedAt ? new Date(submittedAt).toLocaleString('en-PG') : 'Unknown',
  };
}
function normalizeSos(raw) {
  const createdAt = raw.created_at || raw.createdAt;
  const hasCoords = raw.latitude != null && raw.longitude != null;
  return {
    ...raw,
    docId: raw.id,
    isSOS: true,
    type: 'Security',
    desc: 'Emergency SOS triggered',
    reporter: raw.reporter_name || raw.reporter || 'Unknown',
    assignee: raw.responder_name || 'Unassigned',
    loc: raw.location_text
      || (hasCoords ? `${Number(raw.latitude).toFixed(5)}, ${Number(raw.longitude).toFixed(5)}` : 'Location not supplied'),
    lat: hasCoords ? Number(raw.latitude) : null,
    lng: hasCoords ? Number(raw.longitude) : null,
    createdAt,
    updatedAt: raw.updated_at,
    time: createdAt ? new Date(createdAt).toLocaleString('en-PG') : 'Unknown',
  };
}
function normalizeUser(raw) {
  return {
    ...raw, docId: raw.id, name: raw.full_name || raw.name, roles: raw.roles || [],
    is_active: raw.is_active !== false && raw.is_active !== 0,
    role: (raw.roles || []).join(', ') || raw.role || 'User',
    status: raw.status || 'Duty status unavailable', cases: raw.cases ?? 'Unavailable',
  };
}
// Preserve last successful data and report refresh failures. Avoid overlapping polls.
// When the Socket.IO connection is healthy we refresh on push and back the poll
// off to a slow safety net; if the socket drops we fall back to the full interval
// so the page keeps working on a plain REST connection.
function subscribe(load, callback, onError = () => {}, interval = 5000, events = []) {
  let alive = true;
  let pending = false;
  let live = false;
  let timer = null;

  const delay = () => (live ? Math.max(interval, 30000) : interval);

  const schedule = () => {
    if (!alive) return;
    clearTimeout(timer);
    timer = setTimeout(tick, delay());
  };

  const tick = async () => {
    if (!alive || pending) return;
    pending = true;
    try { const data = await load(); if (alive) { callback(data); onError(null); } }
    catch (error) { if (alive) onError(error); }
    finally { pending = false; schedule(); }
  };

  const stopStatus = onRealtimeStatus((status) => { live = status === 'connected'; });
  const stopEvents = events.map((event) => subscribeRealtime(event, () => tick()));
  connectRealtime();
  tick();

  return () => {
    alive = false;
    clearTimeout(timer);
    stopStatus();
    stopEvents.forEach((stop) => stop());
  };
}

const LIVE_EVENTS = ['incident-update', 'sos-update'];

export async function getIncidents(filters = {}) { return list(await req('GET', `/api/incidents${buildQuery(filters)}`), 'incidents').map(normalizeIncident); }
export function subscribeIncidents(cb, filters = {}, onError, interval = 5000) {
  return subscribe(() => getIncidents(filters), cb, onError, interval, LIVE_EVENTS);
}
export async function getIncident(id) { return normalizeIncident(await req('GET', `/api/incidents/${encodeURIComponent(id)}`)); }
export async function addIncident(data) {
  const { id, docId, timeline, submitted_at, ...clean } = data;
  return normalizeIncident(await req('POST', '/api/incidents', clean));
}
export async function updateIncident(id, fields) { return normalizeIncident(await req('PATCH', `/api/incidents/${encodeURIComponent(id)}`, fields)); }
export async function updateIncidentStatus(id, status, note) { return normalizeIncident(await req('PATCH', `/api/incidents/${encodeURIComponent(id)}/status`, { status, note })); }
export async function assignIncident(id, assigneeId) { return normalizeIncident(await req('POST', `/api/incidents/${encodeURIComponent(id)}/assign`, { assignee_id: assigneeId })); }
export function deleteIncident(id) { return req('DELETE', `/api/incidents/${encodeURIComponent(id)}`); }
export async function getSOSEvents(filters = {}) {
  return list(await req('GET', `/api/sos${buildQuery(filters)}`), 'sos').map(normalizeSos);
}
export function subscribeSOSEvents(cb, filters = {}, onError, interval = 5000) {
  return subscribe(() => getSOSEvents(filters), cb, onError, interval, LIVE_EVENTS);
}
export function updateSOSStatus(id, status, note) {
  return req('PATCH', `/api/sos/${encodeURIComponent(id)}/status`, { status, note });
}
export async function getAlerts(filters = {}) { return list(await req('GET', `/api/alerts${buildQuery(filters)}`), 'alerts'); }
export function createAlert(data) { return req('POST', '/api/alerts', data); }
export function updateAlert(id, fields) { return req('PATCH', `/api/alerts/${encodeURIComponent(id)}`, fields); }
export function deleteAlert(id) { return req('DELETE', `/api/alerts/${encodeURIComponent(id)}`); }

// Alerts addressed to the signed-in user. Unlike /api/alerts, which is
// restricted to ADMIN and ICT_ADMIN, this works for every role - so the
// notification bell can show real alerts to security and medical responders
// instead of the placeholder list it used to render.
export async function getMyAlerts() { return list(await req('GET', '/api/alerts/my'), 'alerts'); }
export function markAlertRead(id) { return req('POST', `/api/alerts/my/${encodeURIComponent(id)}/read`); }
export function subscribeAlerts(cb, onError, interval = 10000) {
  return subscribe(() => getMyAlerts(), cb, onError, interval, ['alert-update']);
}
export async function getAssistance(filters = {}) { return list(await req('GET', `/api/assistance${buildQuery(filters)}`), 'requests'); }
export function subscribeAssistance(cb, filters = {}, onError, interval = 5000) {
  return subscribe(() => getAssistance(filters), cb, onError, interval, ['assistance-update']);
}
export async function getAppeals(filters = {}) { return list(await req('GET', `/api/appeals${buildQuery(filters)}`), 'appeals'); }
export function subscribeAppeals(cb, filters = {}, onError, interval = 5000) {
  return subscribe(() => getAppeals(filters), cb, onError, interval, ['appeal-update']);
}
export function updateAppealStatus(id, status, decision) { return req('PATCH', `/api/appeals/${encodeURIComponent(id)}/status`, { status, decision }); }
export async function getPersonnel() { return list(await req('GET', '/api/users/responders'), 'users').map(normalizeUser); }
export function subscribePersonnel(cb, onError) { return subscribe(getPersonnel, cb, onError); }
export async function getUsers(filters = {}) { return list(await req('GET', `/api/users${buildQuery(filters)}`), 'users').map(normalizeUser); }
export function subscribeUsers(cb, filters = {}, onError) { return subscribe(() => getUsers(filters), cb, onError, 10000); }
export async function updateUser(id, fields) { return normalizeUser(await req('PATCH', `/api/users/${encodeURIComponent(id)}`, fields)); }
export async function assignUserRole(id, role) { return normalizeUser(await req('POST', `/api/users/${encodeURIComponent(id)}/roles`, { role })); }
export async function removeUserRole(id, role) { return normalizeUser(await req('DELETE', `/api/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(role)}`)); }
export function resetUserPassword(id, password) { return req('POST', `/api/users/${encodeURIComponent(id)}/reset-password`, { new_password: password }); }
export function getDashboardStats() { return req('GET', '/api/dashboard/stats'); }
export function getDashboardRecent() { return req('GET', '/api/dashboard/recent'); }
export async function getAuditLogs(filters = {}) { return list(await req('GET', `/api/audit-logs${buildQuery(filters)}`), 'logs'); }

// Public health probe. Used by the dashboard banner to tell the operator
// whether the backend is reachable at all.
export function getHealth() { return send('GET', '/api/health', undefined, null); }

export { onRealtimeStatus, connectRealtime };
