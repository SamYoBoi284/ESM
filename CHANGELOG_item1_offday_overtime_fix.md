# RelayDesk Changelog — Phase 1, Item 1 (follow-up fix): Off-Day Overtime Ghost Entry

**File touched:** `status.js`

## BUG
On an off-day shift, the analytics/history showed TWO overtime
entries instead of one:
  - `00:06:28` (correct — automatic off-day overtime log)
  - `Approved (not yet worked)` (bug — stuck forever)

## ROOT CAUSE
`admin-extras.js`'s `approveOvertimeRequest()` pushes a
`{ pending: true, durationMs: 0 }` placeholder into the user's
`overtimeHistory` the moment an admin approves a manual overtime
request, expecting it to get reconciled once the employee presses
End Shift. But `status.js`'s reconciliation block is intentionally
skipped for off-day shifts (`if (!wasOffDayShift)` — correct, since
an off-day shift has no "scheduled 9hr end" to measure a request
against). Net effect: if a request is ever approved for a user whose
shift turns out to be an off-day shift, the placeholder has no code
path that ever resolves it — permanent ghost entry.

## FIX
Added a cleanup step inside the existing off-day branch in
`status.js`'s End Shift handler: when an off-day shift ends, it now
also finds any of that user's still-`"approved"` overtime requests,
marks them `"completed"` (0 extra duration — the off-day auto-log
already covers the full shift, so this avoids double-crediting), and
removes the matching `pending` placeholder(s) from `overtimeHistory`
entirely (not reconciled to `00:00:00` — that'd just be a confusing
duplicate line next to the real off-day entry).

New audit action: `OVERTIME_REQUEST_SUPERSEDED`

## ASSUMPTION TO CONFIRM
Dropped the placeholder entirely instead of keeping a `00:00:00` /
"superseded" line visible in history. Say the word if you'd rather
it stay visible with a note instead of disappearing.
