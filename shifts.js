// ===========================================
// RelayDesk
// shifts.js
// Shift Cycle Definitions + Lateness Helpers
// ===========================================
//
// Three fixed 9-hour cycles per day:
//   Shift 1: 12:00 AM - 09:00 AM
//   Shift 2: 08:00 AM - 05:00 PM
//   Shift 3: 04:00 PM - 12:00 AM
//
// Admin assigns each employee code to one of these cycles
// (users/{code}.assignedShift). Lateness is calculated by comparing
// the employee's actual "On Duty" clock-in time against the expected
// start time of their assigned cycle for that day.

window.SHIFT_CYCLES = {
    shift1: { key: "shift1", label: "Shift 1 (12:00 AM - 9:00 AM)", startHour: 0, startMinute: 0 },
    shift2: { key: "shift2", label: "Shift 2 (8:00 AM - 5:00 PM)", startHour: 8, startMinute: 0 },
    shift3: { key: "shift3", label: "Shift 3 (4:00 PM - 12:00 AM)", startHour: 16, startMinute: 0 }
};

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
// EXPECTED START TIME (today, for a given cycle)
// ===========================================

window.getExpectedShiftStart = function (shiftKey, referenceTime = Date.now()) {

    const cycle = window.SHIFT_CYCLES[shiftKey];
    if (!cycle) return null;

    const ref = new Date(referenceTime);

    return new Date(
        ref.getFullYear(),
        ref.getMonth(),
        ref.getDate(),
        cycle.startHour,
        cycle.startMinute,
        0,
        0
    ).getTime();
};


// ===========================================
// LATENESS CHECK
// ===========================================

window.checkLateness = function (shiftKey, actualStartTime = Date.now(), user = null) {

    if (!shiftKey || !window.SHIFT_CYCLES[shiftKey]) {
        return { assigned: false, late: false };
    }

    if (user && window.isOffDayToday(user, actualStartTime)) {
        return { assigned: true, late: false, offToday: true };
    }

    const expectedStart = window.getExpectedShiftStart(shiftKey, actualStartTime);
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
// ADMIN: ASSIGN A SHIFT CYCLE TO AN EMPLOYEE
// ===========================================

window.assignEmployeeShift = async function (userId, shiftKey) {

    if (!userId) return;

    // ===== PERMISSION SYSTEM =====
    if (!window.hasPermission?.("canAssignShifts")) {
        alert("You don't have permission to assign shifts.");
        return;
    }

    await db.collection("users").doc(userId).set({
        assignedShift: shiftKey || null
    }, { merge: true });

    if (typeof logAudit === "function") {
        await logAudit(
            window.RelayDesk?.currentUser || "A000",
            "SHIFT_ASSIGNED",
            `${userId} -> ${window.SHIFT_CYCLES[shiftKey]?.label || "Unassigned"}`
        );
    }
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
        if (u.assignedShift && window.SHIFT_CYCLES[u.assignedShift]) {

            const expected = window.getExpectedShiftStart(u.assignedShift, now);
            const graceMs = (window.LATE_GRACE_MINUTES || 10) * 60 * 1000;

            const stillNotOn =
                !u.status || u.status === "Off Duty";

            // only relevant once we're past their expected start (+grace)
            // and before the next cycle begins, otherwise it's stale —
            // "expected" is always computed against *today*, so this
            // naturally clears itself out at midnight
            const withinShiftWindow = now - expected < 9 * 60 * 60 * 1000;

            if (stillNotOn && withinShiftWindow && (now - expected) > graceMs) {

                const dispute = (u.lateDispute && u.lateDispute.date === today)
                    ? u.lateDispute
                    : null;

                late.push({
                    id: u.id,
                    minutesLate: Math.round((now - expected) / 60000),
                    shiftLabel: window.SHIFT_CYCLES[u.assignedShift].label,
                    dispute
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

            const dispute = (u.lateDispute && u.lateDispute.date === today)
                ? u.lateDispute
                : null;

            late.push({
                id: u.id,
                minutesLate: u.lastLateClockIn.minutesLate,
                shiftLabel: (u.assignedShift && window.SHIFT_CYCLES[u.assignedShift])
                    ? window.SHIFT_CYCLES[u.assignedShift].label
                    : "Assigned shift",
                dispute
            });
        }

        // ---- LONG "AWAY" STRETCH ----
        // guarded to the current calendar day so a stale status left over
        // from a previous day never keeps flashing as "extended away"
        if (u.status === "Away" && u.lastSwitchTime &&
            window.isSameCalendarDay(u.lastSwitchTime, now)) {

            const awayFor = now - u.lastSwitchTime;

            if (awayFor > IDLE_AWAY_LIMIT_MS) {

                const dispute = (u.awayDispute && u.awayDispute.date === today)
                    ? u.awayDispute
                    : null;

                idle.push({
                    id: u.id,
                    minutesAway: Math.round(awayFor / 60000),
                    dispute
                });
            }
        }

        // ---- LONG "BREAK" STRETCH ----
        if (u.status === "Break" && u.lastSwitchTime &&
            window.isSameCalendarDay(u.lastSwitchTime, now)) {

            const breakFor = now - u.lastSwitchTime;

            if (breakFor > BREAK_LIMIT_MS) {

                const dispute = (u.breakDispute && u.breakDispute.date === today)
                    ? u.breakDispute
                    : null;

                overBreak.push({
                    id: u.id,
                    minutesOnBreak: Math.round(breakFor / 60000),
                    dispute
                });
            }
        }
    });

    return { late, idle, overBreak };
};
