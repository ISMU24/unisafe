# Uniforce Dashboard — Agent Instructions

Security operations dashboard for PNGUOT (Papua New Guinea University of
Technology), Taraka Campus, Lae, Morobe Province, PNG. React 19 + Vite SPA.

The API in `UniSafe/server` is the **single source of truth**. This app holds no
database and no client-side data store — it is REST + Socket.IO only.

## Key files

- `src/api.js` — the only HTTP client. Exports `API_BASE`, resolved from
  `VITE_API_URL` (build time), falling back to `''` in production so the app
  calls its own origin, and `http://localhost:3001` in dev.
- `src/realtime.js` — authenticated Socket.IO connection shared app-wide.
- `src/context/AuthContext.jsx` — login, token storage, refresh, role.
- `src/context/ThemeContext.jsx` — dark/light.
- `src/services/mockData.js` — campus building map and palette **only**.
  Never use it as a data source for incidents, alerts, or users.
- `src/utils/roles.js` — role → route/nav visibility mapping.
- `src/pages/` — Dashboard, Incidents, Emergency, Alerts via NotificationBell,
  Analytics, Reports, Users, AI Tools, Profile, Settings, Login.
- `src/components/` — Navbar, Sidebar, NotificationBell, DashboardCard,
  StatisticsCard, UniForceUI.

`src/firebase/` is an empty leftover from a discarded design. Delete it; do not
reintroduce the SDK.

## Build-time configuration

`VITE_API_URL` is inlined by Vite at **build** time. Setting it on a running
container or in the browser does nothing.

- Do **not** append `/api` — `api.js` adds the path itself.
- `uniforce-dashboard/.env` exists locally and points at `localhost:3001`.
  Vite lets a host-set environment variable win over `.env`, so CI builds are
  fine, but a `dist/` built on a dev machine is wired to localhost.
- In `docker-compose.yml` the dashboard is built **without** `VITE_API_URL`, so
  it calls its own origin and nginx proxies `/api/` and `/socket.io/` to the
  `server` service.

## CORS

The dashboard is a browser app, so it always sends an `Origin`. The API must
list the dashboard's origin in `CLIENT_ORIGINS` or every REST call **and** the
WebSocket upgrade fail with an opaque error. A dashboard that renders its shell
but 401s on data is almost always a CORS misconfiguration.

## Realtime

One connection, authenticated with the access token. The server joins it to
`user:<uuid>`, `role:<ROLE>`, and — for responders — the shared `responders`
room, so a student only ever receives events about their own records.

Events: `incident-update`, `sos-update`, `alert-update`, `assistance-update`,
`appeal-update`.

### Incidents and SOS are two separate feeds

`POST /api/incidents` and `POST /api/sos` write to **different tables**
(`incidents` and `sos_events`). An SOS raised from the mobile app appears in
`/api/sos` and **never** in `/api/incidents`.

Any view that must show emergencies therefore has to read *both*:

| Page | Feeds | Notes |
|---|---|---|
| `/` Dashboard | `subscribeIncidents` + `subscribeSOSEvents` | The "Active SOS" tile counts the SOS feed. It once counted only incidents, so a real SOS never moved the number. The dispatch log merges both, newest first. |
| `/incidents` | `subscribeIncidents` | Reports only. |
| `/emergency` | `subscribeSOSEvents` | SOS only. |
| Notification bell | `subscribeAlerts` | Reads `/api/alerts/my`. |

`/api/alerts` is restricted to ADMIN and ICT_ADMIN, so the bell uses
`/api/alerts/my`, which every role can call. The bell used to render a
hardcoded list — so it could never show anything the app actually sent.

`LIVE_EVENTS` in `api.js` already covers both `incident-update` and
`sos-update`; subscribing to one feed still refreshes on the other's events,
because each subscriber refetches over REST rather than trusting the payload.

### `connectRealtime()` is not synchronous

It returns the live socket **only if it is already connected**. While the
handshake is in flight it returns a *Promise*, and on a failed handshake it
returns `null`. Anything that touches the return value directly will break:

```js
// Wrong - throws "client.on is not a function" on the first render,
// which blanked Dashboard, Incidents and Emergency after login.
const client = connectRealtime();
client.on('incident-update', handler);
```

Subscription happens during the first render, long before the socket connects,
so always go through `subscribeRealtime(event, handler)`, which binds now or
when the handshake resolves and returns a working unsubscribe.

Realtime is an enhancement. Every page also refetches on focus, so a broken
WebSocket makes the UI slower to update, never wrong.

## Browser checks

`npm run build` passing says nothing about runtime behaviour — a module-level
crash still produces a clean bundle. These drive headless Chrome over the
DevTools protocol and report console errors, uncaught exceptions and failed
requests per route:

```bash
# start the API and a dashboard first, then in another shell:
node "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new \
  --remote-debugging-port=9222 --user-data-dir="%TEMP%\cdp" about:blank

npm run check:routes -- http://localhost:5173 security@pnguot.ac.pg <password>
npm run check:live   -- http://localhost:5173 responder@... <pw> student@... <pw>
npm run check:realtime -- http://localhost:5173 responder@... <pw> student@... <pw> admin@... <pw>
```

`check:routes` signs in through the real form and walks every page.
`check:live` proves the incident push path by creating a report over REST while
the page sits open, then asserting it appears without a reload.
`check:realtime` is the full check — SOS to `/`, SOS to `/emergency`, report to
`/incidents`, and a targeted alert to the bell, each without a reload. **A page
that renders is not the same as a page that updates**, and a view can render
perfectly while silently ignoring a whole feed.

Watch out when asserting on the Dashboard: the dispatch log is capped at five
rows, so adding one pushes another out and its row count never rises. Assert on
the "Active SOS" tile instead.

Note `check:live` must put its marker in the incident **description**:
`normalizeIncident` maps `desc` from `description` (falling back to `title`),
and the incidents table renders `desc`.

## Known gaps

- `src/pages/AITools.jsx` renders fabricated data. The real RAG endpoint is
  `POST /api/policy-search` and returns 503 unless `ANTHROPIC_API_KEY` and
  `VOYAGE_API_KEY` are configured. Wire it up rather than inventing output.
- `src/pages/Settings.jsx` is inert — it renders but persists nothing.
- The server authenticates students, so a student can sign in here and land on
  pages that answer "Insufficient permissions." The dashboard is a staff tool;
  consider refusing non-responder roles at login.
- There is no `vite.config.*`, so `npm run dev` has no API proxy and relies on
  `VITE_API_URL` plus the API's CORS allowlist.

## Role scoping

Dashboard statistics are role-scoped server-side, not filtered in the browser:

- Students get **403** from `/api/incidents/stats` and `/api/dashboard/stats`.
- Security and medical users receive only their own categories.

`src/utils/roles.js` must match the API's role names. A mismatch here silently
hides navigation items rather than erroring.

## Commands

```bash
npm run dev           # Vite dev server, http://localhost:5173
npm run build         # production build to dist/
npm run preview       # serve the built bundle
npm run check:routes  # walk every page in headless Chrome, report console errors
npm run check:live    # prove incident push updates an open page
npm run check:realtime # prove SOS, incident and alert push all update live
```

The build currently emits a chunk-size warning. It is not an error.

## Campus map

`src/services/mockData.js` → `CAMPUS_BUILDINGS`, centred on
`CAMPUS_CENTRE = [-6.6700, 146.9950]` (≈ 6°40'12"S 146°59'42"E). `MAP_MARKERS`
derives from it and `buildingForLocation(loc)` resolves an incident's location
string to a building position so map circles land on the real building.