import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { code } = transformSync(fs.readFileSync(new URL('../src/utils/session-storage.js', import.meta.url), 'utf8'), {
  filename: 'session-storage.js', configFile: false, babelrc: false,
  plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
});
function load({ legacy = {}, saved = null, platform = 'android', failWrite = false } = {}) {
  const plain = new Map(Object.entries(legacy));
  let secure = saved;
  const writes = [];
  const dependencies = {
    'react-native': { Platform: { OS: platform } },
    '@react-native-async-storage/async-storage': {
      getItem: async key => plain.get(key),
      multiRemove: async keys => keys.forEach(key => plain.delete(key)),
    },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
      getItemAsync: async () => secure,
      setItemAsync: async (key, value, options) => {
        if (failWrite) throw new Error('Keystore unavailable');
        writes.push({ key, options }); secure = value;
      },
      deleteItemAsync: async () => { secure = null; },
    },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => dependencies[name] });
  return { ...exports, plain, writes, secure: () => secure };
}
test('native migration stores both tokens securely before deleting plaintext', async () => {
  const storage = load({ legacy: { token: 'access', refreshToken: 'refresh', user: 'profile' } });
  assert.equal(await storage.getToken(), 'access');
  assert.equal(await storage.getRefreshToken(), 'refresh');
  assert.equal(storage.plain.has('token'), false);
  assert.equal(storage.plain.get('user'), 'profile');
  assert.equal(storage.writes[0].options.keychainAccessible, 'device-only');
  assert.deepEqual(JSON.parse(storage.secure()), { accessToken: 'access', refreshToken: 'refresh' });
});
test('failed secure migration does not silently destroy the previous session', async () => {
  const storage = load({ legacy: { token: 'access', refreshToken: 'refresh' }, failWrite: true });
  await assert.rejects(storage.getToken(), /Keystore unavailable/);
  assert.equal(storage.plain.get('token'), 'access');
  assert.equal(storage.secure(), null);
});
test('logout serializes behind pending migration or token writes and removes credentials', async () => {
  const storage = load({ legacy: { token: 'old', refreshToken: 'old-refresh' } });
  const migration = storage.getToken();
  const write = storage.storeTokens({ accessToken: 'new', refreshToken: 'new-refresh' });
  const logout = storage.clearTokens();
  await Promise.all([migration, write, logout]);
  assert.equal(await storage.getToken(), '');
  assert.equal(await storage.getRefreshToken(), '');
  assert.equal(storage.secure(), null);
});
test('corrupt secure storage fails closed without resurrecting legacy plaintext', async () => {
  const storage = load({ saved: 'invalid-json', legacy: { token: 'old', refreshToken: 'old-refresh' } });
  assert.equal(await storage.getToken(), '');
  assert.equal(storage.plain.size, 0);
});
test('web tokens stay in memory and are lost when a new runtime starts', async () => {
  const storage = load({ platform: 'web', legacy: { token: 'legacy', refreshToken: 'legacy-refresh' } });
  assert.equal(await storage.getToken(), '');
  await storage.storeTokens({ accessToken: 'access', refreshToken: 'refresh' });
  assert.equal(await storage.getToken(), 'access');
  assert.equal(storage.secure(), null);
  assert.equal(storage.plain.size, 0);
  assert.equal(await load({ platform: 'web' }).getToken(), '');
});
