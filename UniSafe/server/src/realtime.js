import { Server } from 'socket.io';
import { verifyAccessToken } from './auth/tokens.js';
import { getUserById } from './auth/database.js';

const RESPONDER_ROLES = ['ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'];
const RESPONDER_ROOM = 'responders';

let io = null;

export function isResponder(roles) {
  return (roles || []).some((role) => RESPONDER_ROLES.includes(role));
}

function userRoom(userId) {
  return `user:${userId}`;
}

function rolesOf(user) {
  return (user && Array.isArray(user.roles) ? user.roles : []).filter(
    (role) => typeof role === 'string' && role
  );
}

async function authenticate(token) {
  if (typeof token !== 'string' || !token) return null;
  let payload;
  try {
    payload = verifyAccessToken(token.replace(/^Bearer\s+/i, ''));
  } catch {
    return null;
  }
  if (typeof payload?.userId !== 'string') return null;
  try {
    const user = await getUserById(payload.userId);
    if (!user || !user.is_active) return null;
    return { userId: user.id, roles: rolesOf(user) };
  } catch (err) {
    console.error('Realtime auth lookup failed:', err.message);
    return null;
  }
}

export function initRealtime(server, { corsOptions } = {}) {
  io = new Server(server, { cors: corsOptions });

  io.use(async (socket, next) => {
    const session = await authenticate(socket.handshake?.auth?.token);
    if (!session) return next(new Error('unauthorized'));
    socket.data.user = session;
    next();
  });

  io.on('connection', (socket) => {
    const { userId, roles } = socket.data.user;
    socket.join(userRoom(userId));
    if (isResponder(roles)) socket.join(RESPONDER_ROOM);
    roles.forEach((role) => socket.join(`role:${role}`));

    // Kept for backwards compatibility with older clients. Room membership is
    // derived from the authenticated session; client input never grants access.
    socket.on('join-room', (room) => {
      if (typeof room !== 'string') return;
      if (room === RESPONDER_ROOM && !isResponder(roles)) return;
      if (room.startsWith('user:')) return;
      socket.join(room);
    });

    socket.on('leave-room', (room) => {
      if (typeof room === 'string') socket.leave(room);
    });
  });

  return io;
}

export function getIo() {
  return io;
}

function emitToResponders(event, payload) {
  if (io) io.to(RESPONDER_ROOM).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (io && userId) io.to(userRoom(userId)).emit(event, payload);
}

export function emitIncidentUpdate(incident, action) {
  const envelope = { incident, action };
  emitToResponders('incident-update', envelope);
  if (incident?.reporter_id) emitToUser(incident.reporter_id, 'incident-update', { ...envelope, scope: 'own' });
}

export function emitSosUpdate(sos, action) {
  const envelope = { sos, action };
  emitToResponders('sos-update', envelope);
  if (sos?.reporter_id) emitToUser(sos.reporter_id, 'sos-update', { ...envelope, scope: 'own' });
}

export function emitAlertUpdate(alert, action) {
  emitToResponders('alert-update', { alert, action });
}

/**
 * Push an alert to the specific users it was addressed to, so their phones
 * receive it without polling. Users outside the audience are never notified.
 */
export function emitAlertToUsers(alert, userIds, action) {
  if (!alert || !Array.isArray(userIds)) return 0;
  const targets = [...new Set(userIds.filter(Boolean))];
  for (const userId of targets) {
    emitToUser(userId, 'alert-update', { alert, action, scope: 'own' });
  }
  return targets.length;
}

export function emitAssistanceUpdate(request, action) {
  const envelope = { request, action };
  emitToResponders('assistance-update', envelope);
  if (request?.requester_id) emitToUser(request.requester_id, 'assistance-update', { ...envelope, scope: 'own' });
}

export function emitAppealUpdate(appeal, action) {
  const envelope = { appeal, action };
  emitToResponders('appeal-update', envelope);
  if (appeal?.appellant_id) emitToUser(appeal.appellant_id, 'appeal-update', { ...envelope, scope: 'own' });
}

export const REALTIME_EVENTS = [
  'incident-update',
  'sos-update',
  'alert-update',
  'assistance-update',
  'appeal-update',
];
