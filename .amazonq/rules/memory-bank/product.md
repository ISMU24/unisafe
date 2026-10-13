# UniSafe - Product Overview

Reviewed against local source on 2026-10-13 (Pacific/Port_Moresby).
This describes repository behavior, not a verified live deployment.
See [progress.md](progress.md) for completed work, current verification, and handoff.

## Purpose

UniSafe supports campus safety at PNGUOT (Papua New Guinea University of
Technology), Taraka Campus, Lae, Morobe Province, Papua New Guinea. Its Expo app
serves campus users; the UniForce web dashboard serves responders and administrators.

## Applications

| Application | Implemented capabilities |
|---|---|
| Mobile (UniSafe/) | JWT login, detailed incident reporting/history with up to three image attachments, SOS submission/status, targeted alerts, assistance, appeals UI, emergency contacts, policy browsing/search, optional policy Q&A, light/dark theme |
| API (UniSafe/server/) | Authentication and refresh rotation; incidents and image media, SOS, alerts, assistance, appeals, users, dashboard statistics, audit logs, admin recycle bin, health checks, policy PDFs and optional RAG |
| Dashboard (uniforce-dashboard/) | Incident feed/map and detail, incident status/assignment, SOS management, analytics, report export, user administration, targeted notification bell, admin audit viewer, policy Q&A, recycle bin, profile/settings UI |

Mobile AskPolicyAI calls POST /api/policy-search. The policy index and Anthropic
and Voyage credentials are required. Missing configuration returns HTTP 503 with
POLICY_UNAVAILABLE; policy browsing and other API functions remain available.
Local incident triage and duplicate detection use heuristics, not server AI decisions.
Incident reports can include up to three JPEG/PNG images, each at most 2 MB.
The API validates file type/content, stores media in the database, and applies
incident visibility rules when media is fetched. Incident categories have
structured type choices in the mobile client; the server stores the selected
incident_type alongside the category.

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

- The API supports incident image uploads, but this path has only local
  regression coverage; verify image upload and authorized retrieval in a real
  deployed environment before relying on it operationally.
- The dashboard AI Tools page now sends questions to the policy Q&A API and
  displays returned answers/citations or an error; it does not provide predictive
  incident, staffing, hotspot, or anomaly analysis.
- Dashboard Settings changes component state only. Its SMS, notification, and
  auto-assignment controls do not establish working backend features.
- Failed appeal submissions remain unconfirmed: the app shows an error and keeps
  the form available; it does not create a local appeal or claim successful delivery.
- Mobile profile edits persist in AsyncStorage, not the API user record.
- Dashboard profile identity edits do not persist. Password changes now use the
  authenticated request path and adopt the returned session; a full authenticated
  browser end-to-end check remains outstanding.
- Incident realtime events are emitted to category-specific role rooms and pass
  through anonymous presentation. However, the legacy socket join-room handler
  still permits arbitrary role:* room joins after authentication; room membership
  is therefore not a complete authorization boundary until that handler is fixed.
- Policy-generation scripts use Assets while runtime files use assets. Resolve
  this casing mismatch before regenerating on Linux.
- Cross-origin Expo web preflight and authenticated browser behavior have not
  been verified end to end, even though the API CORS allowlist includes the
  mobile ngrok warning header.

## Demo and delivery state

- Windows LAN helpers can set the phone's development URL, start API/dashboard/
  Expo terminals, and inspect local/LAN health. They do not verify a phone round trip.
- An explicit SQLite launcher preserves the existing local database/settings while
  ignoring PostgreSQL selectors for its own process. The Cloudflare tunnel helper
  requires healthy SQLite before exposing the API origin, including Socket.IO.
- Preview and production EAS profiles target the Render API; production-apk
  currently targets a temporary ngrok origin. The Cloudflare helper does not
  update those profiles or an already-built APK.
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
