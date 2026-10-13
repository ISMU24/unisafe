import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveApiBase } from '../src/api-config.js';

const origin = 'https://api.example.test';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const pair = { accessToken: 'test-access', refreshToken: 'test-refresh' };

// Execute the actual client in isolation: only transport and realtime are mocked.
async function client({ env = { VITE_API_URL: origin, DEV: false }, fetch, stored = {} } = {}) {
  const values = new Map(Object.entries(stored));
  const calls = [];
  const context = vm.createContext({
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    fetch: async (url, options) => { calls.push({ url, ...options }); return fetch(url, options); },
  });
  const config = new vm.SourceTextModule(await readFile(new URL('../src/api-config.js', import.meta.url), 'utf8'), { context });
  const realtime = new vm.SyntheticModule(
    ['connectRealtime', 'disconnectRealtime', 'onRealtimeStatus', 'subscribeRealtime'],
    function () { for (const name of ['connectRealtime', 'disconnectRealtime', 'onRealtimeStatus', 'subscribeRealtime']) this.setExport(name, name === 'connectRealtime' ? async () => null : () => {}); },
    { context },
  );
  const module = new vm.SourceTextModule(await readFile(new URL('../src/api.js', import.meta.url), 'utf8'), {
    context, initializeImportMeta: meta => { meta.env = env; },
  });
  await module.link(name => name === './api-config.js' ? config : realtime);
  await module.evaluate();
  return { api: module.namespace, calls, values };
}

test('production requires an HTTPS origin; development and explicit nginx use their proxy', () => {
  for (const value of [undefined, '', '  ']) assert.throws(() => resolveApiBase(value, { production: true }), /not configured/);
  for (const value of ['http://localhost:3001', 'https://localhost', 'https://127.0.0.1', 'http://api.example.test', '/api', '//api.example.test', origin + '/api', origin + '?a=1', origin + '#x', 'https://user:pass@api.example.test']) {
    assert.throws(() => resolveApiBase(value, { production: true }), /Invalid/);
  }
  assert.equal(resolveApiBase(' ' + origin + '/ ', { production: true }), origin);
  assert.equal(resolveApiBase('', { production: false }), '');
  assert.equal(resolveApiBase('/', { production: true }), '');
  assert.throws(() => resolveApiBase('/', { production: true, netlify: true }), /Invalid/);
});

test('missing production configuration surfaces a diagnostic without sending credentials', async () => {
  const { api, calls } = await client({ env: { DEV: false } });
  await assert.rejects(api.login('test@example.test', 'fixture'), /VITE_API_URL/);
  await assert.rejects(api.getHealth(), /VITE_API_URL/);
  assert.equal(calls.length, 0);
});

test('login, refresh, protected calls and logout use the exact backend paths', async () => {
  const { api, calls } = await client({ fetch: async url => json(url.endsWith('/me') ? { roles: ['SECURITY'] } : pair) });
  await api.login('test@example.test', 'fixture');
  await api.getMe();
  await api.refreshAccessToken();
  await api.logout();
  assert.deepEqual(calls.map(c => [c.method, c.url]), [
    ['POST', origin + '/api/auth/login'], ['GET', origin + '/api/auth/me'],
    ['POST', origin + '/api/auth/refresh'], ['POST', origin + '/api/auth/logout'],
  ]);
  assert.equal(calls[1].headers.Authorization, 'Bearer test-access');
  assert.deepEqual(JSON.parse(calls[2].body), { refreshToken: 'test-refresh' });
  assert.deepEqual(JSON.parse(calls[3].body), { refreshToken: 'test-refresh' });
  assert.equal(api.getToken(), null);
});

test('unconfigured development sends relative URLs to the Vite proxy', async () => {
  const { api, calls } = await client({ env: { DEV: true }, fetch: async () => json(pair) });
  await api.login('test@example.test', 'fixture');
  assert.equal(calls[0].url, '/api/auth/login');
});

test('HTML 404 and successful SPA HTML produce useful, distinct routing errors', async () => {
  for (const status of [404, 200]) {
    const { api } = await client({ fetch: async () => new Response('<html>SPA</html>', { status, headers: { 'Content-Type': 'text/html' } }) });
    await assert.rejects(api.login('test@example.test', 'fixture'), e => e.status === status && /VITE_API_URL/.test(e.message));
    assert.equal(api.getToken(), null);
  }
});

test('401 and 403 preserve backend messages; network/CORS and timeout are separate', async () => {
  for (const status of [401, 403]) {
    const { api } = await client({ fetch: async () => json({ error: 'Server explanation' }, status) });
    await assert.rejects(api.login('test@example.test', 'fixture'), e => e.status === status && e.message === 'Server explanation');
  }
  for (const [error, message] of [[new TypeError('Failed to fetch'), /CORS/], [Object.assign(new Error(), { name: 'AbortError' }), /did not respond in time/]]) {
    const { api } = await client({ fetch: async () => { throw error; } });
    await assert.rejects(api.getHealth(), e => e.status === 0 && message.test(e.message));
  }
});

test('routing and network failures preserve existing sessions, including refresh tokens', async () => {
  for (const failure of [() => new Response('Not found', { status: 404 }), () => { throw new TypeError('offline'); }]) {
    const { api } = await client({ stored: { uf_token: 'old', uf_refresh_token: 'refresh' }, fetch: async () => failure() });
    await assert.rejects(api.getMe());
    await assert.rejects(api.refreshAccessToken());
    assert.equal(api.getToken(), 'old');
    assert.equal(api.getRefreshToken(), 'refresh');
  }
});

test('concurrent 401s share refresh rotation and retry with the new access token', async () => {
  let finishRefresh;
  const { api, calls } = await client({
    stored: { uf_token: 'old', uf_refresh_token: 'refresh' },
    fetch: async (url, options) => {
      if (url.endsWith('/refresh')) return new Promise(resolve => { finishRefresh = () => resolve(json(pair)); });
      return options.headers.Authorization === 'Bearer old' ? json({ error: 'Expired' }, 401) : json({ roles: ['SECURITY'] });
    },
  });
  const pending = Promise.all([api.getMe(), api.getMe()]);
  while (!finishRefresh) await new Promise(resolve => setImmediate(resolve));
  finishRefresh();
  const results = await pending;
  assert.equal(results.length, 2);
  assert.equal(calls.filter(c => c.url.endsWith('/refresh')).length, 1);
  assert.equal(api.getToken(), pair.accessToken);
  assert.equal(api.getRefreshToken(), pair.refreshToken);
});

test('a late refresh cannot restore a session that has ended', async () => {
  let finish;
  const { api } = await client({ stored: { uf_token: 'old', uf_refresh_token: 'refresh' }, fetch: async () => new Promise(resolve => { finish = () => resolve(json(pair)); }) });
  const pending = api.refreshAccessToken();
  api.clearSession();
  finish();
  await assert.rejects(pending, /session has ended/);
  assert.equal(api.getToken(), null);
  assert.equal(api.getRefreshToken(), null);
});

test('rejected refresh clears the session and notifies the auth provider', async () => {
  const { api } = await client({ stored: { uf_token: 'old', uf_refresh_token: 'refresh' }, fetch: async () => json({ error: 'Revoked' }, 401) });
  let ended = 0;
  api.onSessionEnded(() => ended++);
  await assert.rejects(api.getMe(), /Revoked/);
  assert.equal(ended, 1);
  assert.equal(api.getToken(), null);
  assert.equal(api.getRefreshToken(), null);
});

test('Netlify config keeps API and Socket.IO out of the SPA fallback', async () => {
  const source = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  const rules = source.split('[[redirects]]').slice(1).map(block => ({
    from: block.match(/from = "([^"]+)"/)[1],
    to: block.match(/to = "([^"]+)"/)[1],
    status: Number(block.match(/status = (\d+)/)[1]),
  }));
  for (const path of ['/api/auth/login', '/api/health', '/socket.io/', '/incidents', '/login']) {
    const match = rules.find(rule => path.startsWith(rule.from.replace('*', '')));
    assert.equal(match.status, path.startsWith('/api/') || path.startsWith('/socket.io/') ? 404 : 200);
    assert.equal(match.to, match.status === 404 ? '/api-unavailable.json' : '/index.html');
  }
  const diagnostic = JSON.parse(await readFile(new URL('../public/api-unavailable.json', import.meta.url)));
  assert.match(diagnostic.error, /VITE_API_URL/);
  assert.match(source, /base = "uniforce-dashboard"/);
  assert.match(source, /publish = "dist"/);
});
