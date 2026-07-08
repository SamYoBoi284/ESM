# RelayDesk — Feature Update Summary

## New files
- **shifts.js** — defines the 3 shift cycles (12AM-9AM / 8AM-5PM / 4PM-12AM), lateness calc, admin shift-assignment, and the late/idle alert scanner.
- **chat.js** — colleague DM + group chat (Firestore `chats` collection), with ping sound on incoming messages.
- **myhistory.js** — "My Past Shifts" modal + personal CSV export.
- **admin-extras.js** — audit log filters, admin "Add Employee" form, and the alerts renderer.

## Employee-side
- **Late clock-in**: on first "On Duty" of a shift, actual time is compared to the employee's assigned cycle (`shifts.js`). Logs `LATE_CLOCK_IN` to audit + shiftHistory, shows a toast to the employee.
- **Editable loads**: each load card now has an ✏️ Edit button (workspace.js `editLoad`) — updates both the live `bookedLoads` array and the shiftHistory ledger.
- **My Past Shifts**: new button on the dashboard opens a modal listing all past `shiftHistory` docs for that user, plus a CSV export button.
- **Shift-end warning**: toast + sound at 15 minutes remaining (workspace.js `updateShiftCountdown`), independent from the existing hard-stop at 0:00.
- **Per-shift notes**: notes are now also written onto that shift's own `shiftHistory` doc (like loads already were) and the notes box clears at the start of a new shift, so old notes stay archived.
- **CSV export**: from the My Past Shifts modal.
- **Team Chat**: added above Personal Notes in the workspace panel. Pick one colleague for a DM or several for a group, with a ping sound on new messages (drop `chat_ping.mp3` in `/assets`).

## Admin-side
- **Audit log filters**: filter by user / action / date range, above the audit log box.
- **Add Employee**: pre-create an account with role + assigned shift, PIN optional (blank = employee sets it on first login).
- **Idle/lateness alerts**: new "Alerts" card next to Statistics, auto-flags anyone late for their assigned shift or "Away" for 30+ minutes straight.
- **Shift assignment**: each user card in the admin panel now has a shift dropdown (Shift 1/2/3/Unassigned).

## General
- **3 shift cycles** defined centrally in `shifts.js`, used by both the lateness check and the admin assignment UI.
- **Persistent login**: signing in now saves the employee code to `localStorage`. Refreshing the page silently resumes the session instead of logging out — only the Logout button (now `relayLogout()`) clears it.
- **Notification system overhaul**: added a centralized `notificationmanager.js` so ESM now routes notifications through a single manager with toast fallback, browser desktop notification support, priority/category handling, one-time permission prompting after login, and sound playback hooks for future audio assets.
- **Electron desktop shell**: wrapped the existing web app in an Electron window with tray support, minimized-to-tray behavior, external-link handling, and native desktop notifications via the same NotificationManager layer.

## Assets you still need to add
Drop these into your `/assets` folder (referenced but not included, per your note that you'd handle audio yourself):
- `assets/chat_ping.mp3` — plays on incoming chat messages
- `assets/shift_warning_ping.mp3` — plays at the 15-minute shift-end warning

## Notes / things worth knowing
- Shift assignment and lateness only apply to employees the admin has assigned a cycle to (`assignedShift` field) — unassigned employees are never flagged late.
- The "Extended Away" alert threshold is 30 minutes and the late-clock-in grace period is 10 minutes — both are easy constants to tweak at the top of `shifts.js` (`LATE_GRACE_MINUTES`, `IDLE_AWAY_LIMIT_MS`).
- Chat and shift-history data live in new Firestore collections (`chats`, and the existing `shiftHistory` gets a few new fields) — no changes to your Firestore security rules were made here, so double check those allow the new collection/fields if you have rules deployed.
