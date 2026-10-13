import { io } from 'socket.io-client';
import { AppState } from 'react-native';
import { REST_BASE, api } from './api.js';
import { getToken as readToken } from './session-storage.js';
const configured = () => Boolean(REST_BASE);
const baseUrl = () => REST_BASE;
const renewSession = () => api.refreshToken();

let socket = null;
let connecting = null;
let currentToken = '';
let generation = 0;
const listeners = new Set();
const statusListeners = new Set();
const EVENTS = ['incident-update', 'sos-update', 'alert-update', 'assistance-update', 'appeal-update'];
function notifyStatus(status, detail) {
  for (const listener of statusListeners) { try { listener(status, detail); } catch {} }
}
export const getSocket = () => socket;
export function onRealtimeStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}
export function disconnectRealtime() {
  generation += 1;
  if (socket) { socket.removeAllListeners(); socket.disconnect(); }
  socket = null;
  connecting = null;
  currentToken = '';
  notifyStatus('disconnected', 'signed-out');
}
export function connectRealtime() {
  if (!configured()) return Promise.resolve(null);
  if (connecting) return connecting;
  const version = generation;
  const attempt = (async () => {
    const token = await readToken();
    if (version !== generation) return null;
    if (socket && token === currentToken) return socket;
    if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
    if (!token) return null;
    currentToken = token;
    const client = io(baseUrl(), {
      path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'],
      extraHeaders: { 'ngrok-skip-browser-warning': 'true' }, withCredentials: false,
      reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 15000, timeout: 10000,
    });
    socket = client; // Retain pending clients so logout can close them too.
    client.on('connect', () => notifyStatus('connected'));
    client.on('disconnect', reason => notifyStatus('disconnected', reason));
    const recoverSession = () => {
      if (socket !== client) return;
      disconnectRealtime();
      const expiredGeneration = generation;
      renewSession().then(() => {
        if (generation === expiredGeneration) return connectRealtime();
      }).catch(error => notifyStatus('error', error));
    };
    client.on('session-expired', recoverSession);
    client.on('connect_error', error => {
      notifyStatus('error', error);
      // A token may expire while offline, before the server can send expiry.
      if (error.message === 'unauthorized') recoverSession();
    });
    for (const event of EVENTS) client.on(event, payload => {
      for (const listener of listeners) {
        if (listener.event === event) { try { listener.handler(payload); } catch {} }
      }
    });
    return client;
  })();
  connecting = attempt;
  const cleanup = () => { if (connecting === attempt) connecting = null; };
  attempt.then(cleanup, cleanup);
  return attempt;
}
export function subscribeRealtime(event, handler) {
  const entry = { event, handler };
  listeners.add(entry);
  connectRealtime().catch(() => {});
  return () => listeners.delete(entry);
}

export function bindRealtimeLifecycle() {
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'background' || state === 'inactive') disconnectRealtime();
    else if (state === 'active') connectRealtime().catch(() => {});
  });
  return () => subscription.remove();
}
