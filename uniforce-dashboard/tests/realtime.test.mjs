import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const flush = () => new Promise(resolve => setImmediate(resolve));
async function load(kind, { read, renew } = {}) {
  let token = 'first-access';
  let refreshCount = 0;
  const clients = [];
  const refresh = async () => {
    refreshCount++;
    if (renew) await renew();
    token = 'renewed-access';
  };
  const readToken = () => read ? read() : token;
  const context = vm.createContext({});
  const dependencies = {
    'socket.io-client': { io: (url, options) => {
      const handlers = new Map();
      const client = { url, options, closed: false,
        on: (event, handler) => handlers.set(event, handler),
        fire: (event, payload) => handlers.get(event)?.(payload),
        removeAllListeners: () => handlers.clear(),
        disconnect: () => { client.closed = true; },
      };
      clients.push(client); return client;
    } },
    './api.js': { API_BASE: 'https://api.test', API_CONFIG_ERROR: '', getToken: readToken,
      refreshAccessToken: refresh, REST_BASE: 'https://api.test', api: { refreshToken: refresh } },
    './session-storage.js': { getToken: readToken },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
  };
  const filename = kind === 'dashboard' ? '../src/realtime.js' : '../../UniSafe/src/utils/realtime.js';
  const module = new vm.SourceTextModule(await readFile(new URL(filename, import.meta.url), 'utf8'), { context });
  await module.link(name => new vm.SyntheticModule(Object.keys(dependencies[name]), function () {
    for (const [key, value] of Object.entries(dependencies[name])) this.setExport(key, value);
  }, { context }));
  await module.evaluate();
  return { api: module.namespace, clients, refreshCount: () => refreshCount };
}

for (const kind of ['dashboard', 'mobile']) {
  test(`${kind}: one connection, stable subscriptions after expiry, and unsubscribe`, async () => {
    const { api, clients, refreshCount } = await load(kind);
    let delivered = 0;
    const stop = api.subscribeRealtime('incident-update', () => delivered++);
    assert.equal(await api.connectRealtime(), await api.connectRealtime());
    assert.equal(clients.length, 1);
    clients[0].fire('incident-update', {});
    clients[0].fire('session-expired');
    await flush();
    assert.equal(refreshCount(), 1);
    assert.equal(clients[0].closed, true);
    assert.equal(clients.length, 2);
    assert.equal(clients[1].options.auth.token, 'renewed-access');
    clients[1].fire('incident-update', {});
    assert.equal(delivered, 2);
    stop();
    clients[1].fire('incident-update', {});
    assert.equal(delivered, 2);
    api.disconnectRealtime();
    assert.equal(clients[1].closed, true);
  });
  test(`${kind}: rejected expired handshake refreshes after offline resume`, async () => {
    const { api, clients, refreshCount } = await load(kind);
    await api.connectRealtime();
    clients[0].fire('connect_error', new Error('unauthorized'));
    await flush();
    assert.equal(refreshCount(), 1);
    assert.equal(clients[1].options.auth.token, 'renewed-access');
    api.disconnectRealtime();
  });
  test(`${kind}: logout cancels a pending token read before socket creation`, async () => {
    let release;
    const read = new Promise(resolve => { release = resolve; });
    const { api, clients } = await load(kind, { read: () => read });
    const connecting = api.connectRealtime();
    api.disconnectRealtime();
    release('first-access');
    assert.equal(await connecting, null);
    assert.equal(clients.length, 0);
  });
  test(`${kind}: logout while refreshing cannot reopen a socket`, async () => {
    let release;
    const renew = new Promise(resolve => { release = resolve; });
    const { api, clients } = await load(kind, { renew: () => renew });
    await api.connectRealtime();
    clients[0].fire('session-expired');
    api.disconnectRealtime();
    release();
    await flush();
    assert.equal(clients.length, 1);
    assert.equal(api.getSocket(), null);
  });
}
