# Security fixes — 14 October 2026

These changes are implemented locally. They have not been committed, pushed,
deployed, or installed on a phone. Existing PostgreSQL data, accounts, local
credentials, and the running backend were not changed. This is a focused
remediation of the audit findings, not a guarantee that the system has no other
vulnerabilities.

## Remediation

| Finding | Change | Main files |
| --- | --- | --- |
| Public PDF requests could crash the process on directories | Validate path components, resolve containment, require a regular PDF file, and handle send errors | `UniSafe/server/src/routes/policies.js`, `UniSafe/server/index.js` |
| Arbitrary Socket.IO rooms exposed responder incidents | Room joins are restricted; event delivery independently checks current database permissions | `UniSafe/server/src/realtime.js` |
| Realtime appeals and targeted alerts leaked to other responders | Appeals reach administrators and their owner; alerts reach administrators and targeted roles | `UniSafe/server/src/realtime.js`, `src/routes/alerts.js` |
| Stale sockets retained access after account changes | Recheck active status, roles and session version before delivery; disconnect on token expiry | `UniSafe/server/src/realtime.js` |
| Dashboard recent activity exposed confidential reporters and appeals | Apply the shared incident presenter and scope appeals to administrators or their owner; scope alert counts | `UniSafe/server/src/routes/dashboard.js` |
| Password reset left old access tokens usable | Add `users.auth_version`; bump it and revoke refresh tokens atomically on password changes, deactivation and account recycling; enforce in HTTP, refresh and sockets | `src/auth/{tokens,middleware,routes}.js`, `src/models/{users,recycle-bin}.js`, `src/config/{schema.sql,sqlite-schema.js}` under `UniSafe/server` |
| Password-change throttling could be bypassed with an email field | Key by authenticated account; registration has its own limiter counting successful requests | `UniSafe/server/src/config/rate-limits.js`, `src/auth/routes.js` |
| Public AI endpoint and unused request limits | Require authentication for AI, limit question length, enable AI/upload/general API limits and provider timeouts | `UniSafe/server/index.js`, `rag.js`, `src/routes/incidents.js` |
| Database TLS did not verify certificates by default | Enable verification; document private CA configuration | `UniSafe/server/src/config/db.js`, `.env.production.example`, `UniSafe/DEPLOYMENT.md` |
| Mobile tokens persisted in plaintext | Use Expo SecureStore on Android/iOS; migrate legacy tokens only after secure persistence; web tokens stay in memory; disable Android backup | `UniSafe/src/utils/{session-storage,api,realtime}.js`, `screens/SplashScreen.js`, `app.json`, `package.json` and lockfile |
| CSV formula injection | Neutralize formula/control prefixes before CSV escaping | `uniforce-dashboard/src/utils/csv.js`, `src/pages/Reports.jsx` |
| Compose used a known default DB password and exposed PostgreSQL on all interfaces | Require an explicit password and bind the database port to loopback | `docker-compose.yml`, `.env.example` |
| Unused mock authentication credentials | Remove the unreferenced `UniSafe/src/data/users.js` module | `UniSafe/src/data/users.js`, `UniSafe/AGENTS.md` |
| Android release used debug signing | Expo plugin rejects release tasks using a debug key; allow existing production credentials through EAS or environment variables | `UniSafe/plugins/with-release-signing.cjs`, `app.json`, `DEPLOYMENT.md` |

Realtime publishers now await delivery checks after database writes, preserving
event ordering. Recycle-bin events use the same authorization and presentation
rules. Both clients retain subscriptions across token renewal, recover after
an offline expiry, and cancel pending connections on logout. Related files are
`UniSafe/server/src/routes/{incidents,sos,alerts,appeals,assistance,recycle-bin}.js`,
both client `realtime.js` modules, and `uniforce-dashboard/src/api.js`.

## Dependencies and remaining findings

- Dashboard: `nanoid@3.3.20` and `source-map-js@1.2.2` updated to patched compatible versions.
  The final npm audit reports **0** vulnerabilities.
- Server: final npm audit reports **0** vulnerabilities.
- Root: scoped `xcode` override uses `uuid@11.1.1`; npm audit fell from 22 to
  **15 high** findings. The remaining package entries trace to two upstream
  advisories, rather than 15 distinct vulnerabilities.
- Mobile: scoped `xcode` and `@expo/ngrok` overrides use `uuid@11.1.1`;
  `expo-secure-store@57.0.4` was added. Local checks confirm no older UUID copy
  in the lockfile, and xcode UUID generation and ngrok module loading work.
  The approved post-change mobile npm audit completed on 14 October 2026:
  **18 high** package findings remain, down from 27 (18 high, 9 moderate).
  There are no critical, moderate or low findings. All remaining entries trace
  to the same two upstream advisories in `braces` and `node-forge`; the UUID
  advisory and its dependent package findings are no longer reported.

The root and mobile Expo toolchains still include `braces@3.0.3` and
`node-forge@1.4.0`. Neither has a patched release as checked on 14 October 2026:
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv).
Keep the build toolchain restricted to trusted inputs and hosts; do not expose
Metro or Expo development servers as production services. These controls do
not repair the packages. Recheck for upstream fixes. `npm audit fix --force`
proposed downgrading Expo 57 to Expo 44, so it was not applied.

The existing `UniSafe/UniSafe-v1.0.0.apk` remains debug-signed and contains old
code. It was not overwritten or distributed. A new production-signed native
build is required for the storage changes; a JavaScript-only update cannot add
SecureStore to an old binary. The real signing credentials were not available,
so no replacement production APK was produced. The signing guard was applied
to the current ignored native project and is preserved by the Expo plugin on
future prebuilds.

## Validation

- Server: **107 tests pass** across 10 files. Tests use isolated in-memory SQLite and test-only users. They do not
  touch the local or hosted PostgreSQL database. New tests cover PDF traversal
  and directories, private dashboard data, HTTP/refresh revocation, password
  throttling, room abuse, targeted events, changed roles, idle socket expiry,
  and TLS defaults. Existing live-subprocess tests also verify authenticated
  AI access, CORS and the full incident/SOS push path.
- Dashboard: 20 tests pass, including CSV safety and both clients' realtime
  renewal/logout regressions; production build passes.
- Mobile: 13 API/storage tests pass; Android production JavaScript export
  passes with SecureStore included. Device Keychain/Keystore behavior has not
  been tested on physical hardware.
- Android `:app:validateSigningRelease --offline --no-configuration-cache`
  was intentionally rejected with `Release signing required ... Debug signing
  is forbidden`, confirming the guard works. This is not a successful APK build.
- `git diff --check` passes. Generated verification artifacts are ignored via
  `.gitignore`; the new tests are tracked source candidates.

Tests added/updated: `UniSafe/server/tests/{security,realtime}.test.js`,
`UniSafe/scripts/{check-api,check-session-storage}.mjs`, and
`uniforce-dashboard/tests/{api,csv,realtime}.test.mjs`.

## Applying the changes

1. Review the diff, back up PostgreSQL, and deploy the API and clients together.
   API startup adds `users.auth_version` without deleting accounts or records.
   Existing tokens remain compatible until that account is explicitly revoked.
   Deploy the updated clients with the socket-expiry behavior to keep realtime
   updates working through token renewal.
2. Use a real HTTPS API origin and exact `CLIENT_ORIGINS`, including
   `https://joyful-trifle-faf7e0.netlify.app`. See
   [NETLIFY-LOGIN-FIX.md](NETLIFY-LOGIN-FIX.md) for the original 404 diagnosis,
   Netlify settings, commit/push commands, and deployment verification.
   Local bundle checks used the previously verified **temporary** ngrok origin;
   its availability must be checked again before deployment. No successful
   live Netlify login is claimed by these tests.
3. Managed PostgreSQL certificates must validate. Supply a private CA through
   `DB_SSL_CA` where required. For Compose, use the password already associated
   with an existing database volume; changing `.env` alone does not rotate that
   password. Preserve the volume and perform any password rotation separately.
4. Review the rate-limit settings for campus traffic. General API limits are
   per IP; AI, uploads and password changes are per user. Stores are currently
   in memory per API process, so multi-instance deployment needs shared rate
   limit storage and a shared Socket.IO adapter.
5. Build mobile with the production signing key as documented in
   [UniSafe/DEPLOYMENT.md](UniSafe/DEPLOYMENT.md). Verify the APK certificate and
   test sign-in, storage migration, logout, SOS and notifications on a device.
   Changing from a debug signing identity can prevent in-place installation;
   do not silently replace an established production signing key.

Dashboard tokens still use its existing browser storage. A move to HttpOnly
cookies and a restrictive CSP would require a separate auth/deployment design;
no exploitable dashboard XSS was established in this audit.
