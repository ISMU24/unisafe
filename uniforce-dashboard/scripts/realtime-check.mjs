/**
 * End-to-end realtime verification: an SOS and a report created through the API
 * (exactly as the mobile app does) must appear in the already-open dashboard
 * with no reload, and a targeted alert must appear in the notification bell.
 *
 * Covers the three push paths the operator depends on:
 *   sos-update      -> /emergency
 *   incident-update -> /incidents
 *   alert-update    -> notification bell
 *
 * Usage: node scripts/realtime-check.mjs <baseUrl> <responderEmail> <responderPw> <studentEmail> <studentPw> [adminEmail] [adminPw]
 */
const base = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '');
const apiBase = process.env.API_BASE || 'http://127.0.0.1:3001';
const [responderEmail, responderPw, studentEmail, studentPw, adminEmail, adminPw] = process.argv.slice(3);

const DEBUG_PORT = 9222;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}`);
};

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBase}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function signIn(email, password) {
  const res = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  if (res.status !== 200) throw new Error(`API login failed for ${email}: ${res.status}`);
  return res.body.accessToken;
}

// Poll the DOM until `needle` shows up, without ever reloading the page.
async function waitForText(needle, seconds = 20) {
  for (let i = 0; i < seconds; i += 1) {
    await sleep(1000);
    const text = await evaluate('document.body.innerText');
    if (text.includes(needle)) return { found: true, seconds: i + 1, text };
  }
  return { found: false, seconds: seconds, text: await evaluate('document.body.innerText') };
}

// ── Open the dashboard as a responder ──────────────────────────────────────
await send('Page.navigate', { url: `${base}/login` });
await sleep(1500);
await evaluate('localStorage.clear()');
await send('Page.navigate', { url: `${base}/login` });
await sleep(3000);

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
await sleep(5000);

const studentToken = await signIn(studentEmail, studentPw);
const adminToken = adminEmail ? await signIn(adminEmail, adminPw) : null;

// ── 0. The main dashboard reflects a new SOS too ──────────────────────────
// Observe the "Active SOS" tile. The dispatch log is capped at five rows, so a
// new entry pushes an old one out and its row count never rises - the tile is
// the one place on this page that reflects the whole live SOS feed.
console.log('\nSOS created from the app -> main dashboard (/)');
await send('Page.navigate', { url: `${base}/` });
await sleep(6000);

const activeSosTile = () =>
  evaluate(`(() => {
    const label = [...document.querySelectorAll('span')]
      .find(s => s.textContent.trim() === 'Active SOS');
    if (!label) return null;
    const value = label.parentElement.nextElementSibling;
    return value ? value.textContent.trim() : null;
  })()`);

const tileBefore = await activeSosTile();
check('main dashboard renders an Active SOS tile', tileBefore !== null, `value="${tileBefore}"`);

const dashSos = await api('/api/sos', {
  method: 'POST',
  token: studentToken,
  body: { latitude: -6.6740, longitude: 146.998, location_text: 'Realtime main-dashboard verification' },
});
check('SOS accepted by the API', dashSos.status === 201, `HTTP ${dashSos.status}`);

let dashSeen = false;
let dashSeconds = 0;
let tileAfter = tileBefore;
for (let i = 0; i < 20; i += 1) {
  await sleep(1000);
  dashSeconds = i + 1;
  tileAfter = await activeSosTile();
  if (Number(tileAfter) === Number(tileBefore) + 1) { dashSeen = true; break; }
}
check(
  'the Active SOS count on the open main dashboard increases without a reload',
  dashSeen,
  dashSeen ? `after ${dashSeconds}s (${tileBefore} -> ${tileAfter})` : `stuck at "${tileAfter}", expected ${Number(tileBefore) + 1}`
);

// ── 1. SOS reaches /emergency live ─────────────────────────────────────────
console.log('\nSOS created from the app -> /emergency');
await send('Page.navigate', { url: `${base}/emergency` });
await sleep(6000);

const sosMarker = `SOS-LIVE-${Date.now()}`;
const sosRes = await api('/api/sos', {
  method: 'POST',
  token: studentToken,
  body: { latitude: -6.6735, longitude: 146.997, location_text: sosMarker },
});
check('SOS accepted by the API', sosRes.status === 201, `HTTP ${sosRes.status}`);

const sosSeen = await waitForText(sosMarker, 20);
check(
  'SOS appears on the open Emergency page without a reload',
  sosSeen.found,
  sosSeen.found ? `after ${sosSeen.seconds}s` : 'never appeared'
);

// ── 2. Incident reaches /incidents live ────────────────────────────────────
console.log('\nReport created from the app -> /incidents');
await send('Page.navigate', { url: `${base}/incidents` });
await sleep(6000);

const incMarker = `INC-LIVE-${Date.now()}`;
const incRes = await api('/api/incidents', {
  method: 'POST',
  token: studentToken,
  body: {
    category: 'Security',
    title: 'Realtime report verification',
    description: incMarker,
    location_text: 'Library, North Campus',
    priority: 'Medium',
  },
});
check('report accepted by the API', incRes.status === 201, `HTTP ${incRes.status}`);

const incSeen = await waitForText(incMarker, 20);
check(
  'report appears on the open Incidents page without a reload',
  incSeen.found,
  incSeen.found ? `after ${incSeen.seconds}s` : 'never appeared'
);

// ── 3. Targeted alert reaches the bell live ────────────────────────────────
console.log('\nAlert targeted at the responder -> notification bell');
const alertMarker = `ALERT-LIVE-${Date.now()}`;
if (adminToken) {
  const alertRes = await api('/api/alerts', {
    method: 'POST',
    token: adminToken,
    body: { title: alertMarker, message: 'Realtime alert verification', severity: 'Critical', target_roles: ['SECURITY'] },
  });
  check('alert accepted by the API', alertRes.status === 201 || alertRes.status === 200, `HTTP ${alertRes.status}`);

  await sleep(6000);
  // Open the bell so its contents render.
  await evaluate(`(() => {
    const btn = document.querySelector('.notif-btn');
    if (btn) btn.click();
    return btn ? 1 : 0;
  })()`);
  await sleep(2500);

  const bellText = await evaluate('document.body.innerText');
  check(
    'alert appears in the notification bell without a reload',
    bellText.includes(alertMarker),
    bellText.includes(alertMarker) ? 'found' : `bell said: ${bellText.replace(/\s+/g, ' ').slice(0, 160)}`
  );
  const stale = ['SOS-7702', 'INC-4471', 'INC-4468'].filter((m) => bellText.includes(m));
  check('bell no longer shows the old mock entries', stale.length === 0, stale.join(', ') || 'none');
} else {
  check('admin credentials supplied for the alert step', false, 'skipped - no admin credentials');
}

if (errors.length) {
  console.log('\nconsole errors:');
  for (const e of [...new Set(errors)].slice(0, 5)) console.log('  ' + e.split('\n')[0]);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
ws.close();
process.exit(failed.length ? 1 : 0);
