# UniSafe — Agent Instructions

Campus safety app for PNGUOT (Papua New Guinea University of Technology). React
Native / Expo, with an Express API and a separate React security dashboard.

## Architecture

All data lives in the **API and its database**. There is no client-side store
and no Firebase.

| Piece | Path | Stack |
|---|---|---|
| Mobile app | `UniSafe` | Expo SDK 57, React Native 0.86, Hermes |
| API | `UniSafe/server` | Express, Socket.IO, ESM, PostgreSQL (SQLite fallback) |
| Dashboard | `uniforce-dashboard` | React 19, Vite |

```
app  ──HTTPS + Socket.IO──>  server  ──>  PostgreSQL
dashboard ──HTTPS + Socket.IO──>  server
```

The app sends **no** `Origin` header, so the API's CORS allowlist does not
constrain it. The dashboard does send one, so its origin must be in
`CLIENT_ORIGINS` or every REST call and the WebSocket upgrade fail.

`src/firebase/` and `uniforce-dashboard/src/firebase/` are empty leftovers from
a discarded design. Delete them; do not reintroduce the SDK.

## Key files

**Mobile**
- `App.js` — navigation; binds the realtime socket to app lifecycle.
- `src/utils/api.js` — the only HTTP client. Reads `EXPO_PUBLIC_API_URL`.
- `src/utils/realtime.js` — one authenticated Socket.IO connection.
- `src/utils/aiTriage.js`, `duplicateDetector.js` — local helpers, no I/O.
- `src/theme.js` — brand colours, radii, category metadata.
- `src/data/policyCatalog.js` — bundled policy PDFs (`Assets/Policies/`).
- `src/data/mock.js`, `src/data/users.js` — **display-only** placeholders, not a
  data source. Never render an alert or incident from these when the API is
  reachable; an unreachable API must surface an error.
- `screens/` — 14 screens: login, home, report, my reports, SOS, alerts, appeals.

**API** (`UniSafe/server`)
- `index.js` — app wiring, CORS, auth middleware, Socket.IO, error handler.
- `src/config/` — env parsing, database (PostgreSQL/SQLite), schema, pool.
- `src/models/` — every SQL statement lives here.
- `src/routes/` — `auth`, `incidents`, `sos`, `alerts`, `assistance`, `appeals`,
  `users`, `dashboard`, `health`, `rag`.
- `rag.js` — policy embeddings + Q&A. Degrades gracefully when Voyage or
  Anthropic keys are absent.

## Commands

```bash
# API
cd server && npm run dev        # watch
cd server && npm test           # vitest, 66 tests
cd server && npm run db:init
cd server && npm run db:seed    # prints generated passwords once

# Mobile
npm start                       # Expo dev server
npx expo-doctor                 # config sanity

# Dashboard
cd ../uniforce-dashboard && npm run build
```

## Realtime contract

One connection per session, authenticated with the access token. The server
joins the socket to `user:<uuid>`, `role:<ROLE>`, and — for responders — the
shared `responders` room.

| Event | Meaning |
|---|---|
| `incident-update` | created, updated, assigned, status changed, deleted |
| `sos-update` | triggered, acknowledged, responding, resolved, cancelled |
| `alert-update` | broadcast alert, or targeted delivery via `emitAlertToUsers()` |
| `assistance-update` | assistance request lifecycle |
| `appeal-update` | appeal submitted or adjudicated |

Emit from the route handler **after** the write commits, not before. Alerts
carry `target_roles` (role *names*, for the API) and `target_role_ids` (numeric
IDs, internal). Getting those backwards silently breaks targeted delivery.

### The connect contract

`connectRealtime()` **always returns a Promise** that resolves to the socket, or
`null` when there is no stored session. Both clients used to return the live
socket synchronously once connected and a Promise while connecting, so a caller
could not tell which it had:

- Dashboard did `client.on(...)` on it and threw
  `client.on is not a function`, blanking Dashboard, Incidents and Emergency
  after login.
- Mobile did `.then(...)` on it and threw
  `connectRealtime(...).then is not a function` on any screen that subscribed
  after the socket was already up.

Both failed only at runtime, so `npm run build` and `expo export` stayed green.
Subscribe only through `subscribeRealtime(event, handler)`, which handles both
states; use `getSocket()` if a synchronous handle is genuinely needed.

The mobile module dispatches through a central `listeners` set: each client
registers one `notify` handler per event at creation, and `notify` fans out to
whoever is subscribed at delivery time. Do not add a second `client.on(event)`
after the fact — it double-delivers.

Realtime is an enhancement, not a dependency: screens also poll or refetch on
focus, so a blocked WebSocket makes the app slower, never wrong.

## Environment

| Variable | Where | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `UniSafe/.env` | **Inlined into the JS bundle at build time and readable by anyone who unzips the APK.** Never put a secret here. |
| `DATABASE_URL` | `server/.env` | Omit and the server uses a local SQLite file that loses data on redeploy. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `server/.env` | 32+ chars, must differ. Production refuses to boot otherwise. |
| `CLIENT_ORIGINS` | `server/.env` | Comma-separated dashboard origins. |
| `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` | `server/.env` | Optional. Absent ⇒ policy Q&A returns 503, nothing else breaks. |

`.env` files are gitignored; `.env.example` and `.env.production.example` are
tracked templates. Never commit a real secret.

## Deployment

See `DEPLOYMENT.md` for the full guide — Render blueprint, Vercel/Netlify,
Docker Compose, EAS cloud builds, and the local `assembleRelease` path.

Two traps:
- `EXPO_PUBLIC_API_URL` must be `https://` for a real device. `http://` works on
  an emulator and fails on hardware.
- `VITE_API_URL` is read at **build** time by Vite. Setting it on a running
  container does nothing.

## Android

`android/` is generated by `expo prebuild` and gitignored. Edits to it — such as
the local-testing `network_security_config.xml` — do not survive a prebuild.
Prefer app config in `app.json`; re-apply generated-project edits after a
prebuild, and drop them entirely once the API URL is HTTPS.

## Design system

- Primary red `#A80808`, gold `#F8E808`, deep maroon `#680808`.
- Incident categories: Security (blue), Fire (red), Ambulance (green), Other (orange).
- Policies: neutral steel `#455A64`, distinct from the incident palette.
- IDs render in monospace `Courier New`.
- Dark theme via `ThemeContext`.