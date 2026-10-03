import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Get API base URL from environment or app.json config
// For production builds, use the environment variable EXPO_PUBLIC_API_URL
// For development, fallback to app.json extra.apiUrl or localhost
const getApiBaseUrl = () => {
  // Check for environment variable first (set at build time via EAS or .env)
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const configUrl = Constants?.expoConfig?.extra?.apiUrl?.trim();
  const platformDefault = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001';
  const resolved = (envUrl || configUrl || platformDefault)
    .replace(/\/+$/, '').replace(/\/api$/, '');
  try {
    const url = new URL(resolved);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    // Fail closed without crashing the UI: requests show a configuration error.
    // Socket.IO uses the same validated base URL.
    if (!__DEV__ && url.protocol !== 'https:') return '';
    return resolved;
  } catch {
    return '';
  }
};

const REST_BASE = getApiBaseUrl();

async function token() {
  return (await AsyncStorage.getItem('token')) || '';
}

let refreshPromise = null;
let sessionVersion = 0;

export async function clearSession() {
  sessionVersion += 1;
  await AsyncStorage.multiRemove(['token', 'refreshToken', 'user']);
}

async function saveTokens(tokens, version) {
  if (!tokens?.accessToken || !tokens?.refreshToken) throw new Error('Invalid authentication response. Please sign in again.');
  if (version !== sessionVersion) throw new Error('Session changed. Please sign in again.');
  await AsyncStorage.multiSet([['token', tokens.accessToken], ['refreshToken', tokens.refreshToken]]);
  return tokens;
}

async function refreshSession() {
  if (!refreshPromise) {
    const version = sessionVersion;
    refreshPromise = (async () => {
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      if (!refreshToken) {
        await clearSession();
        throw new Error('Your session has expired. Please sign in again.');
      }
      try {
        const tokens = await serverRequest('POST', '/api/auth/refresh', { refreshToken }, false);
        return await saveTokens(tokens, version);
      } catch (error) {
        if ([400, 401, 403].includes(error.status) && version === sessionVersion) await clearSession();
        throw error;
      }
    })().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function serverRequest(method, endpoint, body, auth = true, retry = true) {
  if (!REST_BASE) throw new Error('This app has a missing or insecure server address. Contact the app administrator for an updated version.');
  const headers = { 'Content-Type': 'application/json' };
  const version = sessionVersion;
  let usedToken = '';
  if (auth) {
    usedToken = await token();
    if (usedToken) headers.Authorization = `Bearer ${usedToken}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75000);
  let res;
  let data;
  try {
    res = await fetch(`${REST_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    data = await res.json().catch(() => ({}));
  } catch (error) {
    throw new Error(error.name === 'AbortError'
      ? 'The server did not respond in time. It may still be waking up. Delivery is not confirmed; wait a minute and check the status before retrying.'
      : 'Unable to reach the server. Check your connection. The server may be waking up; wait 30-60 seconds and check the status before retrying.');
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 401 && auth && retry && version === sessionVersion) {
    const currentToken = await token();
    if (!currentToken || currentToken === usedToken) await refreshSession();
    return serverRequest(method, endpoint, body, auth, false);
  }
  if (!res.ok) {
    const policyUnavailable = endpoint === '/api/policy-search' && data.code === 'POLICY_UNAVAILABLE';
    const error = new Error(policyUnavailable
      ? 'Policy Q&A is not available right now. You can still browse the policies.'
      : [502, 503, 504].includes(res.status)
      ? 'The server is temporarily unavailable or waking up. Wait 30-60 seconds and check the status before retrying. Delivery is not confirmed.'
      : (data.error || `Request failed: ${res.status}`));
    error.status = res.status;
    if (policyUnavailable) error.code = 'POLICY_UNAVAILABLE';
    throw error;
  }
  return data;
}

export const api = {
  // ── Auth ──
  login: async (email, password) => {
    await clearSession();
    const version = sessionVersion;
    const tokens = await serverRequest('POST', '/api/auth/login', { email, password }, false);
    return saveTokens(tokens, version);
  },
  register: (body) => serverRequest('POST', '/api/auth/register', body, false),
  me: () => serverRequest('GET', '/api/auth/me'),
  refreshToken: refreshSession,
  logout: async () => {
    if (refreshPromise) await refreshPromise.catch(() => {});
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    await clearSession();
    if (refreshToken) return serverRequest('POST', '/api/auth/logout', { refreshToken }, false);
  },

  // ── Incidents ──
  createIncident: async (payload) => {
    // Send only fields the backend schema accepts; let backend generate the UUID
    const body = {
      category: payload.category,
      title: payload.title,
      description: payload.description,
      latitude: payload.location?.lat ?? payload.latitude ?? undefined,
      longitude: payload.location?.lng ?? payload.longitude ?? undefined,
      location_text: payload.locationText || payload.location_text || undefined,
      priority: payload.priority || 'Medium',
      is_anonymous: payload.anonymous ?? payload.is_anonymous ?? false,
      is_sos: payload.is_sos ?? false,
    };
    return serverRequest('POST', '/api/incidents', body);
  },
  getIncidents: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const query = params.toString();
    return serverRequest('GET', `/api/incidents${query ? `?${query}` : ''}`);
  },
  getIncident: (id) => serverRequest('GET', `/api/incidents/${id}`),
  updateIncident: (id, data) => serverRequest('PATCH', `/api/incidents/${id}`, data),
  updateIncidentStatus: (id, status, note) =>
    serverRequest('PATCH', `/api/incidents/${id}/status`, { status, note: note || undefined }),

  // ── SOS ──
  sendSOS: async (payload) => {
    const body = {
      latitude: payload.location?.lat ?? payload.latitude ?? undefined,
      longitude: payload.location?.lng ?? payload.longitude ?? undefined,
      location_text: payload.locationText || payload.location_text || undefined,
    };
    return serverRequest('POST', '/api/sos', body);
  },
  getSOSEvents: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const query = params.toString();
    return serverRequest('GET', `/api/sos${query ? `?${query}` : ''}`);
  },
  getSOSEvent: (id) => serverRequest('GET', `/api/sos/${id}`),
  respondToSOS: (id, data) => serverRequest('POST', `/api/sos/${id}/respond`, data),
  closeSOS: (id) => serverRequest('POST', `/api/sos/${id}/close`, {}),

  // ── Assistance ──
  sendAssistance: async (payload) => {
    return serverRequest('POST', '/api/assistance', {
      type: payload.type,
      title: payload.title,
      description: payload.description,
      location_text: payload.location_text || undefined,
      priority: payload.priority || 'Medium',
    });
  },
  getAssistance: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const query = params.toString();
    return serverRequest('GET', `/api/assistance${query ? `?${query}` : ''}`);
  },
  getAssistanceRequest: (id) => serverRequest('GET', `/api/assistance/${id}`),
  updateAssistance: (id, data) => serverRequest('PATCH', `/api/assistance/${id}`, data),

  // ── Alerts ──
  getAlerts: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const query = params.toString();
    return serverRequest('GET', `/api/alerts${query ? `?${query}` : ''}`);
  },
  getMyAlerts: () => serverRequest('GET', '/api/alerts/my'),
  markAlertAsRead: (id) => serverRequest('POST', `/api/alerts/my/${id}/read`, {}),
  getAlert: (id) => serverRequest('GET', `/api/alerts/${id}`),
  createAlert: (data) => serverRequest('POST', '/api/alerts', data),
  updateAlert: (id, data) => serverRequest('PATCH', `/api/alerts/${id}`, data),
  deleteAlert: (id) => serverRequest('DELETE', `/api/alerts/${id}`),

  // ── Appeals ──
  createAppeal: async (payload) => {
    const body = {
      related_incident_id: payload.related_incident_id || payload.relatedIncidentId || undefined,
      type: payload.type || 'Other',
      title: payload.title,
      description: payload.description,
    };
    return serverRequest('POST', '/api/appeals', body);
  },
  getAppeals: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const query = params.toString();
    return serverRequest('GET', `/api/appeals${query ? `?${query}` : ''}`);
  },
  getAppeal: (id) => serverRequest('GET', `/api/appeals/${id}`),
  updateAppealStatus: (id, status, decision) =>
    serverRequest('PATCH', `/api/appeals/${id}/status`, { status, decision }),
  addAppealDocument: (id, data) => serverRequest('POST', `/api/appeals/${id}/documents`, data),

  // ── Users (admin) ──
  getUsers: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const query = params.toString();
    return serverRequest('GET', `/api/users${query ? `?${query}` : ''}`);
  },
  getUser: (id) => serverRequest('GET', `/api/users/${id}`),
  updateUser: (id, data) => serverRequest('PATCH', `/api/users/${id}`, data),
  assignUserRole: (id, role) => serverRequest('POST', `/api/users/${id}/roles`, { role }),
  removeUserRole: (id, roleName) => serverRequest('DELETE', `/api/users/${id}/roles/${roleName}`),
  resetUserPassword: (id, newPassword) => serverRequest('POST', `/api/users/${id}/reset-password`, { new_password: newPassword }),
  getRoles: () => serverRequest('GET', '/api/users/roles'),
  getUsersByRole: (roleName) => serverRequest('GET', `/api/users/by-role/${roleName}`),

  // ── Dashboard (admin/responder) ──
  getDashboardStats: () => serverRequest('GET', '/api/dashboard/stats'),
  getDashboardRecent: () => serverRequest('GET', '/api/dashboard/recent'),

  // ── Audit Logs (admin) ──
  getAuditLogs: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const query = params.toString();
    return serverRequest('GET', `/api/audit-logs${query ? `?${query}` : ''}`);
  },

  // ── Policy AI (server-side — requires ANTHROPIC_API_KEY + VOYAGE_API_KEY) ──
  askPolicy: (question) => serverRequest('POST', '/api/policy-search', { question }),
  health: () => serverRequest('GET', '/api/health', null, false),
};

// Export REST_BASE for debugging
export { REST_BASE };
