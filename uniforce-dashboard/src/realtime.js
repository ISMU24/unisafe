import { io } from 'socket.io-client';
import { API_BASE, getToken } from './api.js';

let socket = null;
let connecting = null;
const listeners = new Set();

function notify(status, detail) {
  listeners.forEach((listener) => {
    try {
      listener(status, detail);
    } catch {
      /* a broken subscriber must not break the transport */
    }
  });
}

export function getSocket() {
  return socket;
}

export function connectRealtime() {
  if (socket) return socket;
  if (connecting) return connecting;

  const token = getToken();
  if (!token) return null;

  connecting = new Promise((resolve) => {
    const client = io(API_BASE || window.location.origin, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });

    client.on('connect', () => {
      socket = client;
      connecting = null;
      notify('connected');
      resolve(client);
    });

    client.on('disconnect', (reason) => {
      notify('disconnected', reason);
      // A rejected handshake (expired/invalid token) will never recover on its
      // own, so drop the socket and let the app re-authenticate explicitly.
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        socket = null;
        connecting = null;
      }
    });

    client.on('connect_error', (err) => {
      notify('error', err);
      connecting = null;
      resolve(null);
    });
  });

  return connecting;
}

export function disconnectRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  connecting = null;
  notify('disconnected', 'signed-out');
}

export function onRealtimeStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Subscribe to a server event. The handler receives the event payload.
 * Falls back silently when the socket is unavailable; callers pair this with
 * the existing polling subscribe helpers as a safety net.
 */
export function subscribeRealtime(event, handler) {
  let cancelled = false;
  let bound = null;

  const bind = (client) => {
    // connectRealtime() returns the live socket when it is already connected,
    // but a Promise that resolves to it while the handshake is still in
    // flight. Subscribing happens during the first render, long before the
    // socket connects, so the handler must be attached to whichever of the two
    // turns up - treating the Promise as a client threw
    // "client.on is not a function" and took down every page that subscribes.
    if (cancelled || bound || !client || typeof client.on !== 'function') return;
    bound = client;
    client.on(event, handler);
  };

  if (socket) {
    bind(socket);
  } else {
    const pending = connectRealtime();
    if (pending && typeof pending.then === 'function') {
      // The handshake failed; the polling fallback in api.js covers this.
      pending.then(bind, () => {});
    } else {
      bind(pending);
    }
  }

  return () => {
    cancelled = true;
    if (bound) bound.off(event, handler);
  };
}
