# Netlify login 404 repair

## Confirmed cause (13 October 2026, Pacific/Port_Moresby)

The deployed dashboard at `https://joyful-trifle-faf7e0.netlify.app` served
`/assets/index-Dy-TJdnB.js` with an empty API base (the bundled variable `Ii`).
An empty-body POST to its `/api/auth/login` returned HTTP 404 and HTML.
GET `/api/health` returned HTTP 200 and the dashboard HTML via the SPA fallback.
These are direct public observations, not assumptions about a Render hostname.

The original `uniforce-dashboard/src/api.js:4` defaulted production to an empty
origin. Its login function appends `/api/auth/login`, sending credentials to the
static Netlify site when build configuration is absent. Express correctly mounts
`/api/auth` in `UniSafe/server/index.js:173`, and defines POST `/login` in
`UniSafe/server/src/auth/routes.js:110`. No backend route rename is needed.

Vite's development proxy and the Docker nginx proxy do not run on Netlify.
The previous Netlify configuration had only a SPA fallback, with no API upstream.
The generic error `Request failed (404)` hid the misrouting.

## Changes

| File | Change |
|---|---|
| `uniforce-dashboard/src/api-config.js` | Shared origin validation; require HTTPS in production, reject localhost and paths, retain empty development proxy and explicit `/` nginx mode. |
| `uniforce-dashboard/src/api.js` | Guard requests against missing configuration; explain HTTP 404, HTML fallback, 401/403, network/CORS failures; retain 15-second timeout and existing JWT refresh logic. |
| `uniforce-dashboard/src/realtime.js` | Prevent Socket.IO from falling back to the dashboard origin when API configuration is invalid. |
| `uniforce-dashboard/src/context/AuthContext.jsx` | Preserve stored sessions during transient restore failures; observe session invalidation; clear displayed user even if logout revocation fails. |
| `uniforce-dashboard/vite.config.js` | Validate production builds before bundling; reject same-origin mode on Netlify; retain development proxy. |
| `uniforce-dashboard/netlify.toml` | Set repository-relative base directory; return explicit API/Socket.IO 404s before the React Router fallback. |
| `uniforce-dashboard/public/api-unavailable.json` | Static routing diagnostic; contains no authentication implementation. |
| `uniforce-dashboard/Dockerfile` | Default `VITE_API_URL=/` explicitly selects its existing nginx proxy. |
| `docker-compose.yml` | Update the comment describing that Dockerfile default. |
| `uniforce-dashboard/.env.example` | Document development proxy, required production origin and nginx-only mode. |
| `uniforce-dashboard/AGENTS.md` | Correct stale API-resolution and missing-Vite-proxy instructions. |
| `uniforce-dashboard/package.json` | Add dependency-free Node regression-test command. |
| `uniforce-dashboard/tests/api.test.mjs` | Exercise configuration, request URLs, errors, refresh rotation, session preservation and routing rule order. |
| `UniSafe/server/tests/realtime.test.js` | Add real HTTP CORS preflight checks for auth routes against an isolated test server. |
| `UniSafe/DEPLOYMENT.md` | Update deployment configuration guidance and remove an assumed API hostname from dashboard instructions. |
| `NETLIFY-LOGIN-FIX.md` | Diagnosis, verification, configuration and deployment handoff. |

The server authentication implementation, role checks, JWT secrets, PostgreSQL
configuration and mobile app features are unchanged. No accounts or existing
database records were reset, seeded or deleted. Pre-existing `.amazonq` edits
belong to the workspace and are not part of this repair.

## Netlify settings

For the existing site, set these values before triggering a new production build:

| Setting | Value |
|---|---|
| Repository base directory | `uniforce-dashboard` |
| Build command | `npm run build` |
| Publish directory (relative to base) | `dist` |
| Configuration file | `uniforce-dashboard/netlify.toml` |
| Node version | `22` (already declared in configuration) |
| Build environment variable | `VITE_API_URL=https://<verified-backend-host>` |

Use only the HTTPS origin, with no `/api`, credentials, query, or fragment.
Do not use `/` or the Netlify dashboard URL. Apply the variable to production
builds and separately configure any preview contexts you intend to support.
Save and trigger a new production deploy: Vite embeds the value in JavaScript
at build time. Changing an environment variable cannot repair an existing bundle.

Netlify rules deliberately contain no invented proxy destination. `/api/*` and
`/socket.io/*` return a diagnostic 404; page routes rewrite to `/index.html`.
The routing regression is a configuration check, not an executed Netlify edge
test. Verify the deployed rules after publishing.

References: [Vite environment handling](https://vite.dev/guide/env-and-mode),
[Netlify configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/),
[Netlify redirects](https://docs.netlify.com/manage/routing/redirects/redirect-options/).

## Backend and hosting

The existing ngrok HTTPS origin read from local configuration was reachable
during this audit. Both `/health` and `/api/health` returned HTTP 200,
`status: ok`, `db.engine: postgresql`, `db.connected: true`.
The same checks passed against `http://localhost:3001`.
The temporary address is given in the task handoff, not committed into source.

For temporary testing, set Netlify's `VITE_API_URL` to that verified ngrok origin
and rebuild. Keep the laptop, PostgreSQL, Express and ngrok running. Recheck both
health endpoints before use; a changed tunnel address requires another rebuild.
The browser sends API requests directly to this origin. Localhost alone is not a
public backend for other dashboard users.

For production, deploy the existing `UniSafe/server` to a persistent HTTPS host,
using the deployment guide and `render.yaml` as configuration references.
Copy its actual assigned origin and verify it; a blueprint service name is not
proof of deployment. No persistent Render endpoint has been verified in this task.
Retain the existing PostgreSQL database and its records. Do not apply a new
database blueprint over an existing deployment without reviewing the mapping.

Required production settings remain `NODE_ENV=production`, the existing
PostgreSQL connection settings, distinct strong `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET`, and the exact dashboard origin in the comma-separated list:

```text
CLIENT_ORIGINS=https://joyful-trifle-faf7e0.netlify.app
```

Retain other intentionally supported origins in that list; do not use `*`.
Restart/redeploy the API after changing CORS settings. The local configuration
already includes the Netlify origin, and the public tunnel verified it:

- OPTIONS `/api/auth/login`: 204, exact dashboard `Access-Control-Allow-Origin`.
- Allowed methods: GET, POST, PATCH, PUT, DELETE, OPTIONS.
- Allowed headers: Content-Type, Authorization, Accept, ngrok-skip-browser-warning.
- Unlisted origin preflight: 403, no allow-origin header.
- GET `/api/auth/me` without credentials: 401 JSON with correct CORS headers.

Browsers intentionally hide a CORS-blocked response from JavaScript. The client
therefore reports network/CORS as possible causes together; use browser Network
and Console panels to distinguish them. A readable API 401/403 keeps its server
message and status. A routing 404 or successful HTML fallback has its own error.

## Windows PowerShell: verify, commit, push, redeploy

Use a currently verified origin, not an assumed or expired hostname:

```powershell
Set-Location 'C:\Users\israe\Desktop\Project'
$ApiOrigin = (Read-Host 'Verified backend HTTPS origin, no /api').Trim().TrimEnd('/')
if ($ApiOrigin -notmatch '^https://[^/]+$') { throw 'Expected an HTTPS origin only' }
foreach ($Endpoint in @('/health', '/api/health')) {
    $Health = Invoke-RestMethod -Uri "$ApiOrigin$Endpoint" -TimeoutSec 30 `
        -Headers @{ 'ngrok-skip-browser-warning' = 'true' }
    if ($Health.status -ne 'ok' -or $Health.db.engine -ne 'postgresql' -or $Health.db.connected -ne $true) {
        throw "Backend is not ready at $Endpoint"
    }
    Write-Output "PASS $Endpoint : PostgreSQL connected"
}

Set-Location '.\uniforce-dashboard'
$env:VITE_API_URL = $ApiOrigin
npm test
npm run build
Set-Location '..\UniSafe\server'
npm test
Set-Location '..\..'

# Stage only this repair; review staged changes before committing.
$RepairFiles = @(
    'NETLIFY-LOGIN-FIX.md', 'UniSafe/DEPLOYMENT.md',
    'UniSafe/server/tests/realtime.test.js', 'docker-compose.yml',
    'uniforce-dashboard/.env.example', 'uniforce-dashboard/AGENTS.md',
    'uniforce-dashboard/Dockerfile', 'uniforce-dashboard/netlify.toml',
    'uniforce-dashboard/package.json', 'uniforce-dashboard/vite.config.js',
    'uniforce-dashboard/public/api-unavailable.json',
    'uniforce-dashboard/src/api-config.js', 'uniforce-dashboard/src/api.js',
    'uniforce-dashboard/src/realtime.js',
    'uniforce-dashboard/src/context/AuthContext.jsx',
    'uniforce-dashboard/tests/api.test.mjs'
)
git add -- $RepairFiles
git diff --cached --check
git diff --cached --stat
git commit -m 'Fix Netlify dashboard API configuration and login diagnostics'
git push origin master
```

Before pushing, save the Netlify settings above. If continuous deployment is
enabled, the push triggers a build. Otherwise open the site's Deploys page and
choose Trigger deploy / Deploy site. A manual drag-and-drop deployment must use
the newly built `uniforce-dashboard/dist`, and must also apply the routing rules;
prefer the repository deployment so `netlify.toml` is used.

The branch observed during this audit is `master`. These commands are a handoff;
this task did not commit, push, modify hosted settings or redeploy the site.

After deployment, hard-refresh the dashboard and inspect Network. POST login,
GET `/api/auth/me`, POST refresh/logout and Socket.IO must target the verified
backend, never `joyful-trifle-faf7e0.netlify.app/api/...`. Test a staff login,
protected data, page refresh, access-token renewal and logout with an authorized
existing account. Do not paste tokens or passwords into logs or this document.

## Validation and limits

- Dashboard regressions: 11 passed (real API-client code; mocked transport).
- Existing server suite: 97 passed in 9 files; explicit isolated SQLite test
  databases and disabled dotenv protect the real PostgreSQL database.
- Updated CORS/realtime test file: 12 passed, including the new preflight test.
- Production build: passed with the verified temporary HTTPS backend origin.
- Invalid builds: missing origin, localhost origin, and Netlify `/` mode each
  failed with the intended configuration diagnostic before bundling.
- Existing Chrome page check: production `/login` and unauthenticated
  `/incidents` refresh rendered with no console errors or failed requests.
- Live health and CORS: passed against the temporary public backend as above.
- Live successful login, authenticated route walk, refresh and realtime exercise:
  NOT RUN; authorized credentials were not supplied. No mock is claimed as a
  successful live authentication.
- New Netlify edge routing: NOT DEPLOYED/NOT RUN. The live site still serves the
  old bundle until its settings and build are updated.
- No Netlify connector was returned by the plugin search; hosted settings were
  not accessible in this session. The owner must perform the settings/redeploy
  step, or provide an authorized deployment connection. More integrations may
  be available in the [plugin directory](https://chatgpt.com/plugins).

Permanent HTTPS hosting and an authenticated production smoke test remain
requirements before claiming production readiness.
