import { io } from 'socket.io-client';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REST_BASE } from './api.js';

/**
 * Realtime channel for the phone.
 *
 * The server pushes `incident-update`, `sos-update`, `alert-update`,
 * `assistance-update` and `appeal-update` to each user in a private
 * `user:<id>` room, so a student only ever receives events about their own
 * records. Authentication happens in the Socket.IO handshake via the access
 * token, mirroring the dashboard client.
 *
 * Realtime is an enhancement, never a requirement: screens keep polling, so a
 * blocked WebSocket degrades to "a few seconds late" rather than "never
 * updates". The socket is closed while the app is backgrounded to avoid
 * draining the battery on a long-lived notification.
 */

const listeners = new Set();
const statusListeners = new Set();

let socket = null;
let connecting = null;
let currentToken = '';
let backgroundedAt = 0;

function notifyStatus(status, detail) {
  statusListeners.forEach((listener) => {
    try {
      listener(status, detail);
    } catch {
      /* a broken subscriber must not break the transport */
    }
  });
}

function notify(event, payload) {
  listeners.forEach((listener) => {
    try {
      if (listener.event !== event) return;
      listener.handler(payload);
    } catch {
      /* a broken subscriber must not break the transport */
    }
  });
}

export function onRealtimeStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getSocket() {
  return socket;
}

async function readToken() {
  return (await AsyncStorage.getItem('token')) || '';
}

const REALTIME_EVENTS = [
  'incident-update',
  'sos-update',
  'alert-update',
  'assistance-update',
  'appeal-update',
];

export function connectRealtime() {
  if (!REST_BASE) return Promise.resolve(null);
  // Always resolves to the socket, or null when there is no session to
  // authenticate with. It used to return the live socket synchronously once
  // connected and a Promise while connecting, so callers could not tell which
  // they had - `.then()` threw "connectRealtime(...).then is not a function"
  // on any screen that subscribed after the socket was already up. Use
  // getSocket() when a synchronous handle is genuinely needed.
  if (socket) return Promise.resolve(socket);
  if (connecting) return connecting;

  const attempt = (async () => {
    const token = await readToken();
    if (!token) {
      // No session yet, so drop the attempt and let a later sign-in retry.
      if (connecting === attempt) connecting = null;
      return null;
    }
    currentToken = token;

    const client = io(REST_BASE, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
    });

    client.on('connect', () => {
      socket = client;
      backgroundedAt = 0;
      notifyStatus('connected');
    });

    for (const event of REALTIME_EVENTS) {
      client.on(event, (payload) => notify(event, payload));
    }

    client.on('disconnect', (reason) => {
      // Only the server or an explicit close is terminal. A backgrounded app
      // looks like a disconnect but must stay recoverable on resume.
      if (reason !== 'io client disconnect' && !backgroundedAt) notifyStatus('disconnected', reason);
      socket = null;
    });

    // Socket.IO retries on its own, so `connecting` deliberately keeps pointing
    // at this client after a failed handshake. Clearing it here would let the
    // next caller build a second socket alongside the one still retrying.
    client.on('connect_error', (error) => {
      notifyStatus('error', error);
    });

    return client;
  })();

  connecting = attempt;
  return attempt;
}

export function disconnectRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  connecting = null;
  currentToken = '';
  notifyStatus('disconnected', 'signed-out');
}

/**
 * Subscribe to a server event. Returns an unsubscribe function. If the socket
 * cannot be established the caller keeps working through its polling path.
 */
export function subscribeRealtime(event, handler) {
  const entry = { event, handler };
  listeners.add(entry);

  // Every client registers the central `notify` handlers when it is created, and
  // `notify` dispatches to whoever is in `listeners` at delivery time. A
  // subscription registered before or after the handshake therefore both
  // receive events, so there is nothing to await and nothing to bind here.
  // Attaching a second `client.on(event)` after the fact would double-deliver.
  connectRealtime().catch(() => {});

  return () => listeners.delete(entry);
}

/**
 * Reconnect when the app returns to the foreground if the access token has
 * been rotated since the socket authenticated. Socket.IO cannot renegotiate the
 * handshake on its own, so a stale token would otherwise fail forever.
 */
export function bindRealtimeLifecycle() {
  const onChange = async (state) => {
    if (state === 'background' || state === 'inactive') {
      backgroundedAt = Date.now();
      return;
    }
    if (state !== 'active') return;
    if (!backgroundedAt) return;
    backgroundedAt = 0;

    const token = await readToken();
    if (!token) return;
    if (socket) {
      if (token === currentToken) return;
      // Token rotated while backgrounded: rebuild the handshake.
      disconnectRealtime();
    }
    connectRealtime().catch(() => {});
  };

  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}
