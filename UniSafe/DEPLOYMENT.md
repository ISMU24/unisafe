# UniSafe - Deployment Guide

For the current Render Blueprint and lecturer APK handoff on Windows, use
[DEPLOY-WINDOWS.md](../DEPLOY-WINDOWS.md). It supersedes the older provider and
mobile configuration examples below and uses the repository-root `render.yaml`.

Three deployable pieces:

| Piece | Path | Deploys to |
|---|---|---|
| API (Express + Socket.IO + PostgreSQL) | `UniSafe/server` | Render, or any Node host / Docker |
| Security dashboard (React + Vite) | `uniforce-dashboard` | Vercel or Netlify |
| Mobile app (Expo) | `UniSafe` | Android APK via EAS |

The API is the single source of truth. Both the dashboard and the mobile app
talk to it over HTTPS; neither one stores data locally.

---

## Pre-Build Checklist

### 1. Deploy the backend
Deploy `UniSafe/server` to a public HTTPS host (Render, Railway, Fly.io, etc.).
Your production API URL: **`https://api.example.com`**
(Replace with your actual deployed host before building.)

### 2. Configure the mobile build URL
**EAS cloud builds (recommended):**
```
# eas.json already sets:
# "EXPO_PUBLIC_API_URL": "https://api.example.com"
eas build --profile preview --platform android    # installable APK
eas build --profile production --platform android  # AAB for Play Store
```
**Local builds:**
```
# In UniSafe/.env:
EXPO_PUBLIC_API_URL=https://api.example.com
cd UniSafe && npx expo run:android
```

### 3. Configure and build the dashboard
```
# In uniforce-dashboard/.env, uncomment:
# VITE_API_URL=https://api.example.com
cd uniforce-dashboard && npm run build
# Deploy dist/ to Vercel, Netlify, nginx, etc.
```

### 4. Configure the server for production
Copy `UniSafe/server/.env.production.example` → `UniSafe/server/.env` and fill in:
- `DATABASE_URL` — your managed PostgreSQL connection string
- `JWT_ACCESS_SECRET` — 64 random hex chars
- `JWT_REFRESH_SECRET` — 64 different random hex chars
- `CLIENT_ORIGINS=https://dashboard.example.com`
- `NODE_ENV=production`

Generate secrets:
```
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Docker Compose (local production-shaped stack)
Requires Docker Desktop. Copy `.env.example` → `.env` at the project root, fill in secrets, then:
```
docker compose up --build
# Dashboard: http://localhost:5173
# API:       http://localhost:3001
```

### 6. Build an installable preview APK
```
npm install -g eas-cli    # one-time
eas login                  # requires expo.dev account
eas build --profile preview --platform android
# Download APK from the EAS dashboard and install via adb or email
```

### 7. Build a production AAB for Google Play
```
eas build --profile production --platform android
eas submit --platform android   # submit to Play Store
```

---

## 1. Deploy the API

### Option A - Render (recommended, gives you managed PostgreSQL)

1. Push this repository to GitHub.
2. In Render: **New > Blueprint**, select the repository.
3. Render reads the repository-root `render.yaml` and creates:
   - `unisafe-api` - a Node web service
   - `unisafe-dashboard` - a static site
   - `unisafe-db` - a PostgreSQL database, wired into `DATABASE_URL`
4. Before the first deploy, open the service's **Environment** tab and set:

   | Variable | Value |
   |---|---|
   | `CLIENT_ORIGINS` | your dashboard origin, e.g. `https://unisafe.vercel.app` |
   | `ANTHROPIC_API_KEY` | optional, enables policy Q&A |
   | `VOYAGE_API_KEY` | optional, enables policy Q&A |

   `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are generated automatically and
   are guaranteed to differ.

5. Generate the secrets yourself if you prefer to control them:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

6. **If you are not deploying the dashboard yet**, seed the database from your
   machine so you get printed credentials:
   ```
   cd UniSafe/server
   $env:DATABASE_URL = "<the postgres connection string>"
   npm run db:init
   npm run db:seed
   ```

The service is live once `https://unisafe-api.onrender.com/health` returns
`{"status":"ok"}`.

### Option B - Docker

The server image needs both `UniSafe/server/` and `UniSafe/assets/`, so the build
context is the `UniSafe` directory:

```
docker build -f server/Dockerfile -t unisafe-server .
```

For the full local stack (PostgreSQL + API + dashboard behind nginx):

```
docker compose up --build
```

Copy `UniSafe/server/.env.production.example` to a `.env` beside
`docker-compose.yml` first. The API comes up on `http://localhost:3001` and the
dashboard on `http://localhost:5173`.

### Option C - Any other Node host

Requirements: Node 22, `npm ci`, `npm start`, and a health check on `/health`.

Required environment variables:

| Variable | Notes |
|---|---|
| `DATABASE_URL` **or** `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` | Omit all of them and the server falls back to a local SQLite file, which loses data on redeploy. |
| `JWT_ACCESS_SECRET` | 32+ characters. |
| `JWT_REFRESH_SECRET` | 32+ characters, different from the access secret. |
| `CLIENT_ORIGINS` | Comma-separated dashboard origins. |
| `NODE_ENV` | `production`. |

The server **refuses to boot** in production without two distinct JWT secrets,
so a misconfigured deploy fails loudly instead of running insecurely.

TLS to the database is enabled automatically for known provider hostnames
(Render, Neon, Supabase, Railway, Azure, Heroku). Override with `DB_SSL=true|false`,
and use `DB_SSL_REJECT_UNAUTHORIZED` plus `DB_SSL_CA` if you need to verify the
provider's certificate.

---

## 2. Deploy the dashboard

Vercel or Netlify, both configured already:

- `uniforce-dashboard/vercel.json`
- `uniforce-dashboard/netlify.toml`

Build command `npm run build`, output directory `dist`.

Set one build-time environment variable:

```
VITE_API_URL = https://unisafe-api.onrender.com
```

Two things to know:

- **Do not add `/api` to the URL.** The API client appends the path itself.
- **`VITE_API_URL` is read at build time**, not at runtime. Set it in the host's
  environment settings and redeploy; editing it in the running container does
  nothing.

Vite loads `uniforce-dashboard/.env` when building. That file exists locally and
sets `VITE_API_URL=http://localhost:3001`, so **a `dist/` built on this machine
is wired to localhost and will not work when uploaded to a host.** Build on the
host, or set `VITE_API_URL` in your shell before building:

```powershell
$env:VITE_API_URL = "https://unisafe-api.onrender.com"
npm run build
```

`.env` is gitignored, so a build triggered by Vercel or Netlify does not pick it
up. A host-set `VITE_API_URL` always wins over `.env`, because Vite does not let
`.env` override variables that are already in the environment.

The dashboard connects to the API cross-origin, including the Socket.IO
connection, so the API must list the dashboard's origin in `CLIENT_ORIGINS`.
There is no reverse proxy in front of the dashboard, and `vercel.json` /
`netlify.toml` deliberately contain no `/socket.io` rule - an earlier version
pointed at a placeholder host that would have broken the deploy.

The only Docker/nginx deployment mode that proxies `/api` and `/socket.io` is
`docker-compose.yml`, which builds the dashboard without `VITE_API_URL` so it
calls its own origin.

---

## 3. Deploy the mobile app

The app is an Expo project that talks to the deployed API over HTTPS and
Socket.IO. Two values must change before you build, and both currently point at
a development address:

| Location | Current value | Change to |
|---|---|---|
| `UniSafe/.env` `EXPO_PUBLIC_API_URL` | `http://192.168.92.205:3001` | `https://your-api-host` |
| `UniSafe/eas.json` `env.EXPO_PUBLIC_API_URL` | `https://YOUR_BACKEND_HOST` | `https://your-api-host` |

**The URL must be HTTPS.** Android blocks cleartext HTTP to any non-local host,
so a `http://` API URL produces an app that logs in fine on an emulator and
fails on every real device. The app falls back to
`app.json > extra.apiUrl` (`http://10.0.2.2:3001`) if the variable is unset, which
is the emulator alias and will not work on hardware.

`EXPO_PUBLIC_*` values are inlined into the JS bundle at build time and are
readable by anyone who unzips the APK. Only ever put the API's public URL here.

### Local build (needs the Android SDK)

```powershell
npx expo install
npx expo run:android          # debug build onto a connected device
```

### Local release build (standalone APK, no Metro needed)

A debug build loads JavaScript from Metro, so it only runs while the dev server
is up. For an APK you can hand to someone, build `release`:

```powershell
$env:NODE_ENV = "production"
cd android
.\gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

- Dropping the two x86 architectures roughly halves the build time and still
  covers every physical phone. Add `x86,x86_64` back for emulators.
- Release signs with the debug keystore that `expo prebuild` generates. That is
  enough to sideload onto a device, but it is **not** a Play Store upload key -
  use the `production` EAS profile for that.
- The release variant bundles `index.android.bundle` (Hermes bytecode), so the
  APK is self-contained.

#### Cleartext HTTP for local testing

Android blocks plain HTTP to non-local hosts, which stops a release build from
reaching an API on your LAN. `android/app/src/main/res/xml/network_security_config.xml`
allows cleartext for `localhost`, `127.0.0.1`, the emulator alias `10.0.2.2`, and
one explicit LAN address, while keeping HTTPS mandatory everywhere else. Android
matches literal hosts here - there is no CIDR support - so the LAN address of the
dev machine is listed explicitly.

Two consequences:

- Change that LAN entry when the dev machine's address changes.
- `android/` is gitignored and regenerated by `expo prebuild`, so this file does
  not survive a prebuild. Once `EXPO_PUBLIC_API_URL` points at an `https://` host,
  the file can be deleted outright.

Verify the config landed with:

```powershell
Select-String -Path android\app\build\intermediates\merged_manifests\release\*\AndroidManifest.xml `
  -Pattern networkSecurityConfig
```

### Cloud build with EAS (no Android SDK needed)

```powershell
npm install -g eas-cli
eas login
eas build:configure           # creates the EAS project, one-time
eas build --profile preview --platform android
```

`eas.json` profiles:

| Profile | Output | Use for |
|---|---|---|
| `development` | debug APK | development client |
| `preview` | APK | internal testing, sideloaded |
| `production-apk` | APK | a sideloadable release build |
| `production` | AAB | Google Play upload |

An APK is what you install directly on a phone or share with a class. The Play
Store requires the AAB from the `production` profile.

Replace `YOUR_BACKEND_HOST` in `eas.json` **before** building, or the APK will
install and then fail every request.

### What the app does with realtime

`src/utils/realtime.js` opens one Socket.IO connection authenticated with the
access token. The server pushes to each user a private `user:<id>` room, so a
student only receives events about their own records. `App.js` binds the
connection to the app lifecycle, `LoginScreen` connects after sign-in, and
`ProfileScreen` disconnects on sign-out.

Realtime is an enhancement, not a dependency. `SOSStatusScreen` still polls every
5 seconds and the other screens refetch on focus, so a blocked WebSocket makes
the app slower to update, never wrong.

---

## 4. Verify the deployment

Run these against the deployed API. Everything except the last one needs no
credentials.

```bash
curl https://unisafe-api.onrender.com/health
# {"status":"ok","uptime":12}

curl https://unisafe-api.onrender.com/api/health
# {"status":"ok","index":"loaded","rag":{...},"db":{"engine":"postgresql","connected":true}}
```

Then, in the dashboard:

1. Sign in as the seeded admin. `GET /api/users` must never contain
   `password_hash`.
2. Report an incident as a student on the phone. It must appear on the
   dashboard **without a refresh**.
3. Trigger an SOS. It must appear in **Emergency** immediately.
4. Acknowledge the SOS from the dashboard. The phone must update.
5. Send an alert targeted at `STAFF`. A student must not receive it.

```bash
# Should be 403: origin not in CLIENT_ORIGINS
curl -i -X OPTIONS https://unisafe-api.onrender.com/api/incidents \
  -H "Origin: https://not-your-dashboard.example" \
  -H "Access-Control-Request-Method: GET"
```

On the phone, with the APK installed:

1. Sign in as a student.
2. Pull down on **Safety Alerts**. A real alert appears; an unreachable API shows
   an error, never a fabricated alert.
3. Report an incident, then open it in **My Reports**. Assign and advance the
   status from the dashboard - the phone must update without a refresh.
4. Trigger SOS, then acknowledge it from the dashboard. The SOS status screen
   must change immediately.
5. Sign out. The other student's reports must no longer appear.

---

## 5. First-boot credentials

`npm run db:seed` creates the demo accounts and **prints their passwords once**.
Anything you do not supply through `SEED_*` is generated with
`crypto.randomInt`, so no default password is ever stored silently.

| Role | Email |
|---|---|
| Admin | `admin@pnguot.ac.pg` |
| ICT admin | `ict@pnguot.ac.pg` |
| Security officer | `security@pnguot.ac.pg` |
| Medical responder | `medical@pnguot.ac.pg` |
| Staff | `staff@pnguot.ac.pg` |
| Students | `23201047@`, `23198812@`, `23205511@student.pnguot.ac.pg` |

Change every one of these before handing the system over, and delete the seeded
incidents, SOS events, alerts and appeals if they should not appear as real data.

The alternative bootstrap path, `INITIAL_ADMIN_EMAIL` + `INITIAL_ADMIN_PASSWORD`,
only runs when no ADMIN account exists yet and now requires explicit, valid
values - the old default password is refused.

### Re-running the seed does not reset passwords

`db:seed` is safe to re-run. An account that already exists is left completely
alone: its password is **not** regenerated and the script will not print one,
because it has no way to know it. It prints how many accounts were left
untouched instead.

This matters more than it sounds. An earlier version re-hashed every account
with a freshly generated password on each run, which meant a second seed silently
invalidated credentials you had already recorded, and reverted any password an
administrator had changed since.

To deliberately set one, supply it:

```powershell
$env:SEED_ADMIN_PASSWORD = "a-real-password"
npm run db:seed
```

The recognised prefixes are `SEED_ADMIN`, `SEED_ICT`, `SEED_SECURITY`,
`SEED_MEDICAL`, `SEED_STAFF`, and `SEED_STUDENT1`/`2`/`3`, each taking
`_PASSWORD` and `_EMAIL`.

### Seeding is idempotent on both engines

Both `db:init` and `db:seed` re-apply the schema safely, so it does not matter
whether you run them once or many times. Rows use fixed UUIDs for their primary
keys precisely so that `ON CONFLICT DO NOTHING` can recognise them - incident and
SOS ids are generated with `crypto.randomUUID()` at runtime, so there is no
human-readable `INC-####` code in the database despite how ids are displayed.

---

## 5a. Verifying a deployment

`npm test` runs the vitest suite, but `tests/setup.js` pins it to SQLite. That
suite cannot see engine-specific bugs - during verification, SQLite happily
accepted non-UUID primary keys and an out-of-range enum value that PostgreSQL
rejects outright.

To exercise the engine you actually deploy on, run the end-to-end script against
a live server:

```powershell
cd UniSafe/server
$env:BASE_URL = "https://unisafe-api.onrender.com"
$env:ADMIN_EMAIL    = "admin@pnguot.ac.pg";    $env:ADMIN_PASSWORD    = "..."
$env:SECURITY_EMAIL = "security@pnguot.ac.pg"; $env:SECURITY_PASSWORD = "..."
$env:STUDENT_EMAIL  = "23201047@student.pnguot.ac.pg"; $env:STUDENT_PASSWORD = "..."
npm run e2e
```

It checks health and the reported engine, login and rejection of a bad password,
that `/api/users` never returns a password hash, role scoping (a student must be
refused incident stats), CORS refusal of an unknown origin, the incident
lifecycle including a live `incident-update` push over Socket.IO, targeted alert
delivery, and that policy search degrades to 503 without AI keys instead of
crashing.

---

## 6. Troubleshooting

**Dashboard loads but every request fails.** `VITE_API_URL` was set after the
build, has a trailing `/api`, or `dist/` was built locally and inherited
`localhost:3001` from `uniforce-dashboard/.env`. See the build-time note above.

**Incident appears only after a manual refresh.** Realtime is a separate
connection from REST. Check that the dashboard's origin is in `CLIENT_ORIGINS`
- the REST call would succeed from the same page, so a working dashboard does
not prove CORS is right.

**Server exits immediately on deploy.** Almost always the JWT secrets. The
refusal message names the offending variable.

**`/api/health` returns 503 with `db.connected: false`.** The database is
unreachable. On most free tiers a managed database pauses when idle and resumes
on the next query; the first request after a pause can time out.

**Policy Q&A returns 503.** Expected when `ANTHROPIC_API_KEY` or
`VOYAGE_API_KEY` is unset. Everything else works without them, and
`GET /api/health` reports `rag.configured: false`.
