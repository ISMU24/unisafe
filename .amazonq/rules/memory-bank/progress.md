# UniSafe - Work Completed and Current Handoff

Reviewed on 2026-10-13 (Pacific/Port_Moresby).
This handoff distinguishes current local source/checks from live deployment,
hosted database, and device evidence. Never infer remote status from config alone.

## Current review (2026-10-13)

- Re-scanned the tracked application source, deployment files, package manifests,
  test scripts, existing agent instructions, and all five `.amazonq` memory-bank
  files. Updated all five memory files; no application source was changed.
- Current source is at HEAD `7b18d4b` on `master`. The worktree was clean before
  this documentation update.
- Latest local checks: server suite 97/97 across 9 files; mobile API checks 8/8;
  dashboard production build passed. These checks do not prove browser E2E,
  hosted PostgreSQL, deployed service, or physical-device behavior.
- Read-only probes on 2026-10-13 to the previously assumed public API/dashboard
  Render addresses returned HTTP 404. Actual Render-assigned URLs and a live
  UniSafe deployment were not confirmed.
- Environment files were assessed without copying secret values into notes.
  Existing local development/tunnel settings are not proof of production host
  configuration. No deployment, external database write, hosted seed, or reset
  was performed; automated tests use an isolated in-memory SQLite database.
- Updated stale notes: mobile incident images now upload to the API; dashboard
  AI Tools is policy Q&A; recycle-bin support is present; mobile CORS allowlist
  includes its warning header; Android permissions no longer have the duplicate/
  audio entries noted in the earlier review.

## Scan scope and evidence

- The current tracked source inventory contains 122 JS/JSX/MJS/PowerShell/SQL
  files (86 JS, 23 JSX, 8 MJS, 4 PS1, 1 SQL), excluding generated and dependency
  trees by using Git's tracked-file list. Package manifests, lockfiles, tests,
  Markdown docs, and deployment configuration were additionally reviewed.
- Read the five current memory files and both app AGENTS.md files; inspected
  current API routes/models/schema, mobile API/report flows, dashboard API/pages,
  auth/realtime, demo/deployment config, and latest commit summaries.
- Recent commits since the earlier source review were inspected. Detailed
  historical milestone notes follow; current uncommitted state is documented above.
- Policy PDFs/images and the generated embedding index were not substantively
  audited. Environment presence/configuration was checked without recording real
  values. No database contents were read or stored in this document.
- This was a documentation/source-readiness refresh, not a security audit,
  dependency vulnerability audit, production deployment, or device acceptance.

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

## Recent committed milestones

| Date | Commit | Work recorded in Git |
|---|---|---|
| 2026-10-12 | aa8d494 | Admin recycle-bin API/model and dashboard UI, soft-delete schema updates, page/API access wiring, regression tests, plus dashboard/API refinements |
| 2026-10-12 | f9fb659 | Dashboard login page and campus image update |
| 2026-10-12 | 8622102 | Merge of unused-file cleanup |
| 2026-10-13 | 96ffdbd | Structured incident taxonomy, mobile report-flow revisions, bounded incident image upload/retrieval, corresponding schema/model/API/tests, and category-specific incident realtime routing |
| 2026-10-13 | 7b18d4b | Dashboard route/session loading guard, Android permission cleanup, package/test updates and deployment-secret regression coverage |

## Implemented platform behavior

- Mobile has incident reporting/history/detail, SOS/status, targeted alerts,
  assistance, appeals UI, emergency contacts, policy browsing/search/Q&A, session
  login/logout, and themes. Incident reporting supports up to three JPEG/PNG
  attachments (2 MB each) through the API. Confirmed incident/SOS/assistance
  delivery requires a server ID. Failed appeals remain unconfirmed and do not
  create a local success record.
- The API implements JWT access/rotating refresh sessions, six roles, domain CRUD,
  incident category/ownership checks, anonymous REST presentation, audit logs,
  status histories for incidents/SOS, and authenticated Socket.IO events.
- The database adapter supports PostgreSQL and SQLite through async queries,
  transactions, JSON/array conversion, and schema initialization. SQLite tests
  exercise adapter behavior but do not prove PostgreSQL execution in production.
- Dashboard operational feeds use the API. Home combines separate incident and
  SOS feeds; Emergency reads SOS; the notification bell reads /api/alerts/my.
  Analytics, reports/export, user management, admin audit inspection, and an
  ADMIN/ICT_ADMIN recycle bin with restore/permanent-delete flows exist.
- Dashboard AI Tools calls policy Q&A; mock incident/staffing/hotspot analysis
  was removed. The shared mockData module still contains display constants.
- Policy AI uses server-side Voyage/Anthropic configuration and the policy index.
  Missing configuration returns POLICY_UNAVAILABLE (503), with browse guidance.
- Seed fixtures use eight fictional accounts and DEMO ONLY operational records.
  Reruns preserve existing passwords unless explicit SEED_*_PASSWORD values are
  supplied. No seed/reset command was run against a real database for this refresh.

See product.md for capabilities and limits, structure.md for navigation, tech.md
for exact commands/configuration, and guidelines.md for implementation conventions.

## Work present outside HEAD at the 2026-10-12 scan

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

These files existed locally at that earlier scan. Subsequent commits brought later
source changes into HEAD; repository presence still does not prove deployment,
cloud build, or APK installation.

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

## Remaining work and source discrepancies as of 2026-10-13

1. Obtain the actual Render-assigned API/dashboard URLs and verify deployed
   environment values and both health endpoints. Previously assumed public URLs
   returned 404; no live deployment is confirmed. Resolve this before seeding or
   login checks.
2. Select a durable production PostgreSQL plan and confirm the real API/dashboard
   origins are correctly set in Render and the intended EAS profile. The
   production-apk profile still uses a temporary tunnel origin; a tunnel or local
   `.env` change does not update an installed APK.
3. Fix/limit the legacy Socket.IO `join-room` handler: an authenticated client
   can still request arbitrary `role:*` room names. Category-specific incident
   emits and anonymous presentation exist, but that room-join gap prevents treating
   role rooms as a complete authorization boundary.
4. Complete the physical-device incident/SOS/status/alert and image-upload checks
   in TESTING.md. Separate immediate Socket.IO delivery from polling/refetch; do
   not simulate an uncoordinated emergency.
5. Validate dashboard browser login/password change, deep-link refresh, CORS
   preflight, and realtime behavior against the actual deployed origins.
6. Dashboard Settings controls remain non-persistent; mobile profile edits remain
   local; dashboard identity edits are administrator-managed. Policy scripts use
   `Assets` while runtime paths use `assets`, so verify casing before Linux
   regeneration. General API/upload/AI rate limiters remain exported but unmounted.
7. Older sections of application guidance/deployment docs may still describe
   stale paths, test counts, fallbacks, or profile values. Consult source and the
   current memory notes; this refresh intentionally changed only `.amazonq`.

## Checks run on 2026-10-13

| Check | Result and limit |
|---|---|
| API `npm test` | 97/97 passed across 9 files; test setup uses isolated SQLite, not hosted PostgreSQL |
| Mobile `node --test scripts/check-api.mjs` | 8/8 passed; local mocked/offline checks, not a phone or deployed browser |
| Dashboard `npm run build` | Passed; no build warning in this run; does not validate live API/origin or browser behavior |
| Public host probes | The previously assumed API and dashboard addresses returned HTTP 404; actual Render URLs remain unknown |
| Local service probes | API/dashboard were not running; no local live integration check |
| Documentation edits | All five memory-bank files updated; Markdown fences/local links and `git diff --check` passed |

## Maintenance rule

Update this dated record after actual work/checks. Preserve historical evidence,
separate implemented code from verified deployments, and never record credentials,
temporary tunnel hostnames, or unperformed checks as completed work.
