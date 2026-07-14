## \# ESM (Employee Status Monitor) Version 4.3.0 — Changelog

## 

## \## Major Fixes \& Improvements

## 

## \### Admin User Drilldown — Live Timer Synchronization

## 

## \*\*Files:\*\* `admin.js`, `style.css`

## 

## \* Reworked Admin Panel user drilldowns from a one-time fetch into a live synced view.

## \* Added a scoped Firestore listener for the selected employee:

## 

## &#x20; \* Updates status and timer information in real time.

## &#x20; \* Cleans up listeners when closing the drilldown or switching users.

## \* Added local timer ticking using the same calculation logic as the employee dashboard.

## \* Admins can now see live Work / Break / Away timers instead of waiting for shift completion.

## 

## \---

## 

## \## Shift Auto-End \& Overtime Flow Redesign

## 

## \### Automatic Shift Finalization

## 

## \*\*Files:\*\* `workspace.js`, `status.js`

## 

## \* Fixed the issue where reaching `00:00:00` only created an audit entry while the employee remained active.

## \* Shift expiration now:

## 

## &#x20; \* Finalizes the shift.

## &#x20; \* Writes shift data into `shiftHistory`.

## &#x20; \* Resets active timers.

## &#x20; \* Clears shift state.

## &#x20; \* Moves the employee into the correct completed state.

## 

## \### Shift End Overtime Prompt

## 

## \* Added a shift-end decision prompt:

## 

## &#x20; \* \*\*Start Overtime\*\*

## &#x20; \* \*\*No, I'm done for today\*\*

## \* Added timeout handling:

## 

## &#x20; \* No response automatically completes the shift safely.

## \* Reuses the same overtime start path as manual overtime.

## 

## \---

## 

## \# Manual Overtime System Rewrite

## 

## \## Overtime Timer Gating

## 

## \*\*Files:\*\* `timers.js`, `status.js`, `overtime.js`, `index.html`

## 

## \* Removed normal-shift automatic overtime starting behavior.

## 

## \* Normal scheduled shifts now require an explicit \*\*Start Overtime\*\* action.

## 

## \* Added:

## 

## &#x20; \* `overtimeStarted`

## &#x20; \* `overtimeStartedAt`

## 

## \* Overtime timer now starts only after manual activation.

## 

## \### Off-Day Exception Preserved

## 

## \* Off-day shifts continue using the existing automatic overtime behavior.

## \* No changes were made to the off-day overtime model.

## 

## \---

## 

## \## Start Overtime Button

## 

## \*\*Files:\*\* `index.html`, `overtime.js`, `status.js`, `timers.js`

## 

## \* Added a dedicated Start Overtime button.

## \* Button remains visible but disabled until overtime can actually begin.

## \* Connected it to the same overtime session logic used by the shift-end prompt.

## \* Prevented duplicate overtime sessions and invalid starts.

## 

## \---

## 

## \# Overtime Safety \& Session Protection

## 

## \## Abandoned Overtime Auto-Clear

## 

## \*\*File:\*\* `activitydetection.js`

## 

## Added a safety system for abandoned overtime sessions.

## 

## Behavior:

## 

## \* If overtime starts but:

## 

## &#x20; \* No overtime request was submitted.

## &#x20; \* End Shift never happens.

## &#x20; \* 9 hours pass.

## 

## The system:

## 

## \* Clears the overtime timer.

## \* Resets overtime session fields.

## \* Logs the cleanup event.

## \* Does not modify requests or history.

## 

## Additional fix:

## 

## \* Kept the safety check running even when idle detection is disabled.

## 

## \---

## 

## \# Shift History / Overtime Recording Fixes

## 

## \## Manual Overtime End Shift Bug Fix

## 

## \*\*File:\*\* `status.js`

## 

## Fixed an issue where manual overtime sessions were not reaching `shiftHistory`.

## 

## Before:

## 

## \* Ending overtime could attempt to write using a missing `shiftId`.

## \* Duration calculations could become invalid.

## \* Approved overtime could fail to record.

## 

## After:

## 

## \* Manual overtime restores the correct shift reference.

## \* Base shift history is protected from invalid overwrites.

## \* Approved overtime correctly attaches to the original shift.

## \* Multiple overtime sessions accumulate safely.

## 

## \---

## 

## \# Overtime Approval Workflow Fix

## 

## \*\*Files:\*\* `status.js`, `admin-extras.js`, `admin.js`

## 

## \## Problem

## 

## The previous flow required admin approval before recording worked overtime.

## 

## This caused:

## 

## \* Employees requesting overtime then ending their shift before approval to lose recorded hours.

## \* Old approved requests potentially being incorrectly reused.

## \* Review status being mixed with work tracking.

## 

## \## Changes

## 

## \### `status.js`

## 

## \* End Shift now records worked overtime regardless of approval state.

## \* Overtime matching is scoped to the correct session:

## 

## &#x20; \* Uses shift ID.

## &#x20; \* Uses overtime start time.

## \* Prevents duplicate recording using `overtimeWorkRecorded`.

## \* Stores review status:

## 

## &#x20; \* Pending

## &#x20; \* Approved

## &#x20; \* Denied

## 

## Applied to:

## 

## \* `shiftHistory`

## \* `overtimeHistory`

## 

## \### `admin-extras.js`

## 

## \* Approval/denial no longer controls whether hours exist.

## \* Admin actions now only update review status.

## \* Denying overtime does not erase recorded work history.

## 

## \### `admin.js`

## 

## \* Updated drilldown overtime display.

## \* Shows:

## 

## &#x20; \* Recorded duration.

## &#x20; \* Review status badge.

## \* Removed misleading "Approved but not worked" placeholder behavior.

## 

## \---

## 

## \# Presence Restore Protection

## 

## \*\*File:\*\* `presence.js`

## 

## Fixed stale session restoration causing huge timer values.

## 

## Before:

## 

## \* Reconnecting after crashes or lost connections could restore yesterday's shift data.

## \* Employees could appear active for 50+ hours.

## 

## After:

## 

## \* Restore checks whether shift data belongs to the current day.

## \* Previous-day sessions are treated as abandoned.

## \* Automatically resets:

## 

## &#x20; \* Timers.

## &#x20; \* Shift fields.

## &#x20; \* Overtime state.

## &#x20; \* Status.

## 

## Added:

## 

## \* Race protection for Firestore snapshot updates.

## \* Persistent cleanup so stale sessions do not return.

## 

## \---

## 

## \# Overall Result

## 

## ESM now has:

## 

## ✅ Live admin monitoring

## ✅ Proper shift auto-finalization

## ✅ Manual overtime activation

## ✅ Protected off-day overtime behavior

## ✅ Abandoned overtime cleanup

## ✅ Correct overtime recording lifecycle

## ✅ Approval/review separation

## ✅ Multi-session overtime protection

## ✅ Stale session prevention

## ✅ Reliable shift history tracking

## 

## All changes preserve existing Firebase structure and avoid unnecessary modifications to unrelated systems.



