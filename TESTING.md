# UniSafe lecturer end-to-end checklist

Run after [DEPLOY-WINDOWS.md](DEPLOY-WINDOWS.md). Use a real Android phone with
Wi-Fi switched OFF and MOBILE DATA switched ON. Keep the app in the foreground
for realtime checks. This checklist is not evidence that a live test has passed.

## Test details (placeholders only)

| Item | Value |
|---|---|
| API HTTPS URL | `<API-URL>` |
| Dashboard HTTPS URL | `<DASHBOARD-URL>` |
| APK download/install URL | `<APK-DOWNLOAD-URL>` |
| Build/version/date | `<BUILD-REFERENCE>` |
| ADMIN email / password | `<ADMIN-EMAIL>` / `<PASSWORD-MANAGER-REFERENCE>` |
| SECURITY email / password | `<SECURITY-EMAIL>` / `<PASSWORD-MANAGER-REFERENCE>` |
| STUDENT email / password | `<STUDENT-EMAIL>` / `<PASSWORD-MANAGER-REFERENCE>` |
| Test date and local time | `<DATE-TIME-PGT-UTC+10>` |

Never replace password placeholders with real passwords in a committed file.
Coordinate the SOS exercise with the responder viewing the dashboard so this
test is not mistaken for a real emergency. Use a unique `LECTURER TEST <time>`
title/description for the incident and record the actual server-generated IDs.

## Preparation

- [ ] Verify the APK download link opens in a private browser without the owner's
  Expo login. Download/install the preview APK (`ac.pnguot.unisafe`) on the phone.
- [ ] Turn Wi-Fi off. Confirm ordinary HTTPS browsing works on mobile data.
- [ ] Open `<API-URL>/health` in the phone browser to wake the API. Allow about
  30-60 seconds if cold, retrying this GET as needed. Require HTTP 200,
  `status: ok`, `db.connected: true`, `db.engine: postgresql`.
- [ ] Check `<API-URL>/api/health` likewise. No login is required for either URL.
- [ ] Complete ADMIN, SECURITY and STUDENT login checks from the deployment guide.
- [ ] In one browser session, log into the dashboard as SECURITY. Keep it open.
- [ ] In a separate admin session, open `/audit-logs`, filter `LOGIN`, expand a
  row. Confirm `new_values` displays email and roles as JSON, with no crash,
  password or token. `old_values` is null for LOGIN. SECURITY must not access it.

## Incident: phone to dashboard, then status back to phone

1. [ ] Log into the APK as STUDENT over mobile data.
2. [ ] Open Report Incident. Choose **Security** so the SECURITY dashboard can
   see the report under its role scope. Enter the unique test title/description.
3. [ ] Grant location permission and capture GPS, or enter a recognizable test
   location manually. Review and submit once. Photos are not required for this test.
4. [ ] Wait for server confirmation and the reference ID. Record the incident ID
   and submission time. A spinner or an unconfirmed-delivery error is not success.
5. [ ] On the SECURITY dashboard, verify the report appears without reloading the
   browser. Check `/incidents` and the dashboard's recent activity. Record latency.
6. [ ] On the phone, open **My Reports** and select this exact incident.
7. [ ] From the dashboard, move the incident through the available permitted
   statuses, e.g. Received, Assigned, Responding, then Resolved. Add a test note
   if the control requests one. Record the time of each change.
8. [ ] Confirm the phone's report detail/status history updates for the same ID
   without resubmitting. Record dashboard-to-phone latency. If it only updates on
   leaving/reopening My Reports, record realtime failure and refetch success separately.

## SOS: phone to dashboard, then acknowledgement back to phone

1. [ ] Tell the SECURITY operator that the coordinated SOS test is starting.
2. [ ] Open SOS on the phone, confirm sending once, and allow GPS if requested.
3. [ ] Wait for the **SOS status** screen and actual SOS reference ID. Record the
   ID/time. If delivery is unconfirmed, check the dashboard before retrying to
   avoid duplicate SOS records; do not assume anyone has received the request.
4. [ ] As SECURITY, verify the dashboard's **Active SOS** count/activity updates
   live and the record appears on `/emergency`, without browser refresh. SOS is a
   separate feed and need not appear in `/incidents`. Record latency.
5. [ ] Keep the phone's SOS status screen open. Click **Acknowledge** for that ID
   on the dashboard. Confirm the phone changes to **Acknowledged**.
6. [ ] Click the dashboard control for **Responding**. Confirm the phone says
   **Responding**, and record latency for both transitions.
7. [ ] Resolve the coordinated test SOS from the dashboard and confirm the phone
   updates. Keep its audit/history records; do not reset or delete the database.

## Failure feedback and connection recovery

- [ ] With no active emergency, disconnect phone data and attempt a clearly marked
  test report. Require a clear failure/unconfirmed-delivery message; the form stays
  available and must not claim a fabricated success/reference.
- [ ] Restore data, check My Reports/the dashboard for a possibly completed write,
  and only retry if needed. Submission POSTs are not automatically replayed.
- [ ] If a cold start occurs, verify the pending message explains the 30-60 second
  wait. A request can wait up to 75 seconds. After failure, wake `/health`, check
  the existing record, and retry manually if necessary.
- [ ] For SOS failures, verify **SOS Delivery Not Confirmed**, retry, and Emergency
  Contacts are visible. Do not use a real emergency to test failure handling.
- [ ] Distinguish immediate Socket.IO updates from polling/refetch recovery: the
  SOS screen also polls about every five seconds after each request completes.
- [ ] Sign out and confirm another user's records are not shown on the next login.

## Results

Record observed values; leave unrun checks as NOT RUN. No real credentials here.

| Device / Android / build | Network / carrier | Incident ID | SOS ID | Approx. latency phone -> dashboard | Approx. latency dashboard -> phone | Live or refetch/poll | Result / notes |
|---|---|---|---|---|---|---|---|
| `<DEVICE>` | `Mobile data / <CARRIER>` | `<INCIDENT-ID>` | `<SOS-ID>` | `<SECONDS>` | `<SECONDS>` | `<OBSERVED>` | `NOT RUN` |

| Transition | Sent/changed at (PGT) | Seen at (PGT) | Approx. latency | Result |
|---|---|---|---|---|
| Incident created -> dashboard | `<TIME>` | `<TIME>` | `<SECONDS>` | `NOT RUN` |
| Incident status -> My Reports | `<TIME>` | `<TIME>` | `<SECONDS>` | `NOT RUN` |
| SOS created -> Emergency | `<TIME>` | `<TIME>` | `<SECONDS>` | `NOT RUN` |
| SOS acknowledged -> phone | `<TIME>` | `<TIME>` | `<SECONDS>` | `NOT RUN` |
| SOS responding -> phone | `<TIME>` | `<TIME>` | `<SECONDS>` | `NOT RUN` |

Handoff only after the incident and SOS round trips pass. Give the lecturer the
dashboard URL and working APK download link, and share role credentials separately
through a private channel. Record any remaining limitations beside the results.
