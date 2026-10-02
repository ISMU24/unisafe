/**
 * Loads a page in headless Chrome via the DevTools protocol and reports
 * console errors, uncaught exceptions and failed requests.
 *
 * Chrome's --dump-dom is unreliable on this machine, so this drives CDP
 * directly over Node's built-in WebSocket.
 *
 * Usage: node scripts/browser-check.mjs <url> [waitMs]
 */
const url = process.argv[2] || 'http://localhost:5173/login';
const waitMs = Number(process.argv[3] || 6000);

const DEBUG_PORT = 9222;

async function findTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('No Chrome DevTools target became available.');
}

const wsUrl = await findTarget();
const ws = new WebSocket(wsUrl);

let nextId = 1;
const pending = new Map();
const problems = [];
const logs = [];

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);

  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }

  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    problems.push(
      `UNCAUGHT: ${d.exception?.description || d.text} @ ${d.url || '?'}:${d.lineNumber}`
    );
  }

  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
    if (msg.params.type === 'error') problems.push(`CONSOLE ERROR: ${text}`);
    else logs.push(`${msg.params.type}: ${text}`);
  }

  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') problems.push(`LOG(${e.source}): ${e.text}`);
  }
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');

const failedRequests = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Network.loadingFailed') {
    failedRequests.push(`${msg.params.type} failed: ${msg.params.errorText}`);
  }
  if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    failedRequests.push(`HTTP ${msg.params.response.status} ${msg.params.response.url}`);
  }
});

await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, waitMs));

const { result } = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    appHtml: (document.getElementById('app')||{}).innerHTML || '',
    bodyText: (document.body.innerText || '').slice(0, 600),
    title: document.title
  })`,
  returnByValue: true,
});

const dom = JSON.parse(result.value);

console.log(`URL: ${url}`);
console.log(`title: ${dom.title}`);
console.log(`#app rendered chars: ${dom.appHtml.length}`);
console.log(`\n--- visible text ---\n${dom.bodyText.trim() || '(EMPTY - nothing rendered)'}`);

if (problems.length) {
  console.log(`\n--- ${problems.length} PROBLEM(S) ---`);
  for (const p of [...new Set(problems)]) console.log('  ' + p);
}
if (failedRequests.length) {
  console.log(`\n--- ${failedRequests.length} FAILED REQUEST(S) ---`);
  for (const r of [...new Set(failedRequests)].slice(0, 20)) console.log('  ' + r);
}
if (!problems.length && !failedRequests.length) console.log('\nno console errors, no failed requests');

ws.close();
process.exit(0);