// ===========================================
// RelayDesk
// shifts.js
// Lateness/Attendance Helpers (Off-Days, Grace/Alert Thresholds,
// Lateness Check, Alert Scan)
// ===========================================
//
// The old hardcoded 3-cycle-per-timezone engine (SHIFT_SCHEDULES /
// window.SHIFT_CYCLES / shift1-shift2-shift3 / system/shiftConfig)
// that used to live in this file has been retired (Step 6 of the
// Shift Management feature — see SHIFT_MANAGEMENT_CONTEXT_TRACKER.md).
// Shift *definitions* and *assignment* now live entirely in the
// Firestore-backed `shifts` collection, managed via
// shiftmanagement.js's window.getEmployeeAssignedShift /
// window.getShiftExpectedStartEpoch / window.getShiftExpectedEndEpoch
// / window.isNowWithinShift. Everything remaining in this file is
// either still-active attendance logic that already consumes that new
// system (checkLateness, scanForAlerts) or orthogonal helpers the new
// system also depends on (weekly off-days, grace/alert-threshold
// constants, same-calendar-day helper) — none of it is specific to
// the old fixed-cycle model.

// Grace period before a late clock-in is actually flagged
window.LATE_GRACE_MINUTES = 10;

// Break threshold — cross this and it's flagged as "too much break"
// (employee gets a toast, admin sees it in the Alerts panel)
window.BREAK_ALERT_MINUTES = 30;

// Away threshold — cross this and it's flagged as "extended away"
window.AWAY_ALERT_MINUTES = 45;


// ===========================================
// WEEKLY OFF DAYS
// Each employee can have one or more configurable days off
// (users/{code}.weeklyOffDays -> ["saturday", "sunday"]).
// Attendance evaluation (lateness, idle/away, extended break) must
// skip entirely on an employee's configured off day, otherwise a
// day they're not scheduled to work at all gets counted as many
// hours late.
// ===========================================

window.WEEKDAYS = [
    { key: "monday", label: "Monday", dayIndex: 1 },
    { key: "tuesday", label: "Tuesday", dayIndex: 2 },
    { key: "wednesday", label: "Wednesday", dayIndex: 3 },
    { key: "thursday", label: "Thursday", dayIndex: 4 },
    { key: "friday", label: "Friday", dayIndex: 5 },
    { key: "saturday", label: "Saturday", dayIndex: 6 },
    { key: "sunday", label: "Sunday", dayIndex: 0 }
];

window.isOffDayToday = function (user, referenceTime = Date.now()) {

    const offDays = user?.weeklyOffDays;
    if (!Array.isArray(offDays) || offDays.length === 0) return false;

    const dayIndex = new Date(referenceTime).getDay();
    const match = window.WEEKDAYS.find(d => d.dayIndex === dayIndex);

    return match ? offDays.includes(match.key) : false;
};

// Renders the 7-day checkbox grid into a container element. Used by
// the "Add Employee" form and the Permissions/Edit modal in
// admin-extras.js.
window.renderOffDayCheckboxes = function (container, selected = []) {

    if (!container) return;

    container.innerHTML = window.WEEKDAYS.map(d => `
        <label class="offDayCheckboxLabel">
            <input type="checkbox" class="offDayCheckbox" value="${d.key}"
                ${selected.includes(d.key) ? "checked" : ""}>
            ${d.label}
        </label>
    `).join("");
};

window.readOffDayCheckboxes = function (container) {

    if (!container) return [];

    return Array.from(container.querySelectorAll(".offDayCheckbox:checked"))
        .map(cb => cb.value);
};


// ===========================================
// DAY BOUNDARY HELPER
// (late / extended-break / extended-away alerts should never carry
// over into a new calendar day — everything here is scoped to "today")
// ===========================================

window.isSameCalendarDay = function (tsA, tsB = Date.now()) {
    if (!tsA) return false;
    const a = new Date(tsA);
    const b = new Date(tsB);
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
};


// ===========================================
// LATENESS CHECK
// ===========================================
//
// Resolves the employee's shift via the Shift Management system
// (window.getEmployeeAssignedShift, shiftmanagement.js) — first param
// is `userId`, not a shift key. The old fixed shift1/2/3 engine and
// its shiftKey-based `getExpectedShiftStart` have been fully retired
// (Step 6); every consumer now goes through
// window.getShiftExpectedStartEpoch (shiftmanagement.js) instead.

window.checkLateness = function (userId, actualStartTime = Date.now(), user = null) {

    const shift = window.getEmployeeAssignedShift?.(userId);
    if (!shift || shift.enabled === false) {
        return { assigned: false, late: false };
    }

    if (user && window.isOffDayToday(user, actualStartTime)) {
        return { assigned: true, late: false, offToday: true };
    }

    const expectedStart = window.getShiftExpectedStartEpoch(shift, actualStartTime);
    const graceMs = (window.LATE_GRACE_MINUTES || 10) * 60 * 1000;

    const diff = actualStartTime - expectedStart;

    if (diff <= graceMs) {
        return { assigned: true, late: false, expectedStart, minutesLate: 0 };
    }

    return {
        assigned: true,
        late: true,
        expectedStart,
        minutesLate: Math.round(diff / 60000)
    };
};


// ===========================================
// ADMIN: SCAN FOR LATE / IDLE EMPLOYEES
// (used by the Alerts panel — polls live user snapshot)
// ===========================================

window.scanForAlerts = function (users) {

    const now = Date.now();
    const late = [];
    const idle = [];
    const overBreak = [];

    const IDLE_AWAY_LIMIT_MS = (window.AWAY_ALERT_MINUTES || 45) * 60 * 1000;
    const BREAK_LIMIT_MS = (window.BREAK_ALERT_MINUTES || 30) * 60 * 1000;

    const today = new Date().toISOString().split("T")[0];

    users.forEach(u => {

        if (!u || u.id === "A000") return;

        // ---- WEEKLY OFF DAY ----
        // Completely skip attendance evaluation today — no late flag,
        // no idle/away alert, no extended-break alert — for an employee
        // who isn't scheduled to work at all today.
        if (window.isOffDayToday(u, now)) return;

        let addedLate = false;

        // ---- LATE CLOCK-IN (hasn't started an assigned shift yet) ----
        // Resolved via the Shift Management system
        // (window.getEmployeeAssignedShift, shiftmanagement.js).
        const resolvedShift = window.getEmployeeAssignedShift?.(u.id);

        if (resolvedShift && resolvedShift.enabled !== false) {

            const expected = window.getShiftExpectedStartEpoch(resolvedShift, now);
            const shiftEnd = window.getShiftExpectedEndEpoch(resolvedShift, now);
            const graceMs = (window.LATE_GRACE_MINUTES || 10) * 60 * 1000;

            const stillNotOn =
                !u.status || u.status === "Off Duty";

            // only relevant for the duration of the shift itself — was a
            // hardcoded 9hrs under the old fixed 3-cycle system, now
            // computed per-shift (any length, overnight-wrap aware) so
            // this still naturally self-clears once the shift's expected
            // end passes rather than flashing stale for the rest of the day
            const withinShiftWindow = expected !== null && shiftEnd !== null && now < shiftEnd;

            // ---- ADMIN RESOLUTION (Approve/Deny/Dismiss on the alert itself) ----
            // A "dismissed" alert never resurfaces for the rest of the day.
            // "approved"/"denied" still show (so admin sees what was decided)
            // but come tagged with `resolution` so the panel renders a badge
            // instead of action buttons.
            const lateResolution = (u.lateAlertResolution && u.lateAlertResolution.date === today)
                ? u.lateAlertResolution
                : null;

            if (stillNotOn && withinShiftWindow && (now - expected) > graceMs
                && (!lateResolution || lateResolution.status !== "dismissed")) {

                const dispute = (u.lateDispute && u.lateDispute.date === today)
                    ? u.lateDispute
                    : null;

                late.push({
                    id: u.id,
                    minutesLate: Math.round((now - expected) / 60000),
                    shiftLabel: resolvedShift.name,
                    dispute,
                    resolution: lateResolution
                });

                addedLate = true;
            }
        }

        // ---- LATE CLOCK-IN, PERSISTED FOR THE DAY ----
        // Once the employee actually punches on, `stillNotOn` above goes
        // false and the block above never fires again — without this,
        // the alert disappears the instant they clock in (the
        // lastLateClockIn stamp written in status.js was never actually
        // being read anywhere). This keeps today's late clock-in visible
        // to admin regardless of the employee's current live status.
        if (!addedLate && u.lastLateClockIn && u.lastLateClockIn.date === today) {

            const lateResolution = (u.lateAlertResolution && u.lateAlertResolution.date === today)
                ? u.lateAlertResolution
                : null;

            if (!lateResolution || lateResolution.status !== "dismissed") {

                const dispute = (u.lateDispute && u.lateDispute.date === today)
                    ? u.lateDispute
                    : null;

                late.push({
                    id: u.id,
                    minutesLate: u.lastLateClockIn.minutesLate,
                    shiftLabel: window.getEmployeeAssignedShift?.(u.id)?.name || "Assigned shift",
                    dispute,
                    resolution: lateResolution
                });
            }
        }

        // ---- LONG "AWAY" STRETCH ----
        // guarded to the current calendar day so a stale status left over
        // from a previous day never keeps flashing as "extended away"
        if (u.status === "Away" && u.lastSwitchTime &&
            window.isSameCalendarDay(u.lastSwitchTime, now)) {

            const awayFor = now - u.lastSwitchTime;

            const awayResolution = (u.awayAlertResolution && u.awayAlertResolution.date === today)
                ? u.awayAlertResolution
                : null;

            if (awayFor > IDLE_AWAY_LIMIT_MS
                && (!awayResolution || awayResolution.status !== "dismissed")) {

                const dispute = (u.awayDispute && u.awayDispute.date === today)
                    ? u.awayDispute
                    : null;

                idle.push({
                    id: u.id,
                    minutesAway: Math.round(awayFor / 60000),
                    dispute,
                    resolution: awayResolution
                });
            }
        }

        // ---- LONG "BREAK" STRETCH ----
        if (u.status === "Break" && u.lastSwitchTime &&
            window.isSameCalendarDay(u.lastSwitchTime, now)) {

            const breakFor = now - u.lastSwitchTime;

            const breakResolution = (u.breakAlertResolution && u.breakAlertResolution.date === today)
                ? u.breakAlertResolution
                : null;

            if (breakFor > BREAK_LIMIT_MS
                && (!breakResolution || breakResolution.status !== "dismissed")) {

                const dispute = (u.breakDispute && u.breakDispute.date === today)
                    ? u.breakDispute
                    : null;

                overBreak.push({
                    id: u.id,
                    minutesOnBreak: Math.round(breakFor / 60000),
                    dispute,
                    resolution: breakResolution
                });
            }
        }
    });

    return { late, idle, overBreak };
};
