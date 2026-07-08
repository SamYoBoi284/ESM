// ===========================================
// RelayDesk V5 STATUS SYSTEM (STABLE FIX)
// ===========================================

window.bindStatusButtons = bindStatusButtons;
window.changeUserStatus = changeUserStatus;
window.updateStatusDisplay = updateStatusDisplay;


// ===========================================
// HELPERS
// ===========================================

function getTodayShiftId() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    return `shift_${yyyy}-${mm}-${dd}_${RelayDesk.currentUser}`;
}


// ===========================================
// STATUS BUTTONS
// ===========================================

function bindStatusButtons() {

    const onDutyBtn = document.getElementById("onDutyBtn");
    const breakBtn = document.getElementById("breakBtn");
    const awayBtn = document.getElementById("awayBtn");
    const offDutyBtn = document.getElementById("offDutyBtn");
    const endShiftBtn = document.getElementById("endShiftBtn");

    if (!onDutyBtn) return;

    onDutyBtn.onclick = () => changeUserStatus("On Duty");
    breakBtn.onclick = () => changeUserStatus("Break");
    awayBtn.onclick = () => changeUserStatus("Away");
    offDutyBtn.onclick = () => changeUserStatus("Off Duty");
    endShiftBtn.onclick = () => changeUserStatus("End Shift");

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.onclick = () => window.relayLogout();
    }

    console.log("✅ Status buttons bound");
}


// ===========================================
// MAIN STATUS FUNCTION (FIXED)
// ===========================================

async function changeUserStatus(newStatus, opts = {}) {

    if (!RelayDesk.currentUser) return;

    // ======================
    // SHIFT-END GRACE PERIOD CANCELLATION
    // ======================
    // Any genuine manual status action (the employee clicking a button
    // themselves) is proof they're actually present, so it cancels the
    // shift-end auto Break/Off-Duty sequence and gives back whatever
    // Work time had been provisionally reclassified as Break. Steps
    // that are themselves part of the automation pass
    // { isAutomationStep: true } so they don't cancel their own sequence.
    if (RelayDesk.shiftGrace?.active && !opts.isAutomationStep) {
        window.cancelShiftGrace?.();
    }

    // ======================
// FROZEN USER GUARD
// ======================

if (RelayDesk.currentUserData?.frozen) {

    // Only these actions are allowed while frozen
    if (newStatus !== "Off Duty" && newStatus !== "End Shift") {

        alert("Your account is currently frozen by the Administrator.");

        return;
    }
}

    // clear stale "Shift Ended" text as soon as the user does anything
    const endedAtEl = document.getElementById("shiftEndedAt");
    if (endedAtEl) endedAtEl.textContent = "";

    // reset the "you've been on break too long" toast guard whenever
    // the employee leaves Break, so it can fire again next time
    if (newStatus !== "Break") {
        RelayDesk._breakAlertShown = false;
    }

    // Settings feature: "Extended Away reminder" — same idea, for Away
    if (newStatus !== "Away") {
        RelayDesk._awayAlertShown = false;
    }

    const now = Date.now();
    const last = RelayDesk.lastSwitchTime || now;
    const diff = now - last;

    // ======================
    // TIMER ACCUMULATION
    // ======================

    if (RelayDesk.currentStatus === "On Duty") {
        RelayDesk.timers.work += diff;
    }
    if (RelayDesk.currentStatus === "Break") {
        RelayDesk.timers.break += diff;
    }
    if (RelayDesk.currentStatus === "Away") {
        RelayDesk.timers.away += diff;
    }

    RelayDesk.lastSwitchTime = now;

    if (newStatus === "End Shift") {

    const now = Date.now();

    // finalize timers one last time
    const diff = now - (RelayDesk.lastSwitchTime || now);

    if (RelayDesk.currentStatus === "On Duty") {
        RelayDesk.timers.work += diff;
    }
    if (RelayDesk.currentStatus === "Break") {
        RelayDesk.timers.break += diff;
    }
    if (RelayDesk.currentStatus === "Away") {
        RelayDesk.timers.away += diff;
    }

    RelayDesk.lastSwitchTime = now;

    // Capture the real overtime baseline BEFORE shiftEndTime gets
    // overwritten to the actual end-of-shift timestamp below. This
    // used to be read AFTER the overwrite, which meant overtimeMs was
    // always computed as (now - now) = 0 on every single End Shift,
    // off-day or not.
    const overtimeBaselineForCalc = RelayDesk.overtimeBaseline || RelayDesk.shiftEndTime;
    const wasOffDayShift = RelayDesk.isOffDayShift === true;

    RelayDesk.shiftEndTime = now;
    RelayDesk.shiftEnded = true;

    try {
const shiftDurationMs = now - RelayDesk.shiftStart;

const totalSeconds = Math.floor(shiftDurationMs / 1000);

const hours = Math.floor(totalSeconds / 3600);
const minutes = Math.floor((totalSeconds % 3600) / 60);
const seconds = totalSeconds % 60;

const shiftDuration =
    `${hours}h ${minutes}m ${seconds}s`;

await db.collection("shiftHistory")
    .doc(RelayDesk.shiftId)
    .set({
    endTime: now,

    shiftDuration,

    workTime: formatTime(RelayDesk.timers.work),
    breakTime: formatTime(RelayDesk.timers.break),
    awayTime: formatTime(RelayDesk.timers.away),

    status: "completed",

    metrics: {
        endedEarly: (now < RelayDesk.shiftStart + 9 * 60 * 60 * 1000)
    }

}, { merge: true });

    } catch (e) {
        console.error("End Shift failed:", e);
    }

    // ======================
    // OFF-DAY OVERTIME (AUTOMATIC — entire shift counts, no request
    // needed since the employee wasn't scheduled to work at all today)
    // ======================

    try {

        if (wasOffDayShift) {

            const offDayOvertimeMs = Math.max(0, now - overtimeBaselineForCalc);

            await db.collection("shiftHistory")
                .doc(RelayDesk.shiftId)
                .set({
                    offDayShift: true,
                    overtimeMs: offDayOvertimeMs
                }, { merge: true });

            const userRef = db.collection("users").doc(RelayDesk.currentUser);

            await userRef.set({
                overtimeHistory: firebase.firestore.FieldValue.arrayUnion({
                    date: new Date().toISOString().split("T")[0],
                    durationMs: offDayOvertimeMs,
                    shiftId: RelayDesk.shiftId || null,
                    offDayShift: true,
                    pending: false
                })
            }, { merge: true });

            if (typeof logAudit === "function") {
                await logAudit(
                    RelayDesk.currentUser,
                    "OFF_DAY_OVERTIME_LOGGED",
                    `${formatTime(offDayOvertimeMs)} (entire off-day shift)`
                );
            }

            // ======================
            // CLOSE OUT DANGLING APPROVED REQUESTS
            // admin-extras.js's approveOvertimeRequest() pushes a
            // { pending: true, durationMs: 0 } placeholder into
            // overtimeHistory the moment a request is approved, meant
            // to be reconciled below in the normal (non-off-day)
            // finalize block. That block is skipped entirely for
            // off-day shifts (no "scheduled 9hr end" to measure a
            // request against), so without this, an approved request
            // that lands on an off-day shift has no code path that
            // ever resolves it — it sits forever as "Approved (not
            // yet worked)". Close it out here instead: no extra
            // overtime credit, since the off-day auto-log above
            // already covers the entire shift.
            // ======================

            const staleReqSnap = await db.collection("overtimeRequests")
                .where("user", "==", RelayDesk.currentUser)
                .where("status", "==", "approved")
                .get();

            if (!staleReqSnap.empty) {

                const staleRequestIds = [];
                const staleBatch = db.batch();

                staleReqSnap.forEach(doc => {
                    staleRequestIds.push(doc.id);
                    staleBatch.set(doc.ref, {
                        status: "completed",
                        durationMs: 0,
                        completedAt: now,
                        note: "Superseded by off-day auto overtime"
                    }, { merge: true });
                });

                await staleBatch.commit();

                const staleUserRef = db.collection("users").doc(RelayDesk.currentUser);
                const staleUserSnap = await staleUserRef.get();
                const staleHistory = staleUserSnap.data()?.overtimeHistory || [];

                // Drop the placeholders tied to these requests entirely
                // rather than reconciling them to 0 — their overtime is
                // already fully represented by the off-day entry logged
                // above, so keeping a "00:00:00" line around too would
                // just be a confusing duplicate.
                const cleanedHistory = staleHistory.filter(entry =>
                    !(entry.pending && staleRequestIds.includes(entry.requestId))
                );

                if (cleanedHistory.length !== staleHistory.length) {
                    await staleUserRef.set({ overtimeHistory: cleanedHistory }, { merge: true });
                }

                if (typeof logAudit === "function") {
                    await logAudit(
                        RelayDesk.currentUser,
                        "OVERTIME_REQUEST_SUPERSEDED",
                        `${staleRequestIds.length} approved request(s) closed — covered by off-day auto overtime`
                    );
                }
            }
        }

    } catch (err) {
        console.error("Off-day overtime logging failed:", err);
    }

    // ======================
    // FINALIZE APPROVED OVERTIME
    // (Overtime timer = time worked past the scheduled 9hr shift end.
    // If admin approved an overtime request, log the actual duration
    // worked into this user's overtime history for the analytics
    // drilldown, and close out the request. Skipped for off-day
    // shifts — those are already fully logged above, and an off-day
    // shift has no "scheduled 9hr end" to measure a request against.)
    // ======================

    try {

      if (!wasOffDayShift) {

        const overtimeMs = overtimeBaselineForCalc
            ? Math.max(0, now - overtimeBaselineForCalc)
            : 0;

        const otSnap = await db.collection("overtimeRequests")
            .where("user", "==", RelayDesk.currentUser)
            .where("status", "==", "approved")
            .get();

        if (!otSnap.empty) {

            const requestIds = [];
            const batch = db.batch();

            otSnap.forEach(doc => {
                requestIds.push(doc.id);
                batch.set(doc.ref, {
                    status: "completed",
                    durationMs: overtimeMs,
                    completedAt: now
                }, { merge: true });
            });

            await batch.commit();

            // Reconcile the "pending" overtimeHistory entries that were
            // created immediately at approval time with the real
            // duration actually worked (may be 0 if the shift ended
            // before/at the scheduled end time).
            const userRef = db.collection("users").doc(RelayDesk.currentUser);
            const userSnap = await userRef.get();
            const existingHistory = userSnap.data()?.overtimeHistory || [];

            let matched = false;

            const updatedHistory = existingHistory.map(entry => {
                if (entry.pending && requestIds.includes(entry.requestId)) {
                    matched = true;
                    return {
                        ...entry,
                        durationMs: overtimeMs,
                        shiftId: RelayDesk.shiftId || null,
                        pending: false
                    };
                }
                return entry;
            });

            // Safety net in case a request was approved before this
            // reconciliation existed and never got a pending entry
            if (!matched) {
                updatedHistory.push({
                    date: new Date().toISOString().split("T")[0],
                    durationMs: overtimeMs,
                    shiftId: RelayDesk.shiftId || null,
                    pending: false
                });
            }

            await userRef.set({ overtimeHistory: updatedHistory }, { merge: true });

            if (typeof logAudit === "function") {
                await logAudit(
                    RelayDesk.currentUser,
                    "OVERTIME_LOGGED",
                    `${formatTime(overtimeMs)}`
                );
            }
        }

      }

    } catch (err) {
        console.error("Overtime finalize failed:", err);
    }

    await logAudit(
        RelayDesk.currentUser,
        "SHIFT_ENDED",
        "Manual End Shift clicked"
    );

    // FIX: sync the live "users" doc so colleagues/admin see Off Duty too
    // (previously only the local screen updated, DB kept the old status)
    //
    // V51 item 4: users.bookedLoads only ever represents the CURRENT
    // shift. The permanent record already lives in this shift's own
    // shiftHistory.loadsLog (maintained continuously by the queue as
    // loads were added/edited/deleted) — so it's safe to wipe the
    // live array here. The next shift always starts at length 0.
    try {
        await db.collection("users")
            .doc(RelayDesk.currentUser)
            .set({
                status: "Off Duty",
                work: RelayDesk.timers.work,
                breakT: RelayDesk.timers.break,
                away: RelayDesk.timers.away,
                lastSwitchTime: now,
                lastChange: now,
                shiftStart: null,
                shiftEndTime: null,
                shiftId: null,
                overtimeBaseline: null,
                isOffDayShift: false,
                bookedLoads: []
            }, { merge: true });

        // reflect the reset immediately in this tab rather than waiting
        // on the live listener's round trip. shiftStart/shiftEndTime/
        // shiftId in particular matter here: workspace.js's countdown
        // (updateShiftCountdown) reads RelayDesk.shiftEndTime straight
        // from local memory every second, completely independent of
        // this write. Without this reset, it keeps ticking against the
        // now-stale end time until the Firestore snapshot round-trips
        // back — and if that stale countdown happens to hit zero in
        // the meantime, workspace.js's own "shift timed out naturally"
        // branch fires, logging a bogus second SHIFT_ENDED/"Auto end"
        // audit entry for a shift that was already manually ended.
        RelayDesk.shiftStart = null;
        RelayDesk.shiftEndTime = null;
        RelayDesk.shiftId = null;
        RelayDesk.bookedLoads = [];
        RelayDesk.overtimeBaseline = null;
        RelayDesk.isOffDayShift = false;
        window.renderBookedLoads?.();

    } catch (err) {
        console.error("End Shift status sync failed:", err);
    }

    updateStatusDisplay("Off Duty");

    return;
}


    // ======================
    // OFF DUTY RESET
    // ======================

    if (newStatus === "Off Duty") {

        if (!opts.auto) {
            const ok = confirm("Reset timers?");
            if (!ok) return;
        }

        RelayDesk.timers = { work: 0, break: 0, away: 0 };
        RelayDesk.shiftStart = null;
        RelayDesk.shiftEndTime = null;
        RelayDesk.shiftEnded = false;
        RelayDesk.shiftId = null;
        RelayDesk.overtimeBaseline = null;
        RelayDesk.isOffDayShift = false;
    }


    // ======================
    // ON DUTY SHIFT INIT (CLEAN + SAFE)
    // ======================

    if (newStatus === "On Duty") {

        // ALWAYS ensure shiftId exists first
        if (!RelayDesk.shiftId) {
            RelayDesk.shiftId = getTodayShiftId();
        }

        // FIRST TIME START ONLY
        if (!RelayDesk.shiftStart) {

            RelayDesk.shiftStart = now;
            RelayDesk.shiftEndTime = now + (9 * 60 * 60 * 1000);
            RelayDesk.shiftEnded = false;

            // ======================
            // OFF-DAY OVERTIME RULE
            // An employee has no scheduled shift at all on a configured
            // weekly off day — if they clock in anyway, the ENTIRE time
            // worked counts as overtime (not just time past 9hrs like a
            // normal scheduled day). RelayDesk.overtimeBaseline is what
            // both the live Overtime timer (timers.js) and the End Shift
            // finalizer below actually measure against; on a normal day
            // it's the same as shiftEndTime (9hrs in), on an off day it's
            // the clock-in moment itself (overtime from minute 0).
            // ======================

            const isOffDayShift = window.isOffDayToday?.(RelayDesk.currentUserData, now) || false;

            RelayDesk.isOffDayShift = isOffDayShift;
            RelayDesk.overtimeBaseline = isOffDayShift ? now : RelayDesk.shiftEndTime;

            // ======================
            // LATENESS CHECK
            // ======================

            const assignedShift = RelayDesk.currentUserData?.assignedShift || null;
            const lateness = (typeof window.checkLateness === "function")
                ? window.checkLateness(assignedShift, now, RelayDesk.currentUserData)
                : { assigned: false, late: false };

            try {
                await db.collection("shiftHistory")
                    .doc(RelayDesk.shiftId)
                    .set({
                        shiftId: RelayDesk.shiftId,
                        user: RelayDesk.currentUser,
                        date: new Date().toISOString().split("T")[0],
                        startTime: now,
                        status: "active",
                        assignedShift: assignedShift || null,
                        offDayShift: isOffDayShift,
                        overtimeBaseline: RelayDesk.overtimeBaseline,
                        metrics: {
                            bookedLoads: 0,
                            notesWritten: false,
                            endedEarly: false,
                            lateClockIn: lateness.late,
                            minutesLate: lateness.minutesLate || 0
                        }
                    }, { merge: true });

            } catch (err) {
                console.error("ShiftHistory init failed:", err);
            }

            if (isOffDayShift && typeof window.NotificationManager === "object") {
                window.NotificationManager.notify(
                    "📴 You're clocking in on a scheduled day off — this entire shift will count as overtime.",
                    "warning",
                    { category: "offday" }
                );
            } else if (isOffDayShift && typeof window.showToast === "function") {
                window.showToast(
                    "📴 You're clocking in on a scheduled day off — this entire shift will count as overtime.",
                    "warn"
                );
            }

            if (isOffDayShift && typeof logAudit === "function") {
                await logAudit(
                    RelayDesk.currentUser,
                    "OFF_DAY_SHIFT_STARTED",
                    "Clocked in on a configured weekly off day"
                );
            }

            // reset the notes box for the NEW shift — old notes stay
            // archived on the previous shiftHistory record
            const notesEl = document.getElementById("workspaceNotes");
            if (notesEl) notesEl.value = "";

            if (lateness.late) {

                if (typeof window.NotificationManager === "object") {
                    window.NotificationManager.notify(
                        `⏰ You clocked on ${lateness.minutesLate} min late for your assigned shift.`,
                        "warning",
                        { category: "alerts" }
                    );
                } else if (typeof window.showToast === "function") {
                    window.showToast(
                        `⏰ You clocked on ${lateness.minutesLate} min late for your assigned shift.`,
                        "warn"
                    );
                }

                if (typeof logAudit === "function") {
                    await logAudit(
                        RelayDesk.currentUser,
                        "LATE_CLOCK_IN",
                        `${lateness.minutesLate} min late`
                    );
                }

     // stamp the user doc itself with today's lateness so the
                // admin Alerts panel still shows it after the employee
                // has actually clocked in (the "not clocked in yet" check
                // alone stops catching it the moment status != Off Duty)
                try {
                    await db.collection("users")
                        .doc(RelayDesk.currentUser)
                        .set({
                            lastLateClockIn: {
                                date: new Date().toISOString().split("T")[0],
                                minutesLate: lateness.minutesLate,
                                shiftId: RelayDesk.shiftId || null
                            }
                        }, { merge: true });
                } catch (err) {
                    console.error("Failed to stamp lateness on user doc:", err);
                }
            }
        }
    }


    // ======================
    // SAVE USER STATE
    // ======================

    try {

        await db.collection("users")
            .doc(RelayDesk.currentUser)
            .set({
                status: newStatus,
                work: RelayDesk.timers.work,
                breakT: RelayDesk.timers.break,
                away: RelayDesk.timers.away,
                lastSwitchTime: now,
                lastChange: now,
                shiftStart: RelayDesk.shiftStart || null,
                shiftEndTime: RelayDesk.shiftEndTime || null,
                shiftId: RelayDesk.shiftId || null,
                overtimeBaseline: RelayDesk.overtimeBaseline || null,
                isOffDayShift: RelayDesk.isOffDayShift || false
            }, { merge: true });

        if (typeof window.logAudit === "function") {
            await window.logAudit(
                RelayDesk.currentUser,
                "Status Changed",
                newStatus
            );
        }

    } catch (err) {
        console.error("Status update error:", err);
    }

    // Flush any Load History change notifications that piled up while
    // this employee was Off Duty — fires on every confirmed switch INTO
    // On Duty (fresh clock-in, or coming back from Break/Away), not
    // just the very first clock-in of the shift. Passed as an explicit
    // override rather than relying on RelayDesk.currentStatus, since
    // that value is only updated reactively by presence.js after this
    // write round-trips back through its listener — it wouldn't
    // reliably read "On Duty" yet at this exact point otherwise.
    if (newStatus === "On Duty" && typeof window.deliverPendingLoadNotifications === "function") {
        window.deliverPendingLoadNotifications({ forceOnDuty: true });
    }

    updateStatusDisplay(newStatus);
}


// ===========================================
// UI DISPLAY
// ===========================================

function updateStatusDisplay(status) {

    const el = document.getElementById("statusText");
    if (!el) return;

    el.className = "status";

    const map = {
        "On Duty": ["onDuty", "🟢 On Duty"],
        "Break": ["break", "🟡 Break"],
        "Away": ["away", "🟣 Away"],
        "Off Duty": ["offDuty", "🔴 Off Duty"],
        "End Shift": ["endShift", "⚫End Shift"]
    };

    const [cls, text] = map[status] || ["", status];

    if (cls) el.classList.add(cls);
    el.textContent = text;
}