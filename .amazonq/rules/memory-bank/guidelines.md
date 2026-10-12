 # UniSafe - Development Guidelines

Reviewed against local source on 2026-10-12 (Pacific/Port_Moresby).
Use alongside the other memory-bank documents and applicable AGENTS.md instructions.
Distinguish intended rules from existing implementation gaps.
Use progress.md for the dated completion record and outstanding checks.

## General conventions

- Follow the file's module system: server/dashboard ESM, Expo-transformed mobile
  source, CommonJS mobile tooling/configuration. Do not add type: module to the
  mobile package without migrating its tooling.
- Use camelCase JavaScript, PascalCase components, snake_case database columns,
  and uppercase API roles. Preserve filename casing on Linux.
- Operational records use server-generated UUIDs; roles use numeric IDs.
  Never fabricate confirmation IDs.
- Operational data comes from the API. Never replace failed requests with mock
  records or claim a failed submission succeeded. Keep forms available and make
  unconfirmed delivery explicit.

## Database and models

- Keep domain SQL in models, auth SQL in src/auth/database.js. Routes validate,
  authorize, call data functions, audit, and emit events.
- All db.prepare(...).get/all/run calls are asynchronous, even with SQLite.
  Await them. Use parseJson and arrayParameter for cross-engine JSON/array values.
- Parameterize values. Allowlist update fields and interpolated sort identifiers.
- Maintain schema.sql and sqlite-schema.js together. PostgreSQL schema application
  uses savepoints for expected existing objects; naive semicolon splitting breaks
  SQL function bodies.
- Use db.transaction(async () => ...) for operations requiring atomic multi-write
  behavior; this is not better-sqlite3's synchronous transaction API.
- Incidents use deleted_at; applicable queries exclude deleted records. Not every
  table has this field: alerts and role associations have hard-delete paths.
- Incident/SOS history records the real previous status. Preserve allowed
  transitions and timestamps. Assistance/appeals do not have equivalent dedicated
  status-history tables in the current schemas.
- Models explicitly write updated_at; schemas also have update triggers.
  Do not assume timestamps are exclusively maintained by triggers.
- Conditional stats use SUM(CASE ...) and numeric zero normalization in the model.
  Bare SUM can return NULL for no rows; it does not guarantee zero.

## Authorization, audit, and security

- Enforce ownership/category/role checks in the API, not just navigation.
  Use src/auth/incident-access.js and anonymous presentation rules consistently.
- Never expose password hashes/tokens in user responses, logs, or audit details.
- Audit old_values/new_values are objects or null in API responses, normalized
  with parseJson across engines. Render JSON objects safely in the audit page.
- /api/audit-logs requires ADMIN or ICT_ADMIN. Preserve query filter validation
  and pagination limits. LOGIN records email/roles, not credentials.
- Helmet is global. Auth routes mount login/refresh limiters; exported general
  API/upload/AI limiters are not currently mounted.
- Policy search and PDF routes are public. Do not assume all /api routes require auth.
- Production JWT secrets must differ and contain at least 32 characters. Never
  commit real env files, generated passwords, or database contents.

## HTTP, session, and delivery

- Mobile JSON requests use UniSafe/src/utils/api.js; dashboard requests use
  src/api.js. Keep request/refresh logic out of screen components.
- Mobile requests allow 75 seconds for cold starts; dashboard requests allow 15.
- Preserve single-flight refresh and session-version checks. A 401 can cause one
  authenticated retry; transport failures must not automatically replay writes.
- Incident/SOS/assistance success requires a returned ID. Preserve the form and
  unconfirmed-delivery guidance after failure. Do not invent a response time.
- Preserve POLICY_UNAVAILABLE feedback; missing AI configuration is not a cold
  start problem. Policy browsing remains available without AI credentials.
- API origins are public build-time settings; release mobile calls require HTTPS.
  Rebuild clients after changing their bundled origin.
- Mobile URL priority is EXPO_PUBLIC_API_URL, then app.json extra.apiUrl. There is
  no automatic localhost/emulator fallback, even in development. Explicit HTTP
  configuration is development-only; missing configuration fails before fetch.
- Preserve ngrok-skip-browser-warning: true on mobile JSON requests, refresh,
  retries, and Socket.IO extraHeaders. Native checks do not establish Expo web
  compatibility: the API's CORS_HEADERS currently omits that custom header.

## Realtime contracts

Use subscribeRealtime(event, handler) and call its returned unsubscribe on cleanup.
Do not use connectRealtime().on(...) directly.

- Mobile connectRealtime() always returns a Promise resolving to a client or null.
  Resolution does not guarantee handshake completion. Its central listener set
  dispatches events; do not attach duplicate event handlers.
- Dashboard connectRealtime() returns a socket when present, a Promise while
  connecting, or null without a token. subscribeRealtime handles all cases.
  Do not blindly call .then() on the direct return value either.
- getSocket() is the synchronous accessor when needed.
- Mobile lifecycle marks background/inactive transitions and checks the token on
  resume. It does not explicitly disconnect on background entry; do not claim
  guaranteed background delivery or guaranteed background closure.
- Events: incident-update, sos-update, alert-update, assistance-update, appeal-update.
  Emit after the related database operation succeeds/commits.
- Rooms include user:<uuid>, role:<ROLE>, and responders. Domain emitters notify
  responders plus the owner; targeted alerts use emitAlertToUsers.
- Shared responder incident payloads currently lack REST category filtering and
  anonymous redaction. Review socket permissions independently from REST.
- The legacy join-room handler blocks user:* and unauthorized responders joins,
  but does not validate arbitrary role:* room names against the user's roles.
  Do not extend sensitive room-based delivery without reviewing this behavior.
- API target_roles contains role names; internal target_role_ids are numeric.

## Refresh and feed behavior

| View | Current behavior |
|---|---|
| Dashboard home | Both incident and SOS subscriptions; separate active SOS count |
| Dashboard Incidents | Incident subscription |
| Dashboard Emergency | SOS subscription |
| Notification bell | /api/alerts/my and alert-update, not admin-only /api/alerts |
| Dashboard subscription helpers | REST reload on events, serial polling normally 5 seconds (alerts/users 10); at least 30 seconds after connected status notification |
| Mobile SOS status | Matching socket updates and a poll 5 seconds after each completed request |
| Mobile My Reports | Focus/manual/refreshKey reload; expand to load history; no continuous socket subscription |
| Mobile report detail / safety alerts | Socket subscriptions; inspect each screen's loading/cleanup behavior |

Keep fetch errors visible and distinguish stale data from successful empty results.
Do not claim every screen polls or that polling works offline. Verify immediate
push separately from eventual refetch recovery.

## UI and unfinished features

- Reuse mobile useTheme(), src/theme.js, and shared category/status components.
  Brand colors: #A80808, #F8E808, #680808; policies use #455A64. Follow existing
  StyleSheet conventions; some existing files still contain hardcoded styles.
- Dashboard uses CSS variables, UniForceUI helpers, and utils/roles.js.
  Align route/sidebar visibility with uppercase API roles.
- services/mockData.js includes campus map/palette metadata and sample operational
  data used by AI Tools. Never use sample records in live feeds.
- AI Tools is a prototype, Settings does not persist, photos are preview-only,
  and mobile profile edits are local. See product.md for gaps.
- Dashboard changePassword uses the authenticated request helper, including its
  token refresh/retry behavior, and adopts the returned session. Do not describe
  the full browser flow as verified until an authenticated end-to-end check passes.
- Policy scripts use Assets while checked-in/runtime paths use assets.
  Verify casing before Linux regeneration; indexing calls Voyage.

## Verification

- Root npm test runs the server suite. Vitest disables env-file loading; setup
  clears PostgreSQL configuration and selects in-memory SQLite. A pass does not
  establish that a hosted PostgreSQL deployment works.
- Run node --test scripts/check-api.mjs from UniSafe for offline mobile API checks.
- A dashboard build checks bundling; browser scripts catch runtime/live-update
  failures that builds miss. See tech.md for prerequisites.
- Use test accounts and deliberate test records for live/E2E verification.
  Do not run reset, hosted seed, or policy indexing as incidental doc validation.
- Use TESTING.md for physical-device acceptance. Never mark unrun checks passed
  or replace credential placeholders with real credentials.
- Record counts only with a dated actual test run. Derive commands from manifests,
  not old fixed counts in documentation.

## Local demos and documentation maintenance

- Keep the LAN/Expo, HTTPS tunnel/SQLite, and hosted PostgreSQL workflows distinct.
  start-demo.ps1 uses normal npm run server; it does not force SQLite. An existing
  listener on port 3001 only prevents another API launch, not proves readiness.
- start:sqlite loads dotenv, blanks DATABASE_URL and DB_HOST for that process,
  then dynamically imports the server. Keep SQLITE_PATH, JWT, CORS, and PORT.
  Startup may initialize schema/bootstrap an explicitly configured first admin;
  this is not a read-only command. Do not reset or reseed a demo incidentally.
- set-phone-url.ps1 changes only EXPO_PUBLIC_API_URL in UniSafe/.env for LAN
  development. It does not configure an HTTPS release or override EAS profiles.
- start-tunnel.ps1 checks both health endpoints for SQLite before starting the
  foreground connector. It does not start the API or build/configure an APK.
- Do not copy temporary tunnel hostnames or real .env values into these notes.
  Document profile differences by purpose/provider and verify the actual origin
  before a build. The current production-apk profile already contains an ngrok URL.
- Preserve existing staged/user changes when refreshing the memory bank. Record
  source observations, commit history, test results, and unverified live behavior
  separately. APK presence alone does not prove its bundled URL or installation.
