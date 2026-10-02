/**
 * Proves the dashboard updates without a refresh: signs in as a responder,
 * loads /incidents, then creates a brand-new incident through the REST API as
 * a student and checks that it appears in the already-rendered page.
 *
 * This is the only check that proves the Socket.IO push path works end to end
 * rather than merely rendering the initial REST fetch.
 *
 * Usage: node scripts/live-check.mjs <baseUrl> <responderEmail> <responderPw> <studentEmail> <studentPw>
 */
const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const apiBase = process.env.API_BASE || 'http://localhost:3001';
const [responderEmail, responderPw, studentEmail, studentPw] = process.argv.slice(3);

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
const errors = [];

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
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
});

await send('Runtime.enable');
await send('Page.enable');

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.text);
  return result.value;
};

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBase}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── Sign the responder in through the form ─────────────────────────────────
await send('Page.navigate', { url: `${base}/login` });
await new Promise((r) => setTimeout(r, 1500));
await evaluate(`localStorage.clear()`);
await send('Page.navigate', { url: `${base}/login` });
await new Promise((r) => setTimeout(r, 3000));

await evaluate(`(() => {
  const set = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const i = [...document.querySelectorAll('input')];
  set(i[0], ${JSON.stringify(responderEmail)});
  set(i[1], ${JSON.stringify(responderPw)});
  i[0].closest('form').requestSubmit();
  return 1;
})()`);

await new Promise((r) => setTimeout(r, 5000));

// ── Open the incidents page and wait for the socket to settle ──────────────
await send('Page.navigate', { url: `${base}/incidents` });
await new Promise((r) => setTimeout(r, 6000));

const before = await evaluate(`document.body.innerText`);
const marker = `LIVE-PUSH-${Date.now()}`;

// ── Create an incident over REST as the student ────────────────────────────
const login = await api('/api/auth/login', { method: 'POST', body: { email: studentEmail, password: studentPw } });
if (login.status !== 200) throw new Error(`student login failed: ${login.status}`);

const created = await api('/api/incidents', {
  method: 'POST',
  token: login.body.accessToken,
  body: {
    category: 'Security',
    title: 'Realtime push verification',
    // The incidents table renders `desc`, which normalizeIncident derives from
    // description (falling back to title), so the marker has to live here for
    // it to be visible in the DOM.
    description: marker,
    location_text: 'Library, North Campus',
    priority: 'Medium',
  },
});
console.log(`created incident over REST: HTTP ${created.status} (${marker})`);

// ── Did the already-open page pick it up without a reload? ─────────────────
let appeared = false;
let waitedSeconds = 0;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise((r) => setTimeout(r, 1000));
  waitedSeconds = attempt + 1;
  const now = await evaluate(`document.body.innerText`);
  if (now.includes(marker)) { appeared = true; break; }
}

const after = await evaluate(`document.body.innerText`);

console.log(`page text length before: ${before.length}`);
console.log(`page text length after:  ${after.length}`);
console.log(appeared
  ? `\nPASS - the new incident appeared in the open page within ${waitedSeconds}s, no reload`
  : '\nFAIL - the new incident never appeared; the page only updates on a manual refresh');

if (errors.length) {
  console.log('\nconsole errors:');
  for (const e of [...new Set(errors)].slice(0, 5)) console.log('  ' + e.split('\n')[0]);
}

ws.close();
process.exit(appeared ? 0 : 1);
