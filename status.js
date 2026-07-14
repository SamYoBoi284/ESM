// ===========================================
// RelayDesk V5 STATUS SYSTEM (STABLE FIX)
// ===========================================

window.bindStatusButtons = bindStatusButtons;
window.changeUserStatus = changeUserStatus;
window.updateStatusDisplay = updateStatusDisplay;

// Phase 11, batch 4: toast/alert/confirm strings via shared I18N.
if (window.I18N) {
    window.I18N.register("status", {
        en: {
            accountFrozen: "Your account is currently frozen by the Administrator.",
            confirmResetTimers: "Reset timers?",
            offDayShiftStarted: "📴 You're clocking in on a scheduled day off — this entire shift will count as overtime.",
            clockedInLate: "⏰ You clocked on {minutes} min late for your assigned shift."
        },
        ar: {
            accountFrozen: "حسابك مجمّد حاليًا من قبل المشرف.",
            confirmResetTimers: "إعادة ضبط المؤقتات؟",
            offDayShiftStarted: "📴 أنت تسجل دخولك في يوم إجازة مجدول — ستُحتسب هذه الوردية بالكامل كعمل إضافي.",
            clockedInLate: "⏰ سجلت دخولك متأخرًا بـ {minutes} دقيقة عن ورديتك المحددة."
        }
    });
}


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
    // IDLE-DETECTION AUTOMATION CANCELLATION
    // ======================
    // Same idea as the shift-grace hook above: any genuine manual status
    // action is proof of presence, so it cancels the idle-warning /
    // auto-Break / auto-Off-Duty sequence in activitydetection.js.
    // Automation-driven steps pass { isAutomationStep: true } so they
    // don't cancel their own sequence.
    if (!opts.isAutomationStep) {
        window.ActivityDetection?.cancelIdleAuto();
    }

    // ======================
// FROZEN USER GUARD
// ======================

if (RelayDesk.currentUserData?.frozen) {

    // Only these actions are allowed while frozen
    if (newStatus !== "Off Duty" && newStatus !== "End Shift") {

        alert(window.I18N ? window.I18N.t("status.accountFrozen") : "Your account is currently frozen by the Administrator.");

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

    // Manual-overtime End Shift fix (found while wiring up how a
    // manual overtime session's End Shift should record into
    // shiftHistory): a session started via startOvertimeSession()
    // never had a real RelayDesk.shiftStart of its own (the normal
    // shift's shiftStart was already nulled out by the End Shift
    // that closed the base shift) — so re-running the primary
    // finalize block below against it would produce a corrupt
    // NaN shiftDuration and stomp the already-correct completed
    // shiftHistory doc. Captured here, before anything below can
    // reset RelayDesk.overtimeStarted, so both this branch and the
    // FINALIZE WORKED OVERTIME block downstream can tell which
    // kind of End Shift this actually is.
    const endingOvertimeSession = RelayDesk.overtimeStarted === true;

    // Step 2: same "capture before it's cleared" reasoning — remember
    // which shift is being closed out so that if the employee starts
    // a manual overtime session afterward (shift-end continue/stop
    // prompt, or the standalone Start Overtime button), that session
    // can still be attributed to this shift's shiftHistory doc even
    // though RelayDesk.shiftId itself gets nulled a few lines down.
    const completingShiftId = RelayDesk.shiftId;
    RelayDesk.lastCompletedShiftId = completingShiftId;

    // STEP 5 CUTOVER: same "capture before overwrite" reasoning as
    // overtimeBaselineForCalc above — this is the *scheduled* end
    // (shiftStart + the employee's actual assigned shift duration,
    // set at clock-in), used below for the "ended early" flag instead
    // of a hardcoded 9-hour assumption.
    const scheduledShiftEndForCalc = RelayDesk.shiftEndTime;

    RelayDesk.shiftEndTime = now;
    RelayDesk.shiftEnded = true;

    // Only the End Shift call that's actually closing out the base
    // shift (real shiftStart, real shiftId) runs the primary
    // finalize write below. An End Shift that's closing a manual
    // overtime session instead is handled entirely by the FINALIZE
    // APPROVED OVERTIME block further down, which merges onto the
    // *existing* shiftHistory doc via RelayDesk.lastCompletedShiftId
    // rather than trying to recompute a shift duration that was
    // never this session's to compute.
    if (!endingOvertimeSession) {
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
        endedEarly: (now < scheduledShiftEndForCalc)
    }

}, { merge: true });

    } catch (e) {
        console.error("End Shift failed:", e);
    }
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
    // FINALIZE WORKED OVERTIME
    // (Employee work time is captured here immediately, no matter
    // whether an overtime request exists yet or what its approval
    // status is. This used to only run once a request had already
    // been approved ("FINALIZE APPROVED OVERTIME"), which meant any
    // overtime worked between "Request Overtime" and an admin's
    // decision was silently lost if End Shift was pressed first.
    // Reality is captured now; approveOvertimeRequest() /
    // denyOvertimeRequest() (admin-extras.js) are the review layer
    // that decides whether it counts, applied retroactively via
    // overtimeReviewStatus if the admin decides after End Shift has
    // already run. Skipped for off-day shifts — those are already
    // fully logged above, and an off-day shift has no separate
    // overtime request to reconcile against.)
    // ======================

    try {

      if (!wasOffDayShift) {

        const overtimeMs = overtimeBaselineForCalc
            ? Math.max(0, now - overtimeBaselineForCalc)
            : 0;

        // Scope the request lookup to THIS shift (shiftId is
        // per-user-per-day — see getTodayShiftId) instead of the old
        // "any approved request this user has ever made" query, which
        // could cross-match a stale/unrelated request. For a
        // standalone overtime session (endingOvertimeSession), also
        // require the request to have been submitted at/after this
        // exact session's start — same disambiguation
        // activitydetection.js's abandoned-overtime clear already
        // relies on — so a second overtime session on the same base
        // shift can never pick up the first session's request (or
        // vice versa).
        const otSnap = await db.collection("overtimeRequests")
            .where("shiftId", "==", RelayDesk.shiftId)
            .get();

        const sessionStart = endingOvertimeSession
            ? (RelayDesk.overtimeStartedAt || 0)
            : 0;

        const otCandidates = otSnap.docs.filter(doc => {
            const d = doc.data();
            if (d.overtimeWorkRecorded) return false; // already finalized once
            if (endingOvertimeSession) {
                return typeof d.time === "number" && d.time >= sessionStart;
            }
            return true;
        });

        if (otCandidates.length > 0) {

            // Normally exactly one request maps to a session; if more
            // than one somehow matches, the most recently submitted
            // one wins — the rest stay untouched/still pending for
            // admin to resolve separately.
            otCandidates.sort((a, b) => (b.data().time || 0) - (a.data().time || 0));
            const matchedDoc = otCandidates[0];
            const matchedReq = matchedDoc.data();

            // The request's own status IS the review state — pending
            // until an admin acts, then approved/denied. Nothing here
            // ever forces it to "completed"; approve/deny in
            // admin-extras.js are the only things that move it from
            // this point on.
            const overtimeReviewStatus =
                (matchedReq.status === "approved" || matchedReq.status === "denied")
                    ? matchedReq.status
                    : "pending";

            try {
                await matchedDoc.ref.set({
                    overtimeWorkRecorded: true,
                    overtimeWorkedMs: overtimeMs,
                    overtimeWorkedAt: now
                }, { merge: true });
            } catch (reqErr) {
                console.error("Overtime request work-recorded write failed:", reqErr);
            }

            // Mirror this onto the base shift's shiftHistory doc, same
            // pattern the off-day path already uses above (merge
            // fields onto the existing completed doc rather than
            // writing a new one). FieldValue.increment (not a plain
            // set) so a second manual overtime session against the
            // same base shift adds onto the total instead of
            // overwriting it. overtimeRequestId/overtimeReviewStatus
            // reflect only the most recently finalized session — this
            // doc has one slot for them, same limitation overtimeMs
            // itself already had before this change.
            if (RelayDesk.shiftId) {
                try {
                    await db.collection("shiftHistory")
                        .doc(RelayDesk.shiftId)
                        .set({
                            manualOvertime: true,
                            overtimeMs: firebase.firestore.FieldValue.increment(overtimeMs),
                            overtimeRequestId: matchedDoc.id,
                            overtimeReviewStatus
                        }, { merge: true });
                } catch (shErr) {
                    console.error("Manual overtime shiftHistory merge failed:", shErr);
                }
            }

            // Record into the user's overtimeHistory analytics
            // drilldown right now — the actual worked duration is
            // known immediately, so approveOvertimeRequest() no longer
            // needs to push a "pending: true, durationMs: 0"
            // placeholder ahead of time (that placeholder is what used
            // to get silently orphaned if End Shift ran before the
            // approval ever happened).
            const userRef = db.collection("users").doc(RelayDesk.currentUser);
            try {
                await userRef.set({
                    overtimeHistory: firebase.firestore.FieldValue.arrayUnion({
                        date: new Date().toISOString().split("T")[0],
                        durationMs: overtimeMs,
                        shiftId: RelayDesk.shiftId || null,
                        requestId: matchedDoc.id,
                        manualOvertime: true,
                        overtimeReviewStatus
                    })
                }, { merge: true });
            } catch (uhErr) {
                console.error("Overtime overtimeHistory write failed:", uhErr);
            }

            if (typeof logAudit === "function") {
                await logAudit(
                    RelayDesk.currentUser,
                    "OVERTIME_LOGGED",
                    `${formatTime(overtimeMs)} (review: ${overtimeReviewStatus})`
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
                // Step 3: clear the manual-overtime flags too, same
                // reasoning as overtimeBaseline/isOffDayShift above — an
                // End Shift always fully closes out any overtime session
                // that was running, so nothing stale should be left for
                // timers.js's overtimeStarted gate to pick up next time.
                overtimeStarted: false,
                overtimeStartedAt: null,
                lastCompletedShiftId: completingShiftId || null,
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
        RelayDesk.overtimeStarted = false;
        RelayDesk.overtimeStartedAt = null;
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
            const ok = confirm(window.I18N ? window.I18N.t("status.confirmResetTimers") : "Reset timers?");
            if (!ok) return;
        }

        RelayDesk.timers = { work: 0, break: 0, away: 0 };
        RelayDesk.shiftStart = null;
        RelayDesk.shiftEndTime = null;
        RelayDesk.shiftEnded = false;
        RelayDesk.shiftId = null;
        RelayDesk.overtimeBaseline = null;
        RelayDesk.isOffDayShift = false;
        RelayDesk.overtimeStarted = false;
        RelayDesk.overtimeStartedAt = null;
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

            // STEP 5 CUTOVER: shift length now comes from the employee's
            // actual assigned shift (RelayDesk.currentUserShift, resolved
            // at login / kept live via shiftsChanged — see auth.js) instead
            // of a hardcoded 9 hours. e.g. a shift configured 4:00-9:00
            // (5 hours) now gives a 5-hour countdown/overtime baseline
            // instead of the old fixed 9-hour one. Falls back to the old
            // 9-hour default only if the employee has no resolved shift
            // (e.g. not yet assigned to any shift in the new system) —
            // keeps clock-in from breaking for anyone not yet migrated.
            const shiftDurationMs = window.getShiftDurationMs?.(RelayDesk.currentUserShift) ?? (9 * 60 * 60 * 1000);

            // Anchor the end time to the SCHEDULED shift end
            // (getShiftExpectedEndEpoch), not to clock-in-time +
            // duration. Clocking in early/late no longer drags the
            // whole window with it — e.g. a 14:00-23:00 shift clocked
            // in at 12:00 still ends at 23:00, not 21:00. Falls back to
            // the old now+duration math only if no shift resolves at
            // all (e.g. employee not yet assigned in the new system).
            const resolvedEndEpoch = window.getShiftExpectedEndEpoch?.(RelayDesk.currentUserShift, now) ?? null;

            RelayDesk.shiftStart = now;
            RelayDesk.shiftEndTime = resolvedEndEpoch ?? (now + shiftDurationMs);
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

            // Step 3 defensive reset: a brand new shift should never
            // start with a manual overtime session already marked
            // active — this should already be false from the End Shift/
            // Off Duty resets above, but a fresh clock-in is a hard
            // boundary either way.
            RelayDesk.overtimeStarted = false;
            RelayDesk.overtimeStartedAt = null;

            // ======================
            // LATENESS CHECK
            // ======================
            // STEP 4 CUTOVER: checkLateness now resolves the employee's
            // shift itself via the new Shift Management system — pass the
            // userId, not the old assignedShift key. `assignedShift`
            // (old field) is still read/stamped below purely for the
            // shiftHistory doc's historical record; it no longer drives
            // the lateness calculation itself.

            const assignedShift = RelayDesk.currentUserData?.assignedShift || null;
            const lateness = (typeof window.checkLateness === "function")
                ? window.checkLateness(RelayDesk.currentUser, now, RelayDesk.currentUserData)
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
                    window.I18N ? window.I18N.t("status.offDayShiftStarted") : "📴 You're clocking in on a scheduled day off — this entire shift will count as overtime.",
                    "warning",
                    { category: "offday" }
                );
            } else if (isOffDayShift && typeof window.showToast === "function") {
                window.showToast(
                    window.I18N ? window.I18N.t("status.offDayShiftStarted") : "📴 You're clocking in on a scheduled day off — this entire shift will count as overtime.",
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
                        window.I18N ? window.I18N.t("status.clockedInLate", { minutes: lateness.minutesLate }) : `⏰ You clocked on ${lateness.minutesLate} min late for your assigned shift.`,
                        "warning",
                        { category: "alerts" }
                    );
                } else if (typeof window.showToast === "function") {
                    window.showToast(
                        window.I18N ? window.I18N.t("status.clockedInLate", { minutes: lateness.minutesLate }) : `⏰ You clocked on ${lateness.minutesLate} min late for your assigned shift.`,
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
                isOffDayShift: RelayDesk.isOffDayShift || false,
                // Employee Activity Detection: marks this status as having
                // been set by the idle-detection automation (vs. the
                // employee themselves) so the Admin Panel can display it
                // distinctly ("Break (Auto Idle)"). Cleared on any manual
                // status change.
                autoIdleStatus: opts.isIdleAuto ? newStatus : null
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
// STEP 2: SHIFT-END AUTO-FINALIZE + CONTINUE/STOP PROMPT
// ===========================================
// Called by workspace.js the moment the normal shift's countdown hits
// 00:00:00. Reuses the exact same "End Shift" finalize path a manual
// click already goes through — shiftHistory write, off-day/approved-
// overtime reconciliation, timer reset, status -> Off Duty — so
// nothing about the existing overtime request submission/approval
// workflow changes; this only changes *when* that path fires
// (automatically, instead of only on a manual click), then optionally
// follows up with the continue/stop prompt (workspace.js).

window.finalizeNormalShiftEnd = async function (opts = {}) {

    await changeUserStatus("End Shift", { auto: true });

    if (opts.thenPrompt && typeof window.showShiftEndContinuePrompt === "function") {
        window.showShiftEndContinuePrompt();
    }
};

// Shared core for every manual "Start Overtime" entry point (the
// shift-end continue/stop prompt, and Step 3's standalone always-
// visible button). Deliberately does NOT go through the normal On
// Duty clock-in path (changeUserStatus("On Duty")) — that path's
// "FIRST TIME START ONLY" block would wrongly re-arm a brand new full
// shift (new shiftId, shiftEndTime, lateness check). This starts a
// standalone overtime session layered on top of the shift that was
// just closed instead.
//
// Sets both the new overtimeStarted/overtimeStartedAt fields (what
// timers.js's Step 3 gating now reads for normal-day overtime) and the
// existing overtimeBaseline field (kept in sync for anything else that
// still reads it, e.g. the off-day path shares the same field name).
async function startOvertimeSession(auditNote) {

    if (!RelayDesk.currentUser) return;

    const now = Date.now();
    const forShiftId = RelayDesk.lastCompletedShiftId || null;

    RelayDesk.currentStatus = "On Duty";
    RelayDesk.lastSwitchTime = now;
    RelayDesk.overtimeStarted = true;
    RelayDesk.overtimeStartedAt = now;
    RelayDesk.overtimeBaseline = now;
    RelayDesk.shiftEnded = false;

    // Restore RelayDesk.shiftId to the shift this overtime session
    // belongs to (it was nulled when that shift's End Shift ran).
    // Without this, the End Shift call that later closes THIS
    // session looks up shiftHistory.doc(null) and silently fails
    // (caught, logged, nothing written) instead of ever recording
    // the overtime — this is what actually fixes that.
    RelayDesk.shiftId = forShiftId;

    try {
        await db.collection("users").doc(RelayDesk.currentUser).set({
            status: "On Duty",
            lastSwitchTime: now,
            lastChange: now,
            overtimeStarted: true,
            overtimeStartedAt: now,
            overtimeBaseline: now,
            overtimeForShiftId: forShiftId,
            shiftId: forShiftId
        }, { merge: true });
    } catch (err) {
        console.error("Start Overtime failed:", err);
    }

    if (typeof logAudit === "function") {
        await logAudit(
            RelayDesk.currentUser,
            "OVERTIME_STARTED",
            auditNote
        );
    }

    updateStatusDisplay("On Duty");
}

// "Start Overtime" chosen from the shift-end continue/stop prompt.
window.startOvertimeFromShiftEndPrompt = function () {
    return startOvertimeSession("Manual Start Overtime (shift-end prompt)");
};

// Step 3: the always-visible standalone Start Overtime button, for
// starting overtime outside the shift-end prompt (e.g. the prompt was
// declined/timed out earlier, or was missed entirely, and the employee
// decides afterward to start an overtime session). Same underlying
// session as the prompt's button — just a different, always-available
// entry point into it. timers.js only shows this button when it's
// actually applicable (shift already ended, not an off-day shift, no
// overtime session already running).
window.startOvertimeStandalone = function () {

    if (RelayDesk.isOffDayShift || RelayDesk.overtimeStarted || !RelayDesk.shiftEnded) {
        // Defensive no-op: off-day shifts auto-overtime already, a
        // session already in progress shouldn't be restarted/clobbered,
        // and a normal shift that hasn't ended yet isn't eligible for
        // manual overtime. The button is disabled (not hidden) in these
        // states now, so this only guards against a stale click racing
        // a state change.
        return;
    }

    return startOvertimeSession("Manual Start Overtime (standalone button)");
};

// "No, I'm done for today" chosen, or the prompt timed out with no
// response — both are explicitly the same outcome per the spec. The
// normal shift is already fully finalized by finalizeNormalShiftEnd()
// above by the time this fires, so there's nothing left to reset here
// — this just makes sure no overtime session gets marked started for
// a decision that was actually a decline/no-response.
window.declineOvertimeFromShiftEndPrompt = function () {
    RelayDesk.overtimeStarted = false;
    RelayDesk.overtimeStartedAt = null;
};


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