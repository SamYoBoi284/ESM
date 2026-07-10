# Shift Management Feature — Context Tracker

> **CURRENT STATUS (read this first):** Feature code-complete since
> Step 6. User's live click-through found and I fixed one bug
> (Supervisor missing `canManageEmployees` — see section 6b). Three
> further, unrelated bugfixes were then made (`workspace.js` x2,
> `electron/main.js` x1) during the same session — see section 7 and
> `BUGFIXES.md`. `adminguide.js`'s in-app Admin Guide was then updated
> to document the new Shift Management system and the Owner-tier
> permission concept — see section 8. Nothing about Shift Management
> itself is currently pending.

> Multi-session dev log for the "Shift Management" feature (configurable,
> Firestore-backed shifts replacing the old hardcoded 3-cycle system).
> Keep this file updated after every implementation step so work can
> resume seamlessly in a future session/chat.

---

## 0. Source of truth for requirements

Owner/Admin panel gets a new **Shift Management** system:
- A000 (Owner) — and, consistent with the app's existing permission model,
  anyone granted `canAssignShifts` — can create **unlimited** shifts.
- UI reuses the same dynamic add/remove-item interaction already used by
  **Trips → Additional Stops** (`workspace.js`, `loadModalStops` /
  `renderLoadModalStops()` / `bindLoadModalStops()`).
- Each shift: Name (required), Start Time, End Time, Time Zone (USA →
  `America/Chicago`, Syria → `Asia/Damascus`, stored as IANA string),
  Assigned Employees (multi-select from all registered employees),
  Enabled/Disabled toggle.
- Owner can create/edit/delete/enable-disable/rename/change
  times/change timezone/change assigned employees at any time.
- Multiple shifts can exist and can overlap in time. Overnight shifts
  (e.g. 10 PM–7 AM) must work. An employee belongs to only one shift
  at a time (enforced at assignment time — an employee id can only
  ever be present in one shift's `assignedEmployees` array).
- Timezone stays editable after creation; evaluation of "is employee
  currently in shift" must use the correct IANA timezone automatically.
- ESM should resolve an employee's assigned shift automatically at
  login and throughout the app (attendance validation, countdowns,
  dashboards, stats, reports, presence monitoring, etc).
- Firestore-backed, schema designed to be extensible (future fields:
  department, color, breakDuration, workLocation, notes, ...) without
  restructuring.
- Real-time: edits must update Firestore and refresh all clients live.

**Working instructions from the user (apply to every future session too):**
- Work in small incremental edits, one logical portion per response,
  wait for the next prompt before continuing.
- Update this Context Tracker after every successful step.
- Avoid unrelated refactors outside this feature's scope.

---

## 1. Codebase orientation (facts gathered — don't re-derive)

- Project root: `ESM - Employee Status Monitor/` (plain JS, no bundler,
  scripts loaded via `<script defer>` tags in `index.html` in a fixed
  order — see list below). Firebase compat SDK (`firebase-firestore-compat.js`),
  global `window.db` set in `firebase.js`.
- **Old hardcoded shift system** lives in `shifts.js`:
  - `SHIFT_SCHEDULES.US` / `.SY` — fixed shift1/shift2/shift3 cycles.
  - `window.SHIFT_CYCLES` — points at whichever schedule is active.
  - `system/shiftConfig` Firestore doc stores `{timezone: "US"|"SY"}`,
    listened to by `window.initShiftConfig()`.
  - `window.assignEmployeeShift(userId, shiftKey)` writes
    `users/{id}.assignedShift = "shift1"|"shift2"|"shift3"|null`.
  - `window.checkLateness`, `window.getExpectedShiftStart`,
    `window.scanForAlerts` all key off `window.SHIFT_CYCLES` +
    `user.assignedShift`.
  - Per-employee shift dropdown UI lives in `admin.js` (~line 504,
    class `.shiftAssignRow`) and `index.html` (`#newEmpShift` in the
    Add Employee form). Admin timezone picker: `#shiftTimezoneSelect`
    card in `index.html` (~line 1151, "🌐 Shift Schedule" aside).
  - **Decision: this old system is left fully intact for now** and
    will be cut over / removed in a later step once the new system's
    UI and integration points are complete, to avoid ever leaving the
    app in a half-broken state mid-session. See "Migration plan" below.
- **Dynamic add/remove pattern to mirror** (Trips → Additional Stops),
  in `workspace.js`:
  - Module-level array `loadModalStops` (analogous array we'll use:
    `shiftModalAssignedEmployees` isn't array-of-freeform-text but a
    multi-select checkbox list is more correct for "assigned
    employees" — see UI plan below; the *add/remove row* pattern itself
    is reused verbatim for nothing else needed here, since employees
    are picked from an existing roster, not freeform stops. We DO
    reuse this exact pattern in a later step if/when we need any
    freeform repeatable sub-list, but for Assigned Employees a
    checkbox multi-select (same pattern as `permissions.js`
    `renderPermissionCheckboxes` / `renderOffDayCheckboxes`) is the
    correct, already-established idiom in this codebase for "pick N of
    a known set", and is what we will use).
  - `renderLoadModalStops()` — rebuilds rows from the array, attaches
    per-row `input` (mutate array by index) and remove-button (`splice`
    + re-render) listeners.
  - `bindLoadModalStops()` — Add button pushes a new empty entry then
    re-renders.
- **Permission system** (`permissions.js`): `window.hasPermission(key)`,
  `window.PERMISSION_KEYS` (add nothing new yet — reusing
  `canAssignShifts` for all shift-management actions, same as the old
  system already did, keeps this consistent with the rest of the app).
  A000 always passes every check regardless of stored permissions.
- **Modal pattern** to mirror for the Create/Edit Shift modal:
  `#loadModal` / `loadModalUI` / `openLoadModal()` / `closeLoadModal()`
  in `workspace.js` + matching markup block in `index.html` (~line
  2187, `<div id="loadModal" class="modalOverlay hidden">`). Multi-
  select checkbox grid pattern: `#permissionsModal` /
  `renderPermissionCheckboxes()` / `renderOffDayCheckboxes()` in
  `permissions.js` / `shifts.js`.
- **Audit logging**: `window.logAudit(userId, action, detail)` in
  `audit.js`, already used by `shifts.js` for `SHIFT_TIMEZONE_CHANGED`
  / `SHIFT_ASSIGNED`.
- **Firestore rules** (`firestore.rules`): global catch-all
  `allow read, write: if request.time < timestamp.date(2026, 7, 30)`,
  then explicit permanent per-collection rules added below it for
  collections that need to keep working after that expiry (pattern:
  `match /{collection}/{id} { allow read, write: if true; }` — no
  Firebase Auth in this app, custom code+PIN login only, so this is
  consistent with every other collection).
- **Script load order** (`index.html` `<head>`): ... `permissions.js`
  → `shifts.js` → `auth.js` → ... → `admin.js` → `admin-extras.js` →
  ... → `app.js` (bootstraps, calls `initShiftConfig()` etc. around
  line 168, inside the `DOMContentLoaded`-style init block).

---

## 2. New Firestore schema (extensible)

Collection: **`shifts`** (new top-level collection). Doc ID: Firestore
auto-ID. Fields:

```js
{
  name: "Morning Crew",              // string, required
  startTime: "14:00",                // "HH:MM", 24h, wall-clock in `timezone`
  endTime: "23:00",                  // "HH:MM", 24h — may be <= startTime (overnight wrap)
  timezoneRegion: "US" | "SY",       // UI-facing selector key, extensible list
  timezone: "America/Chicago",       // IANA identifier actually used for all math
  assignedEmployees: ["A011","A014"],// array of user codes (doc IDs in `users`)
  enabled: true,
  order: 0,                          // creation order, for stable list display
  createdAt: 1752300000000,          // epoch ms
  createdBy: "A000",
  updatedAt: 1752300000000,
  updatedBy: "A000"
  // Reserved for future, intentionally NOT written yet so adding them
  // later needs no migration: department, color, breakDurationMinutes,
  // workLocation, notes.
}
```

Employee side: **no schema change yet** to `users/{code}` — an
employee's shift is resolved by scanning `shifts` for whichever doc's
`assignedEmployees` array contains their code (single source of
truth, enforced unique by `saveShift()` — see below). This avoids a
denormalized field that could drift out of sync. (Old
`users/{code}.assignedShift` field is untouched/ignored by the new
system — it's only read by the old hardcoded engine until that's
retired.)

`system/shiftConfig` (old) is untouched. No new `system/*` doc is
needed for the new system — everything lives on the `shifts` docs
themselves.

---

## 3. New module: `shiftmanagement.js`

Created in this step. Registered in `index.html` script list
immediately after `shifts.js` (loads after `permissions.js`, before
`admin.js`/`admin-extras.js` which will consume it in later steps).

Globals it exposes (all distinct names, no collisions with the old
`shifts.js` engine, verified by grep before writing):

- `window.SHIFT_TIMEZONE_ZONES` — extensible list of
  `{ code, label, iana }` (currently `US`→`America/Chicago`,
  `SY`→`Asia/Damascus`). Adding a 3rd region later = one array entry,
  nothing else changes.
- `window.initShiftManagement()` — attaches the live `shifts`
  onSnapshot listener, builds `window.SHIFTS` (map by id) and
  `window.SHIFTS_LIST` (ordered array), fires a `shiftsChanged`
  DOM CustomEvent on every update, calls
  `window.renderShiftManagementUI?.()` (UI hook — no-op until the
  Admin Panel UI step defines it).
- `window.saveShift(shiftId, payload)` — create (shiftId falsy) or
  update (shiftId truthy) a shift document. Validates `name` is
  required. Enforces "one shift at a time": for every employee in the
  new `assignedEmployees` list, removes them from every *other*
  shift's `assignedEmployees` first (single batched write, so it's
  atomic and every affected client updates together). Permission-gated
  on `canAssignShifts`. Audit-logs `SHIFT_CREATED` / `SHIFT_UPDATED`.
- `window.deleteShiftById(shiftId)` — permission-gated, confirms,
  deletes the doc, audit-logs `SHIFT_DELETED`.
- `window.setShiftEnabledState(shiftId, enabled)` — permission-gated
  quick toggle (doesn't require opening the full edit modal),
  audit-logs `SHIFT_ENABLED` / `SHIFT_DISABLED`.
- Timezone-correct evaluation helpers (DST-safe, via
  `Intl.DateTimeFormat` wall-clock parts — no library dependency):
  - `window.getZonedParts(timezone, date)`
  - `window.getShiftStartEndMinutes(shift)`
  - `window.isNowWithinShift(shift, referenceDate)` — overnight-wrap
    aware.
  - `window.getShiftExpectedStartEpoch(shift, referenceTime)` /
    `window.getShiftExpectedEndEpoch(shift, referenceTime)` — mirrors
    the old `getExpectedShiftStart` "most recent start ≤ now" anchoring
    logic, but timezone/DST-correct and works for *any* start time
    (not just the 3 fixed cycles).
- Employee-resolution helpers (consumed by later integration steps):
  - `window.getEmployeeAssignedShift(userId)` — returns the one shift
    doc (or `null`) whose `assignedEmployees` contains `userId`.
  - `window.isEmployeeCurrentlyOnShift(userId, referenceDate)` —
    convenience wrapper combining the above two.

Not yet done in this file (intentionally deferred, see Pending Work):
UI rendering, admin-panel wiring, replacing the old per-employee
dropdown, replacing `checkLateness`/`scanForAlerts`, login-time
resolution, countdown/dashboard/report integration.

---

## 4. Migration plan (old hardcoded system → new system)

To avoid ever shipping a half-working intermediate state, the cutover
is staged:

1. **(DONE this step)** New data layer (`shiftmanagement.js`) lives
   alongside the old system. Zero behavior change yet — nothing calls
   into it, nothing reads from it.
2. **(NEXT)** Owner Panel UI: new "🕐 Shift Management" `adminSection`
   card in `index.html` (list/cards of shifts + Create/Edit modal),
   wired up in a new UI portion of `shiftmanagement.js` (or a
   `shiftmanagement-ui` section of the same file). Gated the same way
   the rest of the admin panel is (`hasPermission("canAssignShifts")`
   to see/use it; visible read-only to nobody without that permission,
   consistent with existing admin sections).
3. Employee integration: replace `admin.js`'s `.shiftAssignRow`
   per-employee dropdown (shift1/2/3) with a display of the employee's
   resolved shift (from the new system) — actual assignment now
   happens from the *shift's* Assigned Employees multi-select, not a
   per-employee picker (matches the requirement's data model: shifts
   own their employee list).
4. Replace `checkLateness` / `getExpectedShiftStart` / `scanForAlerts`
   consumers (`status.js`, `timers.js`, `feedback.js`, `reports.js`,
   `monthlystats.js`, `workspace.js` — need a full grep pass) to use
   `getEmployeeAssignedShift` + `getShiftExpectedStartEpoch` /
   `isNowWithinShift` instead of `window.SHIFT_CYCLES` /
   `user.assignedShift`.
5. Login-time resolution: hook into `auth.js`'s post-login flow to
   resolve+cache the logged-in user's shift immediately (dashboards /
   countdowns need it right away, not just on the next Firestore
   round-trip).
6. Remove/retire the old hardcoded `SHIFT_SCHEDULES`, `#shiftTimezoneSelect`
   card, `system/shiftConfig`, `assignEmployeeShift`, once nothing
   references them (keep `shifts.js`'s off-day / lateness-grace /
   alert-threshold constants and helpers — those are still needed and
   are orthogonal to which shift-definition engine is active).
7. `firestore.rules` — add explicit permanent rule for the new
   `shifts` collection (same open-rule pattern as `violationLogs` /
   `system`, since there's no Firebase Auth in this app).
8. Update `RELEASE_NOTES.md`.

---

## 5. Progress log

### Step 1 — Data layer (this session)
- **Status: DONE**
- Added `shiftmanagement.js` (new file) implementing everything listed
  in section 3 above.
- Registered `<script defer src="shiftmanagement.js"></script>` in
  `index.html` immediately after `shifts.js`.
- Added `window.initShiftManagement()` call in `app.js` next to the
  existing `window.initShiftConfig?.()` call.
- Added a permanent `match /shifts/{shiftId} { allow read, write: if true; }`
  rule to `firestore.rules` (same pattern as `violationLogs`/`system`).
- Verified no naming collisions with the existing `shifts.js` globals
  (grepped first).
- **Not yet done / does nothing visible to the user yet** — no UI, no
  admin panel entry point, old hardcoded system is still what's
  actually driving lateness/dashboards/etc. This is intentional per
  the incremental-steps instruction.

### Step 2 — Owner Panel UI (Create/Edit/List)
- **Status: DONE** (found already fully implemented on resuming this
  session — this log entry just hadn't been updated after the work).
  Verified present: `shiftManagementSection` card + `shiftMgmtList` in
  `index.html` (admin panel), `#shiftMgmtModal` Create/Edit modal
  (name, start/end time, timezone select, employee search + multi-
  select checkbox grid, enabled toggle) in `index.html`, and the full
  UI layer in `shiftmanagement.js` (`renderShiftManagementUI`,
  `openShiftMgmtModal` / `closeShiftMgmtModal` / `saveShiftMgmtModal`,
  `renderShiftMgmtEmployeeGrid` + search filter, card list with
  View/Edit/Enable-Disable/Delete, `initShiftManagementUI` gated on
  `hasAdminAccess()`). i18n (`data-en`/`data-ar`) present throughout.

### Step 3 — Employee integration (assignment display, replace old dropdown)
- **Status: IN PROGRESS (first portion done this session)**
- Replaced `admin.js`'s old `.shiftAssignRow` shift1/2/3 `<select>`
  (per-employee card, `onchange="assignEmployeeShift(...)"`) with a
  **read-only display** of the employee's shift as resolved by the new
  system: `window.getEmployeeAssignedShift(id)` → shows
  `Name (start–end Zone)` + a "Disabled" badge if the shift is
  disabled, or "Unassigned" (styled muted/italic) if no shift claims
  them. Matches the requirement's data model — assignment now happens
  from the *shift's* Assigned Employees multi-select (Shift Management
  UI), not a per-employee picker.
- Extracted the `db.collection("users").onSnapshot(...)` callback body
  in `initializeAdmin()` (admin.js) into a named `renderAdminUserList(snapshot)`
  function, cached the latest snapshot on `window._lastAdminUsersSnapshot`,
  and added a `document.addEventListener("shiftsChanged", ...)` listener
  that re-renders the admin user list from that cached snapshot. Needed
  because editing/reassigning a shift in the new system doesn't touch
  any `users/{id}` doc, so without this the resolved-shift line on each
  card would go stale until an unrelated `users` snapshot fired.
  (`shiftmanagement.js` already dispatched `shiftsChanged` as a
  CustomEvent from Step 1 — confirmed, not newly added.)
- Added `.shiftResolvedDisplay` / `.shiftResolvedDisplay.shiftUnassigned`
  CSS in `style.css`, next to the pre-existing `.shiftAssignRow` rules.
  Left `.shiftAssignRow select` CSS in place (harmless/unused by this
  card now, but not touching per "avoid unrelated refactors").
- `window.assignEmployeeShift` (old system, `shifts.js`) is untouched
  and still defined — just no longer called from this card. Grepped,
  confirmed no other remaining call sites.
- **Not yet done in Step 3** (remaining sub-items from migration plan
  item 3 / open question in section 6):
  - The Add Employee form's old `#newEmpShift` dropdown (`index.html`)
    is untouched — still belongs to the old system, out of scope for
    *this* portion (it's a creation-time picker, not a live display;
    revisit when retiring the old system in Step 6, or sooner if the
    user wants it hidden/relabeled now).
  - Auto-migration of `user.assignedShift` (shift1/2/3) into starter
    `shifts` docs — **decided against**, see resolved item in section 6.
    Not doing this; no code needed here.

### Step 4 — Attendance/lateness/alerts engine cutover
- **Status: IN PROGRESS (core engine + its one live caller done this
  session)**
- Full grep pass done for all consumers of the old engine
  (`SHIFT_CYCLES` / `assignedShift` / `getExpectedShiftStart` /
  `checkLateness` / `scanForAlerts`): `admin-extras.js`, `app.js`,
  `feedback.js`, `reports.js`, `shiftmanagement.js` (new system, not a
  consumer), `shifts.js` (the engine itself), `status.js`,
  `violations.js` (comment only, no code), `workspace.js`.
- **Cut over this session** (`shifts.js`):
  - `window.checkLateness` — signature changed from
    `(shiftKey, actualStartTime, user)` to
    `(userId, actualStartTime, user)`; now resolves the shift itself
    via `window.getEmployeeAssignedShift(userId)` instead of taking a
    shift1/2/3 key. Disabled shifts now correctly mean "not currently
    assigned" for lateness purposes (`shift.enabled === false` → not
    assigned), which the old system had no concept of.
  - `window.scanForAlerts`'s live "hasn't clocked in yet" detection —
    resolves via `getEmployeeAssignedShift` +
    `getShiftExpectedStartEpoch` / `getShiftExpectedEndEpoch` instead
    of `u.assignedShift` + `SHIFT_CYCLES`. The old hardcoded "9 hours"
    self-clearing window is now the shift's *actual* configured
    duration (any length, overnight-wrap correct), computed from the
    real expected-end epoch instead of a fixed constant.
  - `scanForAlerts`'s persisted `lastLateClockIn` fallback branch's
    `shiftLabel` — now `getEmployeeAssignedShift(u.id)?.name` instead
    of the old `SHIFT_CYCLES[...].label` lookup.
- **Cut over this session** (`status.js`): the one and only caller of
  `checkLateness` (in the clock-in "FIRST TIME START ONLY" block) now
  passes `RelayDesk.currentUser` (userId) instead of the old
  `assignedShift` key. The old `assignedShift` field is still read and
  written into the `shiftHistory` doc alongside this for historical
  record-keeping — that's a data field, not a behavior, so left as-is
  (not in scope for this cutover).
- `admin-extras.js`'s alerts panel needed **no changes** — it only
  calls `window.scanForAlerts(users)`, same signature/return shape as
  before, so it picks up the new resolution automatically.
- Verified: `grep` for `checkLateness(` now shows exactly one call
  site (the updated one in `status.js`), no stale callers left.
- **Deliberately NOT touched this session** (belongs to Step 5 per the
  tracker's own step split — "dashboards/countdowns/reports/stats
  integration"): `reports.js` (`window.getExpectedShiftStart` +
  `assignedShift` for the report's lateness column), `feedback.js`
  (shift label shown on submitted feedback), `workspace.js`
  (dashboard shift-countdown display, `window.SHIFT_CYCLES` lookup).
  `window.getExpectedShiftStart` (old, shiftKey-based) itself is
  therefore still defined and still used by `reports.js` until that
  cutover happens.
- `RelayDesk.shiftEndTime = now + 9*60*60*1000` / `overtimeBaseline`
  in `status.js` (hardcoded 9hr assumption for countdown/overtime
  math) intentionally **not touched** — that's Step 5 territory
  (dashboards/countdowns), not the lateness *check* itself.

### Step 5 — Login-time resolution + dashboards/countdowns/reports/stats integration
- **Status: DONE**
- Added `resolveCurrentUserShift()` in `auth.js`: resolves and caches
  the logged-in employee's shift on `RelayDesk.currentUserShift` via
  `window.getEmployeeAssignedShift(RelayDesk.currentUser)`. A000 (no
  dashboard) always resolves to `null`.
  - Called once from `startSession()` immediately after
    `RelayDesk.currentUserData` is set, so everything later in that
    same function (and everything after) can read
    `RelayDesk.currentUserShift` synchronously — no Firestore
    round-trip needed at the point of use.
  - Also re-called on every `shiftsChanged` event (the CustomEvent
    `shiftmanagement.js` already dispatches on any `shifts` doc
    change — see Step 1). This is the key piece: shift *assignment*
    lives on the shift doc's `assignedEmployees`, not on the
    employee's own `users/{id}` doc, so moving someone to a different
    shift (or renaming/retiming/retimezoning/enabling/disabling their
    current one) never fires their `users` doc's `onSnapshot` —
    without this listener their cached shift would go stale until
    their next unrelated user-doc change. Same pattern already used
    for the admin panel in `admin.js` (Step 3).
  - Also incidentally covers the unlikely race where
    `window.SHIFTS_LIST` hasn't finished its first Firestore load yet
    at the exact instant of login (`initShiftManagement()` is started
    at app boot in `app.js`, independent of login, so in practice this
    will essentially always have already fired by login time — but
    the `shiftsChanged` re-resolve is a correctness backstop either
    way, not something to rely on for the common case).
  - Dispatches its own `currentUserShiftResolved` CustomEvent
    (`detail: { shift }`) so dashboard/countdown UI (next portions of
    Step 5) can react without polling — same idiom as
    `renderShiftManagementUI?.()` in Step 1/3.
  - No cleanup needed on logout: `window.relayLogout()` does a full
    `location.reload()`, which resets all JS state including this
    cache — confirmed, not adding redundant manual clearing.
- **Cut over this session** (dynamic shift duration — no more hardcoded
  9 hours):
  - Added `window.getShiftDurationMs(shift)` to `shiftmanagement.js` —
    factored out of `getShiftExpectedEndEpoch` (which now calls it
    too, behavior unchanged there) so any consumer needing a shift's
    raw duration (overnight-wrap aware) has one shared, correct
    implementation instead of each file recalculating it.
  - `status.js` clock-in block (`newStatus === "On Duty"`, first-time
    start): `RelayDesk.shiftEndTime` is now
    `now + getShiftDurationMs(RelayDesk.currentUserShift)` instead of
    hardcoded `now + 9hrs`. Falls back to the old 9-hour default only
    if the employee has no resolved shift yet (keeps clock-in from
    breaking for anyone not yet assigned in the new system).
    `RelayDesk.overtimeBaseline` needed no direct change — it already
    derives from `shiftEndTime`, so it's dynamic for free.
  - `status.js` End Shift finalizer: the `endedEarly` metric compared
    against a hardcoded `shiftStart + 9hrs`; now captures the real
    *scheduled* end (`scheduledShiftEndForCalc`, grabbed right before
    `shiftEndTime` gets overwritten to the actual end timestamp — same
    "capture before overwrite" pattern already used for
    `overtimeBaselineForCalc` just above it) and compares against that
    instead.
  - `workspace.js`'s `getAssignedShiftTimes()` (feeds the
    `{{shiftStart}}`/`{{shiftEnd}}` placeholders in report templates)
    — now reads `RelayDesk.currentUserShift.startTime`/`.endTime`
    directly instead of the old cycle's `startHour`/`startMinute` +
    hardcoded `+9hrs` for the end. A shift configured 4:00–9:00 now
    correctly shows start "4:00 AM" / end "9:00 AM" (its own real end
    time), not start+9hrs.
  - The live on-dashboard countdown itself (`#shiftCountdown` /
    `updateShiftCountdown()` in `workspace.js`) needed **no changes**
    — it already just reads `RelayDesk.shiftEndTime` and counts down to
    it, so it automatically benefits from the `status.js` fix above.
    Verified no other hardcoded-9hr spot feeds it (`presence.js`'s
    relogin restore just reads back the already-computed
    `shiftEndTime` from Firestore, doesn't recompute it).
  - Swept the whole codebase for any other `9 * 60 * 60 * 1000` /
    `32400000` — only the one intentional no-shift-assigned fallback
    in `status.js` remains.
- **Cut over this session** (`reports.js`, `feedback.js` — final two
  consumers from the Step 4 grep pass):
  - `reports.js`'s `buildReport()` lateness column: now resolves via
    `window.getEmployeeAssignedShift(s.user)` +
    `window.getShiftExpectedStartEpoch(...)` instead of the employee's
    old `assignedShift` field + `SHIFT_CYCLES`/`getExpectedShiftStart`.
    Dropped the now-unused `employees.find(...)` lookup that only
    existed to get at the old field. Header comment above it updated
    to describe the new source of truth.
  - `feedback.js`'s `getSubmitterMetadata()`: `shiftLabel` now
    resolved via `window.getEmployeeAssignedShift(code)` (reads the
    already-live `window.SHIFTS_LIST` cache — no extra Firestore read
    needed) instead of a dedicated `assignedShift` field read +
    `SHIFT_CYCLES` lookup. `permissionLevel` still comes from the
    per-submission `users/{code}` doc read, unchanged.
  - Double-checked `monthlystats.js` per the flag in the "not yet
    done" list above — confirmed via grep it has **zero** references
    to `SHIFT_CYCLES` / `assignedShift` / the old engine. Nothing to
    do there.
- **Full codebase sweep** (`SHIFT_CYCLES`, `assignedShift`,
  `getExpectedShiftStart`, `checkLateness`, `scanForAlerts`) — every
  remaining hit is now one of:
  1. The old engine's own definition in `shifts.js` (left fully
     intact per the original Step-1 decision — retirement is Step 6).
  2. Explanatory comments describing what code moved *away from*.
  3. `status.js`'s `shiftHistory` doc write, which still records the
     old `assignedShift` field value alongside the new lateness calc
     — a historical data field, not a behavior; intentionally
     untouched.
  4. `admin-extras.js` (~line 232, 268) — the Add Employee form still
     submits the old `assignedShift` field
     (`#newEmpShift`/`.shiftAssignRow` counterpart for *creating* a
     user, not the per-employee-card display cut over in Step 3).
     This is genuinely still-active old-system code, but it no longer
     drives *any* live calculation — lateness/alerts (Step 4),
     dashboard countdown/overtime (Step 5), reports, and feedback are
     now all fully on `getEmployeeAssignedShift`. Deliberately left
     as-is, same reasoning as the Step 3 note on `#newEmpShift`:
     out of scope until Step 6 (retire old system) unless the user
     wants it hidden/relabeled sooner.
- **Status: DONE.** Every consumer identified in Step 4's grep pass
  (`admin-extras.js`, `feedback.js`, `reports.js`, `status.js`,
  `workspace.js`) is now cut over except the one deliberately-deferred
  Add Employee form item above. Login-time resolution, dynamic
  per-shift countdown/duration, and all report/feedback shift-label
  displays are fully driven by the new system.

### Step 6 — Retire old hardcoded system + cleanup + release notes
- **Status: IN PROGRESS (first portion done this session — old engine
  removed)**
- Grepped the whole codebase first for every old-system symbol
  (`SHIFT_CYCLES`, `SHIFT_SCHEDULES`, `assignedShift`,
  `assignEmployeeShift`, `shiftConfig`, `shiftTimezoneSelect`,
  `getExpectedShiftStart`, `newEmpShift`, `shiftAssignRow`) to confirm
  exactly what was still live vs. already-migrated/comment-only before
  touching anything (see full sweep output — matches Step 4/5 log
  claims, nothing stale left behind by earlier steps).
- **`shifts.js`**: removed `SHIFT_SCHEDULES`, `window.SHIFT_CYCLES`,
  `window.SHIFT_TIMEZONE_OPTIONS`/`_LABELS`,
  `window.ACTIVE_SHIFT_TIMEZONE`, `applyShiftTimezone()`,
  `window.initShiftConfig`, `window.setShiftTimezone`,
  `window.refreshShiftScheduleUI`, `window.assignEmployeeShift`, and
  the old shiftKey-based `window.getExpectedShiftStart` (confirmed via
  grep it had zero remaining call sites — `reports.js`/`shiftmanagement.js`
  hits were comments only). Kept everything still active: `WEEKDAYS`,
  `isOffDayToday`, `renderOffDayCheckboxes`/`readOffDayCheckboxes`,
  `isSameCalendarDay`, `LATE_GRACE_MINUTES`/`BREAK_ALERT_MINUTES`/
  `AWAY_ALERT_MINUTES`, `checkLateness`, `scanForAlerts` (both already
  migrated in Step 4). Rewrote the file header comment and the two
  stale "STEP 4 CUTOVER" comments that referenced now-deleted symbols.
- **`app.js`**: removed the `window.initShiftConfig?.()` boot call and
  its comment block; reworded the `initShiftManagement?.()` comment
  since it no longer needs to describe running "alongside" the legacy
  listener.
- **`admin.js`**: removed the `#shiftTimezoneSelect` enable/disable +
  `refreshShiftScheduleUI?.()` block from `initializeAdmin()`.
- **`index.html`**: removed the "🌐 Shift Schedule" timezone-picker
  card (admin panel aside) and the Add Employee form's `#newEmpShift`
  shift1/2/3 `<select>` (the deferred item flagged back in Step 3 —
  assignment now only happens from the shift's own Assigned Employees
  multi-select, so a creation-time picker no longer makes sense).
- **`admin-extras.js`**: removed the `#newEmpShift` read and
  `assignedShift` local var from the Add Employee submit handler, and
  dropped the now-undefined `assignedShift` field from the new
  employee doc write (new employees are created "Unassigned" and get
  assigned via the Shift Management UI afterward — consistent with the
  "no auto-migration" decision in section 6).
- **`style.css`**: removed the now-dead `.shiftAssignRow select` rule
  (styled the deleted per-employee dropdown; `.shiftAssignRow` itself
  is kept — Step 3's read-only display still uses that container
  class) and the orphaned `.shiftScheduleCard` grid-placement rules
  (both the desktop 2-column layout and the responsive stacking/order
  rules), re-pinning `.alertsCard` into the row the timezone card
  vacated so the admin panel layout doesn't leave a gap.
- **Deliberately NOT touched** (per the tracker's own prior explicit
  decision, re-confirmed this session — this is a historical-record
  field, not old-engine *behavior*, so touching it would be an
  unrelated data-schema change out of this step's scope):
  `status.js`'s `shiftHistory` doc write still reads/stamps
  `RelayDesk.currentUserData?.assignedShift`. Now that nothing writes
  that field anymore (old `assignEmployeeShift` removed, Add Employee
  form no longer sets it), this will simply always be `null` for any
  employee created from here on — harmless, but flagging it as a
  candidate for the user to decide on later (see open item below).
- Verified: full re-grep after all edits shows zero live-code
  references to any removed symbol anywhere in the codebase — every
  remaining hit is an explanatory comment in an already-migrated file
  (`shiftmanagement.js`, `reports.js`, `workspace.js`, `feedback.js`,
  and this file's own new header). `node --check` passed clean on all
  four edited `.js` files.
- **Still remaining for Step 6** (not done yet — next portion(s)):
  - ~~`firestore.rules` — no action actually needed...~~
  - ~~`RELEASE_NOTES.md` update~~ — **DONE this session**, see below.
  - ~~Manual smoke test~~ — **DONE this session**, see below.
- **`RELEASE_NOTES.md`** — replaced the stale leftover `4.0.6 -> 4.0.7`
  staging entry (an already-shipped, unrelated modal-stacking bug fix
  that had never been cleared after its own release) with fresh notes
  for `4.1.2 -> 4.1.3` covering the whole Shift Management rollout:
  New Features (configurable shifts, automatic resolution everywhere,
  the new Owner-tier create/delete restriction), Improvements
  (live-resolved shift display on employee cards, dynamic
  duration-aware lateness/countdown/overtime), and Removed (old
  fixed 3-shift system). Version numbers taken from `package.json`
  (currently `4.1.2`) and this project's own working filename
  (`v4_1_3`) — actual version bump at release time is handled by
  `npm run release:patch` (`scripts/release.js`), not this file;
  this file is just the staging changelog text that gets pasted in
  before running that script, per its own header comment. Preserved
  the file's exact existing format/heading style (`#####`/`######`
  spacer lines, `•` bullets) and its CRLF line endings.
- **Manual smoke test** (static/code-level, this session — no live
  Firestore/Electron instance available in this environment, so this
  is a thorough read-through + cross-reference pass, not a running
  click-through):
  - Confirmed zero remaining references anywhere in the codebase to
    any removed symbol (`SHIFT_CYCLES`, `SHIFT_SCHEDULES`,
    `shiftTimezoneSelect`, `assignEmployeeShift`, `initShiftConfig`,
    `setShiftTimezone`, `refreshShiftScheduleUI`) outside of
    already-migrated files' explanatory comments.
  - Confirmed no code still calls `getElementById("shiftTimezoneSelect")`
    or `getElementById("newEmpShift")` — both elements were removed
    from `index.html` and nothing dereferences them anymore (would
    have just silently no-op'd via optional chaining even if
    something had, but confirmed clean regardless).
  - Confirmed `index.html` tag balance around both removed blocks
    (`<aside>`/`<select>`/`<section>` counts all balanced) and that
    `.adminButtons`/`shiftMgmtCardButtons` template literals in
    `admin.js`/`shiftmanagement.js` are still well-formed after the
    Owner-gate split (no stray backticks/parens).
  - Confirmed script load order in `index.html` still has
    `permissions.js` (defines `isOwnerOrAbove`) loading before
    `shiftmanagement.js` and `admin.js`/`admin-extras.js` (both now
    call it) — `defer` means all of these execute in this same
    document order regardless, so no runtime "used before defined"
    risk.
  - `node --check` clean on all six files touched this session
    (`shifts.js`, `app.js`, `admin.js`, `admin-extras.js`,
    `permissions.js`, `shiftmanagement.js`).
  - **Not verified** (needs an actual running instance / Firestore):
    live click-through of Add Employee (Owner+A000 gate on the button
    itself + the account-deletion Delete button), Shift Management
    Create/Edit/Delete/Enable-Disable buttons showing/hiding correctly
    per role, and the admin panel grid layout with the Shift Schedule
    card gone (alerts card should sit directly under the main card
    now, both desktop 2-column and mobile stacked layouts). Recommend
    the user do a real click-through before shipping 4.1.3.
- **Status: DONE.** Old hardcoded engine fully retired, release notes
  written, static smoke-test pass complete. Feature is otherwise
  code-complete; only a live click-through remains before release.

---

## 6b. Bug found during user's manual click-through, fixed (resolved)

- User did the live click-through recommended at the end of Step 6.
  **Confirmed working:** admin panel layout (alerts card sitting
  correctly where the old Shift Schedule card was), and role-based
  button show/hide in general.
- **Found broken:** Supervisor role was missing the "Reset PIN"
  button (and, same root cause, also "Reset" and "🔑 Permissions" —
  all three are gated on the single `canManageEmployees` key in
  `admin.js`'s `.adminButtons` block).
- **Root cause:** `permissions.js`'s `PERMISSION_PRESETS.Supervisor`
  was missing `canManageEmployees: true`. Not something touched by
  this feature's own edits (grep-confirmed no shift-management code
  writes to `PERMISSION_PRESETS`) — pre-existing gap in the preset,
  just surfaced now during this feature's live click-through.
- **Fix:** added `canManageEmployees: true` back to the `Supervisor`
  preset in `permissions.js`. One-line change, verified via diff
  against the uploaded zip that nothing else changed.
- Verified scope of `canManageEmployees` usage app-wide (grep) before
  fixing, to confirm this key only gates Reset/Reset PIN/Permissions-
  editor/freeze-unfreeze/announcement-delete — nothing Owner-tier
  (those all use the separate `isOwnerOrAbove()` gate), so restoring
  it for Supervisor doesn't grant anything beyond the documented
  "Everything else... stays exactly as-is on the regular permission-
  key gates" decision in section 6.
- `node --check permissions.js` passed clean.
- **Status: DONE.**

---

## 7. Post-release: unrelated bugfixes done in this codebase (for context)

While the Shift Management feature itself is code-complete (see Step 6
and 6b above), three small unrelated bugs were fixed in the same
working session, in `workspace.js` and `electron/main.js`. None touch
shifts/permissions — noted here only so a future session isn't
surprised by diffs in those files that aren't part of this feature.
Full detail lives in `BUGFIXES.md` (shipped alongside this tracker):

1. **EoS Report — Trip stops appeared above the load line instead of
   in the From/To field.** `formatLoadsForTemplate()`'s `formatLine()`
   now puts a Trip load's stops (when "Show these stops in the
   End-of-Shift Report" is on) directly in the same field/position
   From → To occupies on that load's own line, instead of a separate
   `🛑 Stops (VRID ...)` block floating above the whole VRID group's
   header line.
2. **Add Load modal — date didn't default to today.** `openLoadModal()`
   now pre-fills a brand-new load's date with today's date (same
   `new Date().toISOString().split("T")[0]` idiom already used by the
   Report Generator's date picker), fully editable for loads booked a
   few days out. Editing an existing load still shows its saved date,
   untouched.
3. **Single-instance lock — reopening from the launch shortcut while
   minimized to tray opened an unresponsive window.** Classic Electron
   race: the losing process's `app.quit()` is async and didn't stop the
   file's unconditional `app.whenReady().then(() => createWindow())`
   from still firing in that same, already-quitting process — creating
   a real but never-interactive phantom window on top of the correctly
   restored real one. Fixed by using `app.exit(0)` instead, which exits
   immediately/synchronously so `whenReady()` never gets a chance to
   fire there. (Also flagged: a stale, unused duplicate `main.js` at
   the project root, unrelated to this fix and left untouched —
   `package.json`'s `"main"` points at `electron/main.js`, the file
   actually in use and actually fixed.)

All three verified via `node --check` on the edited file and a scoped
diff against the previous zip confirming no unrelated lines changed.

---

## 8. In-app Admin Guide updated to match this feature

`adminguide.js` (the built-in, in-app Admin Guide accessible from the
app itself — separate from this markdown tracker, which developers
use across sessions) was out of date: its shift section still fully
described the old per-employee dropdown/3-cycle system, and nothing
in it mentioned the new Owner-tier gate. Updated, `{en, ar}` bilingual
throughout (matches the file's existing content shape):

- **`shift-assignment` section replaced wholesale** with a new
  `shift-management` section covering: what the Shift Management card
  is and what replaced it; the Owner-tier split (create/delete a shift
  = Owner/A000 only, vs. edit/enable-disable = `canAssignShifts`, vs.
  View Assigned Employees = anyone with panel access); every shift
  field (Name, Start/End Time, Time Zone, Assigned Employees, Enabled
  toggle); assignment now happening from the shift's own multi-select
  instead of a per-employee dropdown; the one-shift-per-employee
  enforcement; overlapping shifts; overnight-shift support; IANA/DST-
  correct time zone storage and its continued editability; automatic
  resolution everywhere (login, attendance, countdown, dashboard,
  reports, stats); real-time sync; disable-vs-delete distinction; and
  new employees starting Unassigned.
- **`permissions` section**: added the Owner-tier explanation (which
  four actions sit above the normal permission toggles and why), plus
  clarified exactly what `canManageEmployees` and `canAssignShifts`
  each do and don't cover now.
- **`user-management` section**: added that account creation/deletion
  are Owner-tier, not `canManageEmployees`; removed the now-inaccurate
  implication of picking an initial shift on the Add Employee form
  (replaced with "starts Unassigned, assign afterward from Shift
  Management").
- **`admin-buttons` section**: added entries for the Shift Management
  card's ➕ New Shift / ✏️ Edit / ✅ Enable / 🚫 Disable / 👥 View
  Assigned Employees / 🗑 Delete buttons (each tagged with which gate
  it needs), plus previously-undocumented user-card Reset / Reset PIN
  / 🔑 Permissions / Delete buttons and their gates — ties directly
  into the section 6b Supervisor fix, so an admin reading the guide
  now sees exactly why those three buttons need `canManageEmployees`.
- Left the pre-existing "🔁 Refresh Shifts" / "📅 Shift history
  buttons" bullets untouched — those describe the separate
  `shiftHistory` work-session log feature, not shift *definitions*,
  and were never part of the old hardcoded engine this feature
  replaced.
- `node --check adminguide.js` passed clean; verified no duplicate/
  broken section ids and no leftover reference to the old
  `shift-assignment` id anywhere in the codebase.

---

## 6a. Open item raised while doing Step 6 (resolved)

- `status.js`'s `shiftHistory` write still has an `assignedShift`
  field that will now permanently be `null` for every employee (see
  Step 6 log above). **RESOLVED: leave it in, untouched.** User's
  call: doesn't hurt anything sitting there unused, and past
  experience on another feature was that a field like this ended up
  needed again later by an unrelated bug fix/feature after being
  removed. No code changed for this.

---

## 6. Open questions / decisions to confirm with user later (non-blocking)

~~- Should non-A000 users with `canAssignShifts` (Supervisor/Admin
  presets) also get full shift Create/Edit/Delete rights, or should
  Delete be Owner-only?~~ — **RESOLVED.** User's call: account
  creation, account deletion, shift creation, and shift deletion are
  Owner+A000 only (`window.isOwnerOrAbove()`, new helper in
  `permissions.js`). Everything else (shift edit, shift enable/
  disable, and all existing `canManageEmployees` actions — reset user,
  reset PIN, permissions editor, freeze/unfreeze) stays exactly as-is
  on the regular permission-key gates. Implemented this session:
  - `permissions.js`: added `window.isOwnerOrAbove(userId?)` (A000 or
    `permissionLevel === "Owner"`), refactored `canCreateEmployeeAccounts`
    to call it (same logic, now single-sourced) instead of duplicating
    the A000/Owner check inline.
  - `admin.js`: `deleteUser` now gated on `isOwnerOrAbove()` instead of
    `canManageEmployees`. Split the user card's Delete button out of
    the `canManageEmployees` button bundle into its own
    `isOwnerOrAbove()`-gated block (Reset/Reset PIN/Permissions stay
    under `canManageEmployees`, unchanged).
  - `shiftmanagement.js`: `saveShift` now branches on `isNew` —
    creating a shift requires `isOwnerOrAbove()`, updating an existing
    one still requires `canAssignShifts` (unchanged). Same split
    applied to `openShiftMgmtModal`'s guard (branches on whether
    `shiftId` was passed) so the modal itself refuses to open for the
    wrong action, not just the eventual save. `deleteShiftById` now
    gated on `isOwnerOrAbove()`. `renderShiftManagementUI`: the "Add
    Shift" button and each card's "Delete" button now check
    `isOwnerOrAbove()`; "Edit" and "Enable/Disable" buttons still
    check `canAssignShifts`, unchanged. `setShiftEnabledState`
    deliberately left untouched (enable/disable isn't create/delete).
  - Account *creation* gating (`canCreateEmployeeAccounts`) needed no
    behavior change — it was already Owner+A000-only from Phase 9; only
    refactored to share the new helper.
  - `node --check` passed clean on all three edited files.
- ~~Whether to auto-migrate existing `user.assignedShift` (shift1/2/3)
  values into a starter set of 3 real `shifts` docs during Step 2/3~~ —
  **RESOLVED: NO.** User's call: still in dev phase, app not yet
  adapted into real-world use, so it's fine for everyone to become
  "Unassigned" once the old system is retired — shifts will be rebuilt
  manually via the new UI later. No migration code will be written.
