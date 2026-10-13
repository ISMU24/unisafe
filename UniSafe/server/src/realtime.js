import { Server } from 'socket.io';
import { verifyAccessToken, sessionMatches } from './auth/tokens.js';
import { getUserById } from './auth/database.js';
import { presentIncident, canViewIncident, isAdministrator } from './auth/incident-access.js';

const RESPONDER_ROLES = ['ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'];
let io = null;
export function isResponder(roles) { return (roles || []).some(role => RESPONDER_ROLES.includes(role)); }
async function authenticate(token) {
  try {
    if (typeof token !== 'string' || !token) return null;
    const payload = verifyAccessToken(token);
    if (typeof payload.userId !== 'string') return null;
    const user = await getUserById(payload.userId);
    if (!sessionMatches(payload, user)) return null;
    return { userId: user.id, roles: user.roles || [], expiresAt: payload.exp * 1000 };
  } catch { return null; }
}
export function initRealtime(server, { corsOptions, allowRequest } = {}) {
  io = new Server(server, { cors: corsOptions, allowRequest });
  io.use(async (socket, next) => {
    const session = await authenticate(socket.handshake?.auth?.token);
    if (!session) return next(new Error('unauthorized'));
    socket.data.user = session;
    next();
  });
  io.on('connection', socket => {
    const { userId, roles, expiresAt } = socket.data.user;
    const rooms = new Set([`user:${userId}`, ...roles.map(role => `role:${role}`)]);
    if (isResponder(roles)) rooms.add('responders');
    rooms.forEach(room => socket.join(room));
    // Legacy clients can only rejoin rooms originally assigned by the server.
    // Delivery independently checks current permissions; rooms grant no access.
    socket.on('join-room', room => { if (rooms.has(room)) socket.join(room); });
    socket.on('leave-room', room => { if (rooms.has(room)) socket.leave(room); });
    const expiry = setTimeout(() => {
      socket.emit('session-expired');
      socket.disconnect(true);
    }, Math.max(0, expiresAt - Date.now()));
    expiry.unref();
    socket.on('disconnect', () => clearTimeout(expiry));
  });
  return io;
}
export function getIo() { return io; }

// Recheck database permissions before every delivery, including changes made
// by another API worker. A stale handshake cannot authorize confidential data.
// Multi-worker delivery itself requires a shared Socket.IO adapter.
async function deliver(event, payloadFor) {
  if (!io) return;
  await Promise.all([...io.sockets.sockets.values()].map(async socket => {
    const user = await authenticate(socket.handshake?.auth?.token);
    if (!user) { socket.disconnect(true); return; }
    const payload = payloadFor(user);
    if (payload && socket.connected) socket.emit(event, payload);
  }));
}
export function emitIncidentUpdate(incident, action) {
  return deliver('incident-update', user => {
    if (!canViewIncident(user, incident)) return null;
    return { incident: presentIncident(incident, user), action,
      ...(incident.reporter_id === user.userId ? { scope: 'own' } : {}) };
  });
}
export function emitSosUpdate(sos, action) {
  return deliver('sos-update', user => isResponder(user.roles) || sos.reporter_id === user.userId
    ? { sos, action, ...(sos.reporter_id === user.userId ? { scope: 'own' } : {}) } : null);
}
function canViewAlert(user, alert) {
  return isAdministrator(user) || alert.target_all || alert.target_roles?.some(role => user.roles.includes(role));
}
export function emitAlertUpdate(alert, action) {
  return deliver('alert-update', user => canViewAlert(user, alert) ? { alert, action } : null);
}
export function emitAlertToUsers(alert, userIds, action) {
  const targets = new Set(userIds || []);
  return deliver('alert-update', user => targets.has(user.userId) && canViewAlert(user, alert)
    ? { alert, action, scope: 'own' } : null);
}
export function emitAssistanceUpdate(request, action) {
  return deliver('assistance-update', user => isResponder(user.roles) || request.requester_id === user.userId || request.assignee_id === user.userId
    ? { request, action, ...(request.requester_id === user.userId ? { scope: 'own' } : {}) } : null);
}
export function emitAppealUpdate(appeal, action) {
  return deliver('appeal-update', user => isAdministrator(user) || appeal.appellant_id === user.userId
    ? { appeal, action, ...(appeal.appellant_id === user.userId ? { scope: 'own' } : {}) } : null);
}
export const REALTIME_EVENTS = ['incident-update', 'sos-update', 'alert-update', 'assistance-update', 'appeal-update'];
