# UniSafe - Product Overview

Reviewed against local source on 2026-10-12 (Pacific/Port_Moresby).
This describes repository behavior, not a verified live deployment.
See [progress.md](progress.md) for completed work, current verification, and handoff.

## Purpose

UniSafe supports campus safety at PNGUOT (Papua New Guinea University of
Technology), Taraka Campus, Lae, Morobe Province, Papua New Guinea. Its Expo app
serves campus users; the UniForce web dashboard serves responders and administrators.

## Applications

| Application | Implemented capabilities |
|---|---|
| Mobile (UniSafe/) | JWT login, incident reporting/history, SOS submission/status, targeted alerts, assistance, appeals UI, emergency contacts, policy browsing/search, optional policy Q&A, light/dark theme |
| API (UniSafe/server/) | Authentication and refresh rotation; incidents, SOS, alerts, assistance, appeals, users, dashboard statistics, audit logs, health checks, policy PDFs and optional RAG |
| Dashboard (uniforce-dashboard/) | Incident feed/map, SOS management, analytics, report export, user administration, targeted notification bell, admin audit viewer, profile/settings UI |

Mobile AskPolicyAI calls POST /api/policy-search. The policy index and Anthropic
and Voyage credentials are required. Missing configuration returns HTTP 503 with
POLICY_UNAVAILABLE; policy browsing and other API functions remain available.
Local incident triage and duplicate detection use heuristics, not server AI decisions.

## Users and access

| API role | Intended access |
|---|---|
| STUDENT, STAFF | Submit/view their own records, receive addressed alerts, consult policies |
| SECURITY | Manage Security, Fire, and Other incidents; responder dashboard and SOS |
| MEDICAL | Manage Ambulance incidents; responder dashboard and SOS |
| ADMIN, ICT_ADMIN | Broad management, users/roles, alerts administration, audit logs |

Incident ownership, category permissions, and anonymous reporter redaction are
enforced by the REST API. Dashboard navigation alone is not authorization.
Non-responder users can currently sign into the dashboard and encounter restricted endpoints.

## Data and delivery

- The API database is authoritative for operational records. PostgreSQL is
  required in production and is the normal configured engine. SQLite is limited
  to development/tests and requires explicit opt-in; PostgreSQL configuration
  or connection failures never switch engines.
- Incidents (/api/incidents, incidents table) and SOS (/api/sos, sos_events table)
  are separate feeds. Dashboard home consumes both; Emergency consumes SOS.
- Clients store sessions/preferences in AsyncStorage (mobile) or localStorage
  (dashboard). This is not an offline reporting queue.
- Socket.IO provides connected updates. Dashboard subscriptions also poll; mobile
  refresh behavior varies. SOS status polls after completed requests; My Reports
  reloads on focus or explicit refresh.
- Mobile incident, SOS, and assistance success requires a server-generated ID.
  Network errors/timeouts leave delivery unconfirmed. POSTs are not automatically
  replayed after transport failure; check records before retrying. A 401 can trigger
  one retry after refreshing the access token.

## Known implementation gaps

- Incident photos are preview-only; they are not uploaded. Review/success messages
  disclose this.
- Dashboard AITools.jsx uses sample incidents/personnel, static hotspots, and local
  text rules. It does not call policy Q&A or provide live AI analysis.
- Dashboard Settings changes component state only. Its SMS, notification, and
  auto-assignment controls do not establish working backend features.
- Failed appeal submissions remain unconfirmed: the app shows an error and keeps
  the form available; it does not create a local appeal or claim successful delivery.
- Mobile profile edits persist in AsyncStorage, not the API user record.
- Dashboard profile identity edits do not persist. Password changes now use the
  authenticated request path and adopt the returned session; a full authenticated
  browser end-to-end check remains outstanding.
- Incident socket events go to a shared responder room without the REST category
  filters or anonymous presentation helper. Do not claim equivalent REST/socket privacy.
- The legacy socket join-room handler permits arbitrary role:* room names;
  role-room membership is not fully protected by the initial handshake.
- Policy-generation scripts use Assets while runtime files use assets. Resolve
  this casing mismatch before regenerating on Linux.
- Mobile adds an ngrok header to every REST request, while server CORS does not
  allow that header. Cross-origin Expo web requests need a compatibility check/fix;
  the native transport tests do not cover browser preflight.

## Demo and delivery state

- Windows LAN helpers can set the phone's development URL, start API/dashboard/
  Expo terminals, and inspect local/LAN health. They do not verify a phone round trip.
- An explicit SQLite launcher preserves the existing local database/settings while
  ignoring PostgreSQL selectors for its own process. The Cloudflare tunnel helper
  requires healthy SQLite before exposing the API origin, including Socket.IO.
- Preview and production EAS profiles target Render; production-apk currently
  targets ngrok. The Cloudflare helper does not update those profiles or the APK.
- Mobile requires an explicit API URL in both development and release. Release
  requires HTTPS; changing a bundled origin requires another build.
- EAS project linkage and local debug/release APK files exist. Their presence
  does not establish a successful cloud build, current embedded URL, installation,
  or completed physical-device acceptance. See progress.md for artifact evidence.

## Acceptance evidence

Use root TESTING.md for physical Android mobile-data incident/SOS round trips,
failure messaging, live versus refetch updates, and admin audit inspection.
Record actual results. A checklist, unit test pass, or build does not prove that
a deployed dashboard and physical phone work end to end.
