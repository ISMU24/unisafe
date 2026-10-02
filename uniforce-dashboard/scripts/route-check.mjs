/**
 * Drives the dashboard through its authenticated routes in headless Chrome and
 * reports console errors, uncaught exceptions and failed requests per route.
 *
 * Signs in through the real login form so the session, token storage and
 * Socket.IO connection are all exercised exactly as an operator would.
 *
 * Usage: node scripts/route-check.mjs <baseUrl> <email> <password>
 */
const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const email = process.argv[3];
const password = process.argv[4];

const ROUTES = ['/', '/incidents', '/emergency', '/analytics', '/reports', '/users', '/ai-tools', '/profile', '/settings'];

const DEBUG_PORT = 9222;

async function findTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const page = (await res.json()).find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('No DevTools target available.');
}

const ws = new WebSocket(await findTarget());
let nextId = 1;
const pending = new Map();
let bucket = { problems: [], failed: [] };

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    bucket.problems.push(`UNCAUGHT: ${d.exception?.description || d.text}`);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    bucket.problems.push(`CONSOLE: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    bucket.failed.push(`HTTP ${m.params.response.status} ${m.params.response.url.replace(base, '')}`);
  }
});

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.text);
  return result.value;
};

// ── Sign in through the real form ─────────────────────────────────────────
// Start from a clean slate, otherwise a token left over from a previous run
// makes /login redirect straight to the dashboard and the form never renders.
await send('Page.navigate', { url: `${base}/login` });
await new Promise((r) => setTimeout(r, 1500));
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: `${base}/login` });
await new Promise((r) => setTimeout(r, 3000));

bucket = { problems: [], failed: [] };
const loginResult = await evaluate(`(() => {
  const setValue = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll('input')];
  if (inputs.length < 2) return 'expected 2 inputs, found ' + inputs.length;
  setValue(inputs[0], ${JSON.stringify(email)});
  setValue(inputs[1], ${JSON.stringify(password)});
  const form = inputs[0].closest('form');
  if (form) form.requestSubmit();
  return 'submitted';
})()`);

await new Promise((r) => setTimeout(r, 5000));
const afterLogin = await evaluate(`JSON.stringify({ url: location.pathname, text: (document.body.innerText||'').slice(0,300) })`);
const state = JSON.parse(afterLogin);

console.log(`login form: ${loginResult}`);
console.log(`after login -> ${state.url}`);
if (loginResult === 'submitted' && state.url === '/login') {
  console.log(`  LOGIN FAILED. Page says: ${state.text.replace(/\s+/g, ' ').slice(0, 200)}`);
}
if (bucket.problems.length) {
  console.log('  login errors:');
  for (const p of [...new Set(bucket.problems)].slice(0, 8)) console.log('    ' + p);
}

// ── Walk each route ───────────────────────────────────────────────────────
for (const route of ROUTES) {
  bucket = { problems: [], failed: [] };
  await send('Page.navigate', { url: `${base}${route}` });
  await new Promise((r) => setTimeout(r, 3500));

  const info = JSON.parse(
    await evaluate(
      `JSON.stringify({ url: location.pathname, chars: (document.getElementById('app')||{innerHTML:''}).innerHTML.length, text: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,110) })`
    )
  );

  const problems = [...new Set(bucket.problems)];
  const failed = [...new Set(bucket.failed)];
  const bad = problems.length || failed.length || info.chars < 200;

  console.log(`\n${bad ? 'FAIL' : 'ok  '} ${route} -> ${info.url} (${info.chars} chars)`);
  console.log(`     "${info.text}"`);
  for (const p of problems.slice(0, 5)) console.log('     ! ' + p.split('\n')[0].slice(0, 200));
  for (const f of failed.slice(0, 5)) console.log('     > ' + f);
}

ws.close();
process.exit(0);