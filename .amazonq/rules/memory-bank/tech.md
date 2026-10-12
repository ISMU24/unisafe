# UniSafe - Technology and Operations

Reviewed against local manifests/source on 2026-10-12 (Pacific/Port_Moresby).
Versions are declared dependency ranges, not claims about the latest releases.

## Stack

| Component | Declared technologies |
|---|---|
| Mobile | Expo ~57.0.26, React Native ~0.86.3, React 19.2.3, React Navigation 7, AsyncStorage 2.2.0, Reanimated ~4.5, Worklets ~0.10 |
| Mobile capabilities | expo-location, expo-image-picker, expo-web-browser, Fuse.js 7, Socket.IO client ^4.8.4 |
| API | Node.js, Express ^4.21.0, ESM, Zod ^3.23.8, Socket.IO ^4.7.5 |
| Database | pg ^8.23.0, better-sqlite3 ^13.0.3; shared async adapter, no ORM |
| Auth/security | jsonwebtoken ^9.0.3, bcrypt ^6.0.0, helmet ^8.3.0, express-rate-limit ^8.7.0, cors, dotenv |
| Policy Q&A | Anthropic SDK ^0.32.1, Voyage HTTP embeddings, local JSON index |
| Dashboard | React ^19.2.0, Vite ^8.2.0, React plugin ^6.1.1, React Router ^7.18.2 |
| Dashboard visuals | Leaflet/react-leaflet, Recharts, Chart.js/react-chartjs-2, lucide-react |
| Checks | Vitest ^2.1.0, Supertest 7, Node test runner for mobile API, Chrome DevTools scripts |

Root/mobile require Node >=22.13.0. Server/dashboard declare "type": "module";
Expo transforms mobile source, while mobile Babel/Metro config and policy scripts
use CommonJS. Dashboard TypeScript is a dev dependency; no type-check script is declared.

## Configuration

| Variable | Consumer and behavior |
|---|---|
| EXPO_PUBLIC_API_URL | Mobile build-time public origin; then app.json extra.apiUrl; missing/invalid resolves to no API, including development |
| VITE_API_URL | Dashboard build-time origin; localhost:3001 in dev, same origin in production when unset |
| DATABASE_URL | Primary PostgreSQL selector; required in production; DB_HOST is the alternative |
| DB_HOST, DB_PORT, DB_NAME/DB_DATABASE, DB_USER/DB_USERNAME, DB_PASSWORD | PostgreSQL parts when no connection string; DB_HOST selects this path |
| SQLITE_PATH | SQLite filename or :memory:; defaults to UniSafe/server/data/unisafe.db when SQLite is explicitly enabled and PostgreSQL is unconfigured |
| ALLOW_SQLITE_FALLBACK | Must be exactly `true` for development/test SQLite when PostgreSQL selectors are absent; ignored in production |
| DB_SSL, DB_SSL_REJECT_UNAUTHORIZED, DB_SSL_CA | PostgreSQL TLS; CA is a file path. Current TLS options only verify certificates when explicitly enabled |
| DB_POOL_MAX, DB_IDLE_TIMEOUT_MS, DB_CONNECT_TIMEOUT_MS | Pool tuning; defaults 10, 30000, 15000 |
| JWT_ACCESS_SECRET, JWT_REFRESH_SECRET | Server-only; production requires distinct values at least 32 characters long |
| JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY | Token lifetimes; blueprint uses 900 and 604800 seconds |
| CLIENT_ORIGINS | Browser origin list for REST/Socket.IO CORS; ALLOWED_ORIGINS is also accepted |
| ANTHROPIC_API_KEY, VOYAGE_API_KEY | Optional server-only policy AI credentials |
| INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD | Explicit first-admin bootstrap when no admin exists |
| SEED_*_EMAIL, SEED_*_PASSWORD | Seed-account overrides; inspect seed-db.js and deployment guides before use |
| PORT, NODE_ENV | API listener (default 3001) and environment behavior |

Rate limits are defined in server/src/config/rate-limits.js. Login/refresh
limiters are mounted in auth routes; API/upload/AI limiters are exported but
currently unmounted.

Use tracked .env.example and .env.production.example templates. Never copy real
env values into documentation. Public client variables must contain no secrets.
Mobile release requests reject non-HTTPS/invalid origins before network access.
There is no automatic emulator/localhost fallback. Configure an explicit HTTP
origin for LAN development or HTTPS for release. extra.EXPO_PUBLIC_API_URL is
not read by the resolver; use the environment variable or extra.apiUrl.

The mobile REST client adds ngrok-skip-browser-warning: true to every request,
including refresh/retry. Mobile Socket.IO adds it through extraHeaders while
retaining token auth and websocket/polling transports. Server CORS_HEADERS only
lists Content-Type, Authorization, Accept, so cross-origin Expo web requests
with the added header are not covered by the native checks and can fail preflight.

## Commands

Root scripts forward into independent packages; install dependencies in the
packages being used.

| Directory | Command | Purpose |
|---|---|---|
| Root | `npm start` / `npm run web` | Expo native/web development |
| Root | `npm run server` / `npm run dashboard` | API / Vite development |
| Root | `npm test` | Server Vitest suite |
| Root | `npm run db:init` / `npm run seed` | Initialize/seed configured database; writes data |
| Root | `npm run e2e` | Credentialed API/realtime verification against a running server |
| Root | `npm run reconcile:policies` / `npm run index:policies` | Mutate policy assets/build index; indexing calls the embedding provider |
| UniSafe/server | `npm run dev` / `npm start` | Node watch / normal API startup |
| UniSafe/server | `npm run start:sqlite` | Load env, clear PostgreSQL selectors in this process, start normal API with SQLite |
| UniSafe/server | `npm run db:init` / `npm run db:seed` | Direct schema/seed commands |
| UniSafe | `npm run tunnel` | Expo/Metro tunnel; does not expose API port 3001 |
| UniSafe | `npm run android` / `npm run ios` | Native development builds |
| UniSafe | `node --test scripts/check-api.mjs` | Offline URL, timeout, delivery, and unavailable-policy checks |
| uniforce-dashboard | `npm run build` / `npm run preview` | Build/serve dist/ |
| uniforce-dashboard | `npm run check:page` / `npm run check:routes` | Browser page/route checks |
| uniforce-dashboard | `npm run check:live` / `npm run check:realtime` | Incident/SOS/alert push checks with test accounts |
| Root (PowerShell) | `.\demo-tools\set-phone-url.ps1` | Choose physical LAN adapter; update only UniSafe/.env EXPO_PUBLIC_API_URL |
| Root (PowerShell) | `.\demo-tools\start-demo.ps1` | Open API/dashboard/Expo terminals; skip API if port 3001 has a listener |
| Root (PowerShell) | `.\demo-tools\check-demo.ps1` | Read-only port, local/LAN health, firewall-rule presence, dashboard origin checks |
| Root (PowerShell) | `.\demo-tools\start-tunnel.ps1` | Check local SQLite health, then foreground cloudflared for API only |

e2e-verify.mjs reads BASE_URL (default http://127.0.0.1:3198),
ADMIN_EMAIL/ADMIN_PASSWORD, SECURITY_EMAIL/SECURITY_PASSWORD, and
STUDENT_EMAIL/STUDENT_PASSWORD. It creates records. Browser scripts require a
running API/dashboard and Chrome remote debugging on port 9222; inspect each
usage header for arguments. Live/realtime scripts also accept API_BASE.

From the server directory, `node scripts/check-audit.mjs` requires AUDIT_API_URL,
AUDIT_ADMIN_EMAIL, and AUDIT_ADMIN_PASSWORD. It requires a PostgreSQL-backed API,
logs in, verifies the new LOGIN audit row, and logs out. It is not read-only.
db:reset-reports is destructive local SQLite maintenance, not routine validation.

## Deployment

- render.yaml declares an API service, static dashboard, and PostgreSQL database.
  Set actual API/dashboard origins in VITE_API_URL/CLIENT_ORIGINS; the blueprint
  uses manual values for these URL settings.
- docker-compose.yml runs PostgreSQL 16, the API, and an nginx dashboard.
  The dashboard uses its own origin; nginx forwards /api/ and /socket.io/.
- vite.config.js provides dev proxies. An explicit VITE_API_URL makes clients
  use that origin; CORS must match the browser origin.
- EAS has development, preview APK, production, and production APK profiles.
  Preview and production target Render; production-apk currently targets an ngrok
  HTTPS origin. Development has no profile URL. Check the selected profile before
  building: a Cloudflare tunnel or local .env change does not update eas.json.
- app.json now includes extra.eas.projectId. Its Android permissions currently
  contain duplicated fine/coarse location entries and RECORD_AUDIO; review the
  required permissions separately before a release. Configuration is not build evidence.
- Android native output is generated/ignored. Prefer Expo configuration for
  durable changes. Rebuild clients after changing bundled public origins.
- /health and /api/health are public readiness checks. Require db.connected and
  verify db.engine; database failures return 503. API health also reports policy
  index presence and RAG configuration.

Follow LOCAL-TUNNEL-DEMO.md for temporary SQLite/HTTPS demos, DEPLOY-WINDOWS.md
for hosted deployment, and TESTING.md for device acceptance. Older sections of
UniSafe/DEPLOYMENT.md still describe removed emulator fallbacks and outdated EAS
values; current source/profile settings take precedence for those details.
Repository configuration alone does not prove services are live.

## SQLite and tunnel operations

- start:sqlite retains SQLITE_PATH (default server/data/unisafe.db), PORT, JWT,
  CORS and optional AI settings. It clears DATABASE_URL and DB_HOST after dotenv
  loads, before database modules are evaluated. It does not edit .env or reset data.
- Normal startup still initializes schema and may bootstrap a configured first
  admin. Leave INITIAL_ADMIN_* unset when no account creation is intended.
- start-demo.ps1 uses normal root npm run server, not start:sqlite. For the SQLite
  tunnel workflow, start the server explicitly using the server-directory command.
- start-tunnel.ps1 needs cloudflared.exe on PATH. It requires status=ok,
  db.connected=true, db.engine=sqlite at both /health and /api/health, then forwards
  the whole API origin. Parameters: -Port (3001), -ApiHost (localhost or 127.0.0.1),
  -Protocol (auto, http2, quic). Ctrl+C stops its foreground tunnel.
- The helper saves no URL, launches no API, changes no firewall setting, and builds
  no APK. Use the assigned HTTPS origin in the selected mobile build configuration.
- check-demo.ps1 is for LAN checks and accepts -LanIp. Firewall PASS means rule
  existence only; its output is not a complete firewall/reachability assessment.
- set-phone-url.ps1 excludes virtual/VPN adapters and asks when several physical
  adapters qualify. Its HTTP URL is for development, not a release APK.

## Verified local checks (2026-10-05)

- Server `npm test`: 73 tests passed across 7 files. The realtime suite now starts
  scripts/start-sqlite.js with conflicting PostgreSQL selectors and in-memory
  SQLite, exercising the launcher without using the developer's database/.env.
- Mobile `node --test scripts/check-api.mjs`: 8 checks passed, including explicit
  URL configuration, ngrok headers through refresh/retry, realtime subscriptions/
  cleanup, release HTTPS, timeout/delivery behavior, and unavailable policy AI.
- Dashboard `npm run build`: passed; Vite reported a bundle chunk over 500 kB.
- All four demo PowerShell scripts passed syntax parsing without being launched.
  All five memory-bank files passed UTF-8/date/fence/whitespace/link validation;
  `git diff --check -- .amazonq` passed.
- Browser checks, public-tunnel login/events, hosted PostgreSQL, Expo/native
  rebuilds, and physical-device acceptance were not run during this refresh.
- See progress.md for scan scope, historical milestones, artifacts, and handoff.

## Additional checks (2026-10-12)

- Mobile `node --test scripts/check-api.mjs`: 8/8 passed.
- Dashboard `npm run build`: passed; Vite again reported a bundle chunk over
  500 kB. These checks validate local behavior/build output, not live services or
  the authenticated dashboard password-change flow.
