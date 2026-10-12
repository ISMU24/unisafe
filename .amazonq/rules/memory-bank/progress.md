# UniSafe - Work Completed and Current Handoff

Reviewed on 2026-10-12 (Pacific/Port_Moresby).
The October 5 record below is based on the local source, Git history, working-tree
changes, and checks available at that time. Remote deployment/build records were
not available; do not infer their outcomes from local configuration.

## Continuation update (2026-10-12)

- Re-scanned all five Markdown files in `.amazonq/rules/memory-bank/` against the
  current source and working tree. Updated the review dates and corrected stale
  descriptions of database selection, appeal submission failures, and dashboard
  password changes. No credentials or temporary tunnel URLs were added.
- Appeal submission errors now leave the form available and show that delivery
  was not confirmed; no local fake appeal or success ID is added.
- Dashboard password changes now go through the authenticated request helper,
  which attaches the bearer token and supports the existing refresh/retry flow.
  The full authenticated browser flow has not been exercised.
- On 2026-10-12, the dashboard production build passed (with the existing
  >500 kB chunk warning) and mobile API smoke checks passed 8/8. The server suite
  result below remains the historical 2026-10-05 run; it was not rerun here.
- These edits remain in the existing worktree; no commit, deployment, browser
  session, or physical-device test was performed.

## Scan scope and evidence

- Inventoried the repository and reviewed the four existing memory-bank files,
  both application AGENTS.md files, package manifests, deployment configuration,
  demo helpers, routes, client transports, relevant UI, test setup, and Git diffs.
- The source inventory contains 116 JS/JSX/MJS/PowerShell/SQL files, excluding
  dependencies, generated native/build output, .git, env files, and lockfiles.
  Source searches covered application capabilities, routes, mock/fallback paths,
  subscriptions, and known gaps; key implementations were read directly.
- Reviewed all nine local commits through HEAD 1968b67 and the staged, unstaged,
  and untracked changes present at scan time. Commit dates below use +10:00.
- Policy PDFs/images and the generated embedding index were inventoried, not
  substantively audited. Real .env files, credentials, and database contents were
  not copied into these notes. Generated APKs were checked for presence/size only.
- This was a documentation refresh with existing local checks, not a dependency
  vulnerability audit or proof of production readiness.

## Committed milestones

| Date | Commit | Work recorded in Git |
|---|---|---|
| 2026-10-02 | 19267d2 | Initial mobile app, Express API, PostgreSQL/SQLite adapter and schemas, dashboard, policy assets/RAG, JWT sessions, role/ownership access, realtime feeds, deployment files, and regression/browser scripts |
| 2026-10-02 | a1c8d75 | Repository-root Render blueprint added |
| 2026-10-02 | 67e84a0 | Render dashboard static service and API/dashboard environment wiring added; later hardening changed URL wiring to manual settings |
| 2026-10-02 | 99b133e | Mobile EAS production URL and environment-template updates |
| 2026-10-03 | e56a015 | Hardcoded default-credential cleanup in tracked application/docs/test setup |
| 2026-10-03 | 1922156 | Database initialization added to Render build command at that point in history; current blueprint was subsequently changed to npm install with runtime initialization and optional commented predeploy command |
| 2026-10-03 | 2c7e070 | Express trust proxy, dashboard AuditLogs page, route and sidebar navigation |
| 2026-10-03 | 2cb3d4b | Production secret validation, database-aware health, audit JSON/filter handling, cold-start/delivery messaging, mobile API checks, isolated test configuration, root deployment guide and device checklist; obsolete server-level Render blueprint removed |
| 2026-10-03 | 1968b67 | Fictional labelled demo fixtures, seed regression coverage, unavailable-policy-AI response/UI, and handoff documentation |

The initial commit contains substantial pre-existing implementation. Git does not
provide separate earlier milestones for each of those features.

## Implemented platform behavior

- Mobile has incident reporting/history/detail, SOS/status, targeted alerts,
  assistance, appeals UI, emergency contacts, policy browsing/search/Q&A, session
  login/logout, and themes. Confirmed incident/SOS/assistance delivery requires a
  server ID; photos remain preview-only. Failed appeals remain unconfirmed and
  do not create a local success record (corrected in the 2026-10-12 update above).
- The API implements JWT access/rotating refresh sessions, six roles, domain CRUD,
  incident category/ownership checks, anonymous REST presentation, audit logs,
  status histories for incidents/SOS, and authenticated Socket.IO events.
- The database adapter supports PostgreSQL and SQLite through async queries,
  transactions, JSON/array conversion, and schema initialization. SQLite tests
  exercise adapter behavior but do not prove PostgreSQL execution in production.
- Dashboard operational feeds use the API. Home combines separate incident and
  SOS feeds; Emergency reads SOS; the notification bell reads /api/alerts/my.
  Analytics, reports/export, user management, and admin audit inspection exist.
- Policy AI uses server-side Voyage/Anthropic configuration and the policy index.
  Missing configuration returns POLICY_UNAVAILABLE (503), with browse guidance.
- Seed fixtures use eight fictional accounts and DEMO ONLY operational records.
  Reruns preserve existing passwords unless explicit SEED_*_PASSWORD values are
  supplied. No seed/reset command was run against a real database for this refresh.

See product.md for capabilities and limits, structure.md for navigation, tech.md
for exact commands/configuration, and guidelines.md for implementation conventions.

## Work present outside HEAD at scan time

- The four original Amazon Q memory files, root .gitignore changes, and three LAN
  helper scripts were already staged. They were preserved; this refresh does not
  stage, commit, or reset the user's work.
- demo-tools/set-phone-url.ps1 chooses a physical LAN adapter and updates only
  UniSafe/.env EXPO_PUBLIC_API_URL while preserving other content.
- demo-tools/start-demo.ps1 launches ordinary API, dashboard, and Expo terminals.
  It skips API launch if any process listens on port 3001; it does not verify that
  process or force SQLite. check-demo.ps1 supplies read-only LAN diagnostics.
- UniSafe/server/scripts/start-sqlite.js and its package script load dotenv,
  override the PostgreSQL selectors for that process, and then load the API.
  The realtime regression subprocess now exercises this launcher with conflicting
  PostgreSQL settings and an isolated in-memory database.
- LOCAL-TUNNEL-DEMO.md and demo-tools/start-tunnel.ps1 add the health-gated
  foreground Cloudflare demo workflow. UniSafe/DEPLOYMENT.md and the server env
  template explain SQLite selection. The script exposes the API origin only.
- Mobile api.js removes silent localhost/emulator defaults and adds the ngrok
  header to REST calls. realtime.js adds the same header to Socket.IO. Existing
  check-api.mjs coverage expanded from six to eight checks.
- app.json contains EAS project linkage and changed Android permission entries.
  eas.json production-apk now points to ngrok; preview/production still point to
  Render. The Cloudflare launcher does not reconcile these profile settings.

These files exist locally; their presence is not evidence they have been pushed,
deployed, or built into the APK on a phone.

## Local APK artifacts observed

| Path relative to repository root | Size in bytes |
|---|---:|
| UniSafe/UniSafe-v1.0.0.apk | 51,661,231 |
| UniSafe/android/app/build/outputs/apk/release/app-release.apk | 51,661,231 |
| UniSafe/android/app/build/outputs/apk/debug/app-debug.apk | 213,996,611 |

The matching sizes do not establish identical contents. No APK hash/signature,
embedded API URL, installation, cloud-build status, or device round trip was
verified, and no APK was rebuilt during this documentation update.

## Checks actually run on 2026-10-05

| Check | Result and limit |
|---|---|
| Server npm test | 73/73 passed across 7 files; isolated SQLite, including the launcher/realtime subprocess |
| Mobile node --test scripts/check-api.mjs | 8/8 passed; mocked/offline transport and UI checks |
| Dashboard npm run build | Passed; chunk-size warning remains; build does not validate browser behavior or its deployment origin |
| Demo helper PowerShell parsing | All four scripts parsed successfully; services/tunnels were not launched |
| Memory-bank validation | All five files passed UTF-8, review-date, Markdown fence, whitespace, and local-link checks; git diff --check passed |

The previous memory bank recorded 73 server tests and six mobile checks on
2026-10-04. The new results above supersede those counts for the current tree.
No public tunnel, deployment, hosted database, browser/live script, seed/reset,
policy indexing, or physical-device acceptance was run for this refresh.

## Remaining work and source discrepancies as of 2026-10-12

1. Select and verify the intended demo API origin before any APK build. Reconcile
   Render/ngrok profile settings with the Cloudflare workflow when that workflow
   is chosen; do not assume a running tunnel updates an installed APK.
2. Perform the physical-device incident/SOS/status/alert checks in TESTING.md.
   Its hosted workflow expects PostgreSQL; a local SQLite demo should report
   sqlite instead. Record failures and immediate socket updates separately from
   eventual polling/refetch recovery.
3. Review incident socket privacy/category scoping against REST and restrict the
   legacy join-room handler's arbitrary role:* joins before relying on role rooms
   for sensitive delivery. These are source findings, not new live attack tests.
4. Resolve mobile custom-header compatibility for cross-origin Expo web: server
   CORS_HEADERS omits ngrok-skip-browser-warning. Native mocked checks cannot
   establish browser preflight success.
5. AI Tools sample analysis, non-persisting Settings, local mobile profile edits,
   and preview-only photos remain unfinished integration work.
6. Review duplicate Android location permissions and RECORD_AUDIO, policy scripts'
   Assets/assets casing, and the unmounted general API/upload/AI rate limiters.
7. Older AGENTS/deployment descriptions still contain stale module paths, test
   counts, mobile fallback addresses, realtime guarantees, and EAS profile values.
   Use the current source-backed memory notes for facts while following applicable
   repository instructions. Documentation outside .amazonq was not changed here.

## Maintenance rule

Update this dated record after actual work/checks. Preserve historical evidence,
separate implemented code from verified deployments, and never record credentials,
temporary tunnel hostnames, or unperformed checks as completed work.
