// Run with: node --test scripts/check-api.mjs (no Expo build or dotenv loading).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/utils/api.js', import.meta.url), 'utf8');
const { code } = transformSync(source, {
  filename: 'api.js', configFile: false, babelrc: false,
  plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
});

function load({ envUrl, configUrl, legacyUrl, platform = 'android', dev = false, fetchImpl } = {}) {
  const calls = [];
  const deadlines = [];
  const exports = {};
  const storage = { getItem: async () => '', multiRemove: async () => {}, multiSet: async () => {} };
  const dependencies = {
    'expo-constants': { expoConfig: { extra: { apiUrl: configUrl, EXPO_PUBLIC_API_URL: legacyUrl } } },
    '@react-native-async-storage/async-storage': storage,
    'react-native': { Platform: { OS: platform } },
  };
  vm.runInNewContext(code, {
    exports, require: name => dependencies[name], __DEV__: dev,
    process: { env: { EXPO_PUBLIC_API_URL: envUrl } }, URL, URLSearchParams, AbortController,
    setTimeout: (callback, ms) => { deadlines.push(ms); return setTimeout(callback, ms); }, clearTimeout,
    fetch: async (...args) => {
      calls.push(args);
      return fetchImpl ? fetchImpl(...args) : { ok: true, status: 200, json: async () => ({ id: 'test-id' }) };
    },
  });
  return { ...exports, calls, deadlines };
}

test('URL priority, normalization and development platform defaults', () => {
  assert.equal(load({ envUrl: ' https://env.example/api/ ', configUrl: 'https://config.example', legacyUrl: 'https://legacy.example' }).REST_BASE, 'https://env.example');
  assert.equal(load({ configUrl: 'https://config.example/api' }).REST_BASE, 'https://config.example');
  assert.equal(load({ dev: true }).REST_BASE, 'http://10.0.2.2:3001');
  assert.equal(load({ dev: true, platform: 'ios' }).REST_BASE, 'http://localhost:3001');
  assert.equal(load({ dev: true, platform: 'web' }).REST_BASE, 'http://localhost:3001');
});

test('release refuses HTTP, missing or invalid configuration before any network request', async () => {
  for (const options of [{}, { envUrl: 'http://lan.example' }, { configUrl: 'http://localhost:3001' }, { envUrl: 'invalid' }]) {
    const client = load(options);
    assert.equal(client.REST_BASE, '');
    await assert.rejects(client.api.health(), /missing or insecure server address/);
    assert.equal(client.calls.length, 0);
  }
});

test('incident and SOS submit to the API and allow a cold start', async () => {
  const client = load({ envUrl: 'https://api.example' });
  await client.api.createIncident({ category: 'Security', title: 'Test', description: 'Test report' });
  await client.api.sendSOS({ latitude: 1, longitude: 2 });
  assert.deepEqual(client.calls.map(([url, options]) => [url, options.method]), [
    ['https://api.example/api/incidents', 'POST'], ['https://api.example/api/sos', 'POST'],
  ]);
  assert.ok(client.deadlines.every(ms => ms >= 60000 && ms <= 90000));
});

test('timeout, network and unavailable-server failures explain waking up and do not replay POSTs', async () => {
  for (const fetchImpl of [
    async () => { const error = new Error(); error.name = 'AbortError'; throw error; },
    async () => { throw new Error('Network failed'); },
    async () => ({ ok: false, status: 503, json: async () => ({}) }),
  ]) {
    const client = load({ envUrl: 'https://api.example', fetchImpl });
    await assert.rejects(client.api.sendSOS({}), /waking up/i);
    assert.equal(client.calls.length, 1);
  }
});

test('disabled policy AI keeps its unavailable message instead of suggesting a cold-start retry', async () => {
  const client = load({ envUrl: 'https://api.example', fetchImpl: async () => ({
    ok: false, status: 503, json: async () => ({ code: 'POLICY_UNAVAILABLE', error: 'Policy Q&A is not available.' }),
  }) });
  await assert.rejects(client.api.askPolicy('What is the policy?'), error => {
    assert.equal(error.code, 'POLICY_UNAVAILABLE');
    assert.match(error.message, /not available.*browse/);
    assert.doesNotMatch(error.message, /waking|Delivery/);
    return true;
  });
  assert.equal(client.calls.length, 1);
});

test('Ask AI renders a useful unavailable reply and clears its loading state', async () => {
  const states = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef: () => ({ current: null }), useEffect: () => {},
  };
  const native = Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'FlatList', 'TextInput', 'ActivityIndicator'].map(name => [name, name]));
  native.StyleSheet = { create: styles => styles };
  native.Keyboard = { dismiss: () => {} };
  const exports = {};
  const dependencies = {
    react: React, 'react-native': native, '@expo/vector-icons': { MaterialIcons: 'MaterialIcons' },
    '../ThemeContext': { useTheme: () => ({ colors: {} }) },
    '../utils/api': { api: { askPolicy: async () => {
      const error = new Error('Unavailable'); error.code = 'POLICY_UNAVAILABLE'; throw error;
    } } },
  };
  const component = transformSync(fs.readFileSync(new URL('../src/components/AskPolicyAI.js', import.meta.url), 'utf8'), {
    filename: 'AskPolicyAI.js', configFile: false, babelrc: false,
    plugins: [require.resolve('@babel/plugin-transform-react-jsx'), require.resolve('@babel/plugin-transform-modules-commonjs')],
  });
  vm.runInNewContext(component.code, { exports, require: name => dependencies[name] });
  const render = () => { cursor = 0; return exports.default(); };
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of node.props?.children?.flat(Infinity) || []) {
      const match = find(child, type); if (match) return match;
    }
    return null;
  };
  find(render(), 'TextInput').props.onChangeText('What is the policy?');
  await find(render(), 'TouchableOpacity').props.onPress();
  const tree = render();
  const reply = find(tree, 'FlatList').props.data.at(-1).text;
  assert.match(reply, /not available.*Browse/);
  assert.doesNotMatch(reply, /Error:|port 3001|API_KEY/);
  assert.equal(find(tree, 'ActivityIndicator'), null);
});
