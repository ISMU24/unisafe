# UniSafe deployment from Windows PowerShell

Use this guide for the lecturer handoff. Commands work in Windows PowerShell 5.1
and PowerShell 7. Start in `C:\Users\israe\Desktop\Project`. Replace angle-bracket
placeholders yourself; never save real passwords, database URLs or tokens in this
repository. Deployment, seeding and APK building are separate manual steps.

## 1. Deploy the root Blueprint

After the reviewed source is committed and pushed, use Render
**New > Blueprint**, repository `ISMU24/unisafe`, branch `master`, Blueprint path
`render.yaml`. This creates the API, static dashboard and PostgreSQL database.
The obsolete `UniSafe/server/render.yaml` has been removed; the root file is the
single source of deployment configuration.

Current resource configuration:

| File | Resource | Declared plan |
|---|---|---|
| `render.yaml` | `unisafe-api` | `starter` (paid) |
| `render.yaml` | `unisafe-dashboard` (static) | No compute plan |
| `render.yaml` | `unisafe-db` | `free` |

The API stays on paid Starter to avoid idle sleeping. API and database use Oregon.
Render static sites have no compute plan or region setting; both unsupported fields
were removed. Static hosting is free, but bandwidth and pipeline minutes count
against workspace allowances. See [static-site terms](https://render.com/docs/static-sites)
and the [Blueprint reference](https://render.com/docs/blueprint-spec).

**Decide the database plan before Apply.** Free Render PostgreSQL expires 30 days
after creation and then becomes inaccessible. You have another 14 days to upgrade
before Render deletes it and its data. Record the actual creation/expiry dates;
if marking may extend beyond expiry, choose paid PostgreSQL or migrate to another
provider before that date. The Blueprint keeps `free` until you choose otherwise.
See [Render's current free database terms](https://render.com/docs/free#30-day-limit).

For example, a database created on **3 October 2026** expires around **2 November
2026**, with deletion around **16 November 2026** if not upgraded. It cannot serve
the lecturer during that grace period. Use the exact expiry timestamp shown in
Render, and export any needed data before expiry.

The API build command is `npm install`. Schema initialization runs with the first
runtime database query (including startup checks). It must not depend on database
access during the build. A commented `preDeployCommand: npm run db:init` is available
if you choose to enable it on a paid service. See [Render deploy stages](https://render.com/docs/deploys).

Verify the Render environment settings:

- `DATABASE_URL`: Render's **internal** connection URL, supplied by the Blueprint.
- `DB_SSL=true`, `NODE_ENV=production`.
- Two distinct, random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values, each
  at least 32 characters. Render's `generateValue` produces 256 random bits as a
  44-character Base64 value, which passes validation; no manual secret replacement
  is needed for newly generated values. Existing values are not automatically
  regenerated. Obvious placeholders and identical secrets are rejected.
  See [Render secret generation](https://render.com/docs/blueprint-spec#generating-random-secrets).
- `CLIENT_ORIGINS`: exact dashboard HTTPS origin, without a path or trailing slash.
- Dashboard `VITE_API_URL`: API HTTPS origin, without `/api`; it is a build-time value.
- These two public URLs must be supplied manually: `onrender-url` is not a supported
  `fromService` property. On initial creation, `sync: false` prompts for each value.
  Use the intended HTTPS origins, then verify the actual assigned service URLs.
  If they differ, correct API `CLIENT_ORIGINS` and redeploy the API; correct dashboard
  `VITE_API_URL` and rebuild/redeploy the dashboard. On an existing Blueprint,
  `sync: false` values must be set in each service's Environment tab.
- `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` are optional for policy Q&A; incidents/SOS
  do not require them. Leave them unset unless you supply your own keys.

### First-deploy URL setup, in order

1. Deploy the root Blueprint. If the actual public URLs are not yet known, the
   initial dashboard may render but its API calls will not work until configured.
   Supply intended origins if the creation form requires values; verify them next.
2. Copy the API's **actual** public HTTPS URL from Render. Do not infer it from the
   service name or assume it matches `https://unisafe-api.onrender.com`.
3. On the dashboard service, set `VITE_API_URL` to that API origin, without `/api`.
4. On the API service, set `CLIENT_ORIGINS` to the dashboard's **actual** HTTPS
   origin, with no path or trailing slash.
5. Redeploy the API and rebuild/redeploy the dashboard. Vite embeds its URL during
   the build, so changing the setting alone does not update an existing bundle.
6. Open the API's `/health` and `/api/health`, then the dashboard login page.
   Proceed to seeding and login checks only after the API reports database readiness.

The dashboard already has the SPA rewrite `/*` -> `/index.html` in `render.yaml`.
After deployment, open and refresh `/incidents` as SECURITY and `/audit-logs` as
ADMIN. Both must load the application instead of a static-host 404.

## 2. Wake the API and verify the database

```powershell
Set-Location 'C:\Users\israe\Desktop\Project'
$ApiUrl = 'https://<API-HOST>'
$DashboardUrl = 'https://<DASHBOARD-HOST>'
curl.exe --silent --show-error --fail --max-time 90 "$ApiUrl/health"
curl.exe --silent --show-error --fail --max-time 90 "$ApiUrl/api/health"
```

Both must return HTTP 200 with `status: "ok"`, `db.connected: true` and
`db.engine: "postgresql"`. A 503 means not ready; resolve DB configuration before
continuing. Missing AI keys or a policy index are separate from database readiness.
If you later choose free API hosting, allow roughly 30-60 seconds for a cold start
and retry the health GET. The configured API plan is currently `starter`.

## 3. Seed from your Windows computer

Use the database's **EXTERNAL** URL from Render's Connect menu. The internal hostname
is for Render services, not your laptop. Ensure the database allows your current
public IP. Do not run a database reset.

URL shape only (fake credentials):

```powershell
Set-Location 'C:\Users\israe\Desktop\Project\UniSafe\server'
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@HOST.oregon-postgres.render.com/unisafe?sslmode=require'
```

For the real URL, use a masked prompt so it does not enter shell history:

```powershell
$DbUrlSecret = Read-Host 'Paste Render EXTERNAL database URL with ?sslmode=require' -AsSecureString
$env:DATABASE_URL = [System.Net.NetworkCredential]::new('', $DbUrlSecret).Password
$env:DB_SSL = 'true'
$env:DOTENV_CONFIG_PATH = Join-Path $env:TEMP 'unisafe-no-dotenv-do-not-create'
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Seeding failed.' }
} finally {
    Remove-Item Env:DATABASE_URL, Env:DB_SSL, Env:DOTENV_CONFIG_PATH -ErrorAction SilentlyContinue
    $DbUrlSecret = $null
}
```

The dotenv path intentionally points to a nonexistent file, avoiding local `.env`
overrides. `db:seed` initializes the schema, creates demo accounts and operational
demo records, and prints generated passwords **once**. Run it in a private terminal
without transcription/recording. Store the output in a password manager, never in
a committed file, screenshot or deployment log. Keep the generated 16-character
passwords for this demo handoff; do not replace them with short memorable passwords.
An existing account retains its password unless you explicitly supply its
`SEED_*_PASSWORD`; rerunning cannot recover an earlier generated password.
Explicit passwords must have at least eight characters and a number.

That is a minimum accepted by the API, not a recommendation. Leave all
`SEED_*_PASSWORD` overrides unset for this handoff. Share only the intended demo
accounts privately. Dashboard users can change their own password at **Profile >
Change Password**; the APK Profile screen currently has no password-change form.
There is no need to rotate an unexposed, securely generated demo password merely
to complete the handoff checklist.

Default accounts use fictional emails such as `admin@example.invalid`,
`security@example.invalid`, and `student1@example.invalid`. Enter the **full email**
in the APK login field. Names and IDs start with Demo/DEMO; phone numbers are empty.
Seeded incidents, SOS locations, alerts, assistance requests and appeals are marked
`DEMO ONLY - no response required`. Use `LECTURER TEST <time>` for your own test
incident so it stands out from these fixtures.

These changes affect newly seeded records. They do not sanitize a database seeded
by the older script. Rerunning against an older installation can create the new
fictional accounts alongside old accounts, while existing fixed-ID incidents/SOS
remain unchanged. Review any existing demo records before sharing; do not reset
or delete operational data to refresh a demo.

Optional overrides use `SEED_ADMIN`, `SEED_ICT`, `SEED_SECURITY`, `SEED_MEDICAL`,
`SEED_STAFF`, `SEED_STUDENT1`, `SEED_STUDENT2`, `SEED_STUDENT3`, with `_EMAIL` and
`_PASSWORD` suffixes. `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` is an alternative
bootstrap for an empty database; there is no automatic default admin password.

TLS is enabled for hosted PostgreSQL and URL `sslmode=require`. Without URL SSL
options, the current provider configuration relaxes certificate verification unless
`DB_SSL_REJECT_UNAUTHORIZED=true` is supplied (with `DB_SSL_CA` when needed).
URL SSL options
override the driver's separate `ssl` object; do not assume `DB_SSL_CA` will combine
with URL SSL parameters. See [node-postgres SSL configuration](https://node-postgres.com/features/ssl).

## 4. Test ADMIN, SECURITY and STUDENT logins

Use the generated credentials from your password manager. The following sends JSON
over stdin to `curl.exe`, avoiding Windows native argument-quoting problems and
keeping passwords out of process arguments. It prints roles, not bearer tokens.

```powershell
$PreviousOutputEncoding = $OutputEncoding
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    foreach ($ExpectedRole in @('ADMIN', 'SECURITY', 'STUDENT')) {
        $LoginCredential = Get-Credential -Message "Enter the seeded $ExpectedRole email and password"
        $LoginJson = @{
            email = $LoginCredential.UserName
            password = $LoginCredential.GetNetworkCredential().Password
        } | ConvertTo-Json -Compress
        $LoginText = $LoginJson | curl.exe --silent --show-error --fail --max-time 90 `
            -H 'Content-Type: application/json' --data-binary '@-' "$ApiUrl/api/auth/login"
        if ($LASTEXITCODE -ne 0) { throw "$ExpectedRole login failed." }
        $Login = $LoginText | ConvertFrom-Json
        $MeText = curl.exe --silent --show-error --fail --max-time 30 `
            -H "Authorization: Bearer $($Login.accessToken)" "$ApiUrl/api/auth/me"
        if ($LASTEXITCODE -ne 0) { throw 'Account check failed.' }
        $Me = $MeText | ConvertFrom-Json
        if ($Me.roles -notcontains $ExpectedRole) { throw "Missing role: $ExpectedRole" }
        Write-Host "$ExpectedRole login passed"
        @{ refreshToken = $Login.refreshToken } | ConvertTo-Json -Compress | `
            curl.exe --silent --show-error --fail -H 'Content-Type: application/json' `
                --data-binary '@-' "$ApiUrl/api/auth/logout" | Out-Null
    }
} finally {
    $OutputEncoding = $PreviousOutputEncoding
    $LoginCredential = $LoginJson = $LoginText = $Login = $MeText = $Me = $null
}
```

Ten failed logins per IP/email are allowed per 15 minutes; successful requests
are excluded. The refresh limit is 120 per IP per 15 minutes. Limits are configurable;
these statements describe source defaults, not uninspected live environment values.
Use the saved generated password carefully. After a failed login, check the email
and password instead of repeatedly guessing. If rate-limited, wait for the window
to reset. `Get-Credential` uses a credential dialog or terminal prompt depending on
your PowerShell host; if the script appears paused, check the terminal and any
dialog hidden behind the browser.
`trust proxy: 1` uses the client IP supplied by the immediate deployment proxy;
verify the LOGIN row IP on Render. Do not expose this configuration directly to
untrusted traffic without the expected proxy.

Optional browser-origin check (HTTP 204 and matching allow-origin expected):

```powershell
curl.exe --silent --show-error -i -X OPTIONS "$ApiUrl/api/incidents" `
    -H "Origin: $DashboardUrl" -H 'Access-Control-Request-Method: GET'
```

## 5. Verify audit logs against PostgreSQL

Log into the dashboard as ADMIN (or ICT_ADMIN), open `/audit-logs`, filter action
`LOGIN`, then expand the latest successful row. Expect an object containing `email`
and a `roles` array in `new_values`, no password/token, and no parsing/render error.
`old_values` is null for LOGIN, so that section is absent. SECURITY/STUDENT must
not have access to the audit API/page.

A PostgreSQL process was detected locally on port 5432, but no authorized connection
credentials were supplied and Docker/psql were not on PATH. No PostgreSQL write test
was run during the audit. The API smoke script can verify a configured local or live
PostgreSQL-backed server without deleting any data:

This script takes the **API URL and admin login**, not a PostgreSQL connection
string. The server itself uses `DATABASE_URL`. The external database URL is needed
for seeding, not for this API smoke check. Keep PostgreSQL audit verification open
until this script passes or the live admin page check above succeeds.

```powershell
Set-Location 'C:\Users\israe\Desktop\Project\UniSafe\server'
$AuditCredential = Get-Credential -Message 'ADMIN email and password for audit verification'
$env:AUDIT_API_URL = $ApiUrl
$env:AUDIT_ADMIN_EMAIL = $AuditCredential.UserName
$env:AUDIT_ADMIN_PASSWORD = $AuditCredential.GetNetworkCredential().Password
try {
    node scripts/check-audit.mjs
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL audit verification failed.' }
} finally {
    Remove-Item Env:AUDIT_API_URL, Env:AUDIT_ADMIN_EMAIL, Env:AUDIT_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $AuditCredential = $null
}
```

The script requires `db.engine: postgresql`, creates a uniquely marked LOGIN audit
row through login, reads it through `/api/audit-logs`, checks parsed JSON and logs
out. It leaves the audit row intact and prints no credentials or tokens.

### Check Policy Hub with AI disabled

With both AI keys unset, open the APK's **Policy Hub > Ask AI** and submit a question.
Expect "Policy Q&A is not available right now" with guidance to use **Browse**,
and no stuck spinner or blank screen. Check that Browse still works. The API returns
HTTP 503 with `code: POLICY_UNAVAILABLE`; this does not indicate an incident/SOS outage.
Local tests cover the response and the component state, but the installed-APK check
must still be performed before handoff.

If enabling AI, configure the available spend limits/budgets and usage alerts in
the Anthropic and Voyage provider consoles first, verify their enforcement, and
monitor demo usage. Keep keys server-side. Do not treat a rate limit as a spend cap.

## 6. Build the APK yourself after the checks pass

No APK build is part of this audit. Verify `UniSafe/eas.json` preview
`EXPO_PUBLIC_API_URL` matches the deployed HTTPS API. Its current configured value
is `https://unisafe-api.onrender.com`; confirm that this is your actual service.
The preview profile produces an APK for package `ac.pnguot.unisafe`.

If Render assigned a different URL, update `build.preview.env.EXPO_PUBLIC_API_URL`
in `UniSafe/eas.json` **before building**. The `production` and `production-apk`
profiles also contain the same hardcoded URL; update them to the same verified API
origin to prevent a later build from reaching a different server. An APK already
built with the wrong URL must be rebuilt and reinstalled.

```powershell
Set-Location 'C:\Users\israe\Desktop\Project\UniSafe'
npm ci
npx eas-cli login
npx eas-cli build --profile preview --platform android
```

Complete Expo account/project and Android signing prompts yourself. If Expo requires
project linking, run `npx eas-cli init` and review the resulting configuration before
building. Download the resulting APK and copy its install/download link. Test that
your lecturer can open the link without your Expo session; adjust the build's
sharing/access setting if needed. The APK and dashboard are separate links.

Start the build well before marking so there is time for queueing, testing and a
rebuild. Let EAS generate/manage the Android signing key when prompted. Protect
your Expo login and keep a secure backup of signing credentials outside this repo;
future sideloaded updates need the same signing key and package ID. Losing the
login is recoverable if you retained the key; losing both can prevent an in-place
update. See [Expo signing credentials](https://docs.expo.dev/app-signing/app-credentials/).

Download a second copy of the finished APK to durable storage you control, such as
Google Drive. Verify the backup link from a signed-out browser and retain it through
the marking period. Do not depend on indefinite availability of the build link.

Suggested hand-in note:

> UniSafe is supplied as an Android APK outside the Play Store. Android may ask you
> to allow installation from the browser or file manager used to open it. Play
> Protect may also offer to scan the unfamiliar app. Keep Play Protect enabled;
> if it reports the app as harmful or blocks it, stop and contact me with the exact
> message. Use the provided APK link and the credentials shared separately.

A scan prompt is different from a harmful-app warning; do not describe every
Play Protect warning as harmless. See [Google's installation guidance](https://support.google.com/pixelphone/answer/7391672)
and [Play Protect guidance](https://support.google.com/pixelphone/answer/2812853).

`UniSafe/.env` is gitignored; EAS uses Git ignore rules when `.easignore` is absent,
so the local LAN URL file is excluded from upload. Do not add an override that
includes it. See [Expo upload exclusions](https://docs.expo.dev/build-reference/easignore/).
Only public configuration belongs in `EXPO_PUBLIC_*` variables.

Follow [TESTING.md](TESTING.md) on a real phone using mobile data before sharing.

## Local regression checks (no APK build)

These checks use in-memory SQLite and mocked mobile networking; they do not prove
live PostgreSQL or physical-phone operation. The server test configuration disables
dotenv loading and does not touch your local database.

```powershell
Set-Location 'C:\Users\israe\Desktop\Project\UniSafe\server'
npm test
Set-Location '..'
node --test scripts/check-api.mjs
```

## WHAT I NEED TO DO MANUALLY

- Select the root Blueprint from the reviewed source on `master`.
- Keep the API on Starter; decide whether free PostgreSQL's expiry covers marking
  or choose a paid/migrated database before Apply. Review the billing summary.
- Supply the API URL `<API-URL>`, dashboard URL `<DASHBOARD-URL>`, external DB URL
  privately, and optional AI keys in Render if policy Q&A is needed.
- Verify health, seed privately, save credentials in a password manager, test all
  three roles and the PostgreSQL audit row.
- Complete Expo account/project/signing steps, verify the HTTPS build URL, build
  the preview APK, and supply `<APK-DOWNLOAD-URL>` with lecturer-accessible sharing.
- Complete and record the real-device checklist; do not put credentials in its results.
