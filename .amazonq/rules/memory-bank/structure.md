# UniSafe - Project Structure

Reviewed against local source on 2026-10-13 (Pacific/Port_Moresby).
Paths below are relative to the project root unless explicitly scoped.

## Repository layout

```text
Project/
|-- .amazonq/rules/memory-bank/  # product, structure, tech, guidelines, progress
|-- UniSafe/                   # Expo mobile/web client
|   |-- App.js                 # Stack navigation and realtime lifecycle
|   |-- index.js               # Expo entry point
|   |-- screens/               # App screens, including incident, SOS, appeals, assistance
|   |-- src/
|   |   |-- components/        # Appeals, policy browsing/search/AI, category badges
|   |   |-- data/              # Policy catalog, incident taxonomy, display fixtures
|   |   |-- utils/             # api, realtime, records, aiTriage, duplicateDetector
|   |   |-- theme.js
|   |   +-- ThemeContext.js
|   |-- assets/                # Images, Policies/ PDFs, policy-index.json
|   |-- scripts/               # Policy reconciliation/indexing, check-api.mjs
|   |-- app.json               # Expo permissions, plugins, package identifiers
|   |-- eas.json               # development, preview, production, production-apk
|   |-- babel.config.js        # CommonJS Expo/Reanimated config
|   |-- metro.config.js        # CommonJS Metro config
|   |-- AGENTS.md
|   |-- DEPLOYMENT.md
|   +-- server/
|       |-- index.js           # Express/Socket.IO bootstrap; inline health/PDF/RAG routes
|       |-- rag.js             # Policy index, Voyage embeddings, Anthropic answers
|       |-- src/
|       |   |-- auth/          # routes, middleware, tokens, database, passwords, incident-access
|       |   |-- config/        # db.js, schema.sql, sqlite-schema.js, rate-limits.js
|       |   |-- models/        # incidents, sos, alerts, assistance, appeals, users, audit, recycle-bin
|       |   |-- routes/        # Same domains plus dashboard/recycle-bin; auth is under auth/
|       |   +-- realtime.js    # Authentication, rooms, event emitters
|       |-- scripts/          # init-db, seed-db, reset-reports, e2e-verify, check-audit,
|       |                     # start-sqlite (process-local database selection)
|       |-- tests/            # auth, incidents, realtime, db-portability, deployment, seed, debug
|       |-- vitest.config.js
|       |-- data/             # Runtime SQLite location
|       +-- Dockerfile        # Build context is UniSafe/ to include assets
|-- uniforce-dashboard/
|   |-- src/
|   |   |-- App.jsx            # BrowserRouter and route guards
|   |   |-- main.jsx
|   |   |-- api.js             # REST, session refresh, normalizers, polling subscriptions
|   |   |-- realtime.js        # Shared Socket.IO transport
|   |   |-- context/           # AuthContext, ThemeContext
|   |   |-- layouts/Dashboardlayout.jsx
|   |   |-- components/        # Navigation, notification bell, cards, shared UI
|   |   |-- pages/             # Dashboard, Incidents, Emergency, Analytics, Reports,
|   |   |                      # Users, AITools, AuditLogs, RecycleBin, Profile, Settings, Login
|   |   |-- services/mockData.js # Map/palette metadata and shared display constants
|   |   |-- utils/roles.js
|   |   +-- style.css
|   |-- scripts/               # browser-check, route-check, live-check, realtime-check
|   |-- public/                # favicon.svg and icons.svg
|   |-- vite.config.js         # React plugin and dev API/socket proxies
|   |-- Dockerfile
|   |-- nginx.conf             # Production API/socket proxy
|   |-- vercel.json
|   |-- netlify.toml
|   +-- AGENTS.md
|-- demo-tools/
|   |-- set-phone-url.ps1      # Update only the phone's public LAN URL in .env
|   |-- start-demo.ps1         # Normal API, dashboard, Expo development terminals
|   |-- check-demo.ps1         # Read-only LAN/listener/health/firewall checks
|   +-- start-tunnel.ps1       # Health-gated foreground Cloudflare API tunnel
|-- LOCAL-TUNNEL-DEMO.md       # SQLite + temporary HTTPS demo workflow
|-- DEPLOY-WINDOWS.md          # PowerShell deployment, seed, login/audit, APK steps
|-- TESTING.md                 # Physical-device acceptance checklist
|-- docker-compose.yml        # PostgreSQL + API + nginx dashboard
|-- render.yaml               # API, static dashboard, PostgreSQL blueprint
+-- package.json              # Convenience scripts; no npm workspaces declaration
```

Dependencies, generated builds/native output, .expo, logs, and .verification
snapshots are not canonical source. Never copy credentials, database contents,
or generated output into the memory bank.

## Runtime relationships

```text
Expo app -------- REST + Socket.IO ----> Express API ----> PostgreSQL or SQLite
React dashboard - REST + Socket.IO ----> Express API
Express policy Q&A -------------------> Voyage + Anthropic (optional)
Express PDF routes ------------------> UniSafe/assets/Policies/
```

- Domain SQL is primarily in server/src/models/; authentication SQL also lives
  in server/src/auth/database.js. Schema/bootstrap SQL lives in config/scripts.
- server/src/config/db.js owns the pool, lazy schema initialization, async
  prepared-query adapter, transactions, and engine conversions. There is no
  separate env parser or pool file in config/.
- PostgreSQL is mandatory in production. SQLite requires an explicit local
  development/test opt-in or the dedicated start-sqlite launcher; a PostgreSQL
  connection error never triggers an engine switch.
- /health, /api/health, /api/policy-search, and /api/policies/:folder/:filename
  are declared in server/index.js, not separate health or RAG router files.
- POST /api/incidents/report accepts multipart report data and bounded JPEG/PNG
  attachments; GET /api/incidents/:id/media/:mediaId applies incident visibility.
- /api/recycle-bin is an ADMIN/ICT_ADMIN API for listing, recycling, restoring,
  and permanently deleting records across supported domains.
- Audit logs have a router/model, dashboard /audit-logs page, and
  server/scripts/check-audit.mjs for a PostgreSQL API round trip.
- UniSafe/src/data/policyCatalog.js and incidentTypes.js provide policy metadata
  and incident type choices; mock.js and users.js are display fixtures.
- server/scripts/start-sqlite.js imports dotenv before clearing PostgreSQL
  selectors, then dynamically loads index.js. Root npm run server does not use it.
- The tunnel forwards the API only; it is separate from Expo's Metro tunnel.
  The local dashboard remains a browser client of the API, normally on port 5173.
- progress.md records the Git milestones, uncommitted work, observed APK paths,
  actual checks, and unfinished acceptance steps without storing credentials.

## Change navigation

| Change | Read together |
|---|---|
| API fields/statuses | Route validation, model, both schemas, client APIs/normalizers, consuming UI |
| Incident access | src/auth/incident-access.js, incident/dashboard routes, realtime emitters |
| Auth/session | Server auth modules, client APIs, AuthContext/mobile login and lifecycle |
| Realtime | Server emitters/role rooms, client transports, feed subscriptions, screen cleanup |
| Policies | Catalog, PDF assets, index scripts, rag.js, PolicyBrowser/AskPolicyAI |
| Deployment | Blueprint/Compose, Dockerfiles, app/EAS config, env templates, deployment guides |
| Local demos | demo-tools/, LOCAL-TUNNEL-DEMO.md, start-sqlite.js, mobile URL resolution, EAS profile overrides |

Read each application's AGENTS.md before editing its files. Some descriptive notes
there are stale (dashboard Vite configuration and fixed test counts, for example).
Verify behavior in source while preserving applicable instructions.
