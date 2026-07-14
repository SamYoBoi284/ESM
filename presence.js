// ===========================================
// RelayDesk V5 PRESENCE (STABLE FIX)
// ===========================================

function initializePresence() {

    const user = window.RelayDesk.currentUser;

    if (!user) {
        console.warn("⚠️ No user logged in yet (retrying...)");
        setTimeout(initializePresence, 300);
        return;
    }

    console.log("📡 Presence active for:", user);

    // prevent duplicate listeners
    if (window.RelayDesk.unsubscribe) {
    window.RelayDesk.unsubscribe();
    window.RelayDesk.unsubscribe = null;
}

    window.RelayDesk.unsubscribe =
        db.collection("users").onSnapshot(handleSnapshot);
}

// ===========================================
// STEP 6: PRESENCE-RESTORE STALENESS GUARD
// ===========================================
// The accumulation bug (51+ hour readouts): this listener restores
// shiftStart/timers straight from Firestore on every reconnect/login
// with no check for whether that data is from an abandoned session.
// status.js's On Duty clock-in only resets when `!RelayDesk.shiftStart`
// — but right after a restore, shiftStart is already truthy from stale
// data, so that reset branch never runs. This specifically happens on
// app crash/force-close/lost-connectivity *before* the shift-end-zero
// fix (Step 2, workspace.js updateShiftCountdown) ever gets a chance
// to run, which is why that fix alone doesn't cover it.
//
// LEGACY FALLBACK ONLY — do not use this for the primary staleness
// decision anymore. A calendar-day boundary is wrong for night shifts
// (e.g. 22:00->07:00 is still mid-shift after midnight). It's kept
// only as a fallback for the rare doc that has shiftStart but no
// shiftEndTime (e.g. legacy data predating Step 5's per-shift
// shiftEndTime, or an employee with no resolvable assigned shift), so
// those accounts don't lose staleness protection entirely. See
// isShiftExpired() below for the real, shift-boundary-aware check.
function isStaleShiftDay(timestampMs, nowMs = Date.now()) {
    if (!timestampMs) return false;

    const then = new Date(timestampMs);
    const now = new Date(nowMs);

    const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return thenDay < nowDay;
}

// THE FIX: "has this employee's actual assigned shift ended?" instead
// of "did the calendar date change?". shiftEndTime is already computed
// correctly (overnight-wrap aware) at clock-in time by
// shiftmanagement.js's getShiftExpectedEndEpoch/getShiftDurationMs and
// synced to Firestore on every status change (status.js), so this just
// has to compare against it instead of re-deriving anything.
//
// A night shift (22:00->07:00) clocked in at 22:00 has shiftEndTime
// anchored to 07:00 the next day — at 00:00 that's still in the
// future, so the session correctly survives the midnight rollover. A
// day shift (08:00->17:00) has shiftEndTime the same day at 17:00 — by
// midnight that's long past, so it's correctly still caught as stale.
function isShiftExpired(data, nowMs = Date.now()) {
    if (!data || !data.shiftStart) return false;

    // An explicitly-started overtime session (Start Overtime button /
    // shift-end prompt — see status.js startOvertimeSession) is a
    // deliberate continuation past the scheduled shift end, not an
    // abandoned one. shiftEndTime still points at the *original*
    // scheduled end in this state, so without this check a crash
    // mid-overtime would wrongly look stale and get reset.
    if (data.overtimeStarted === true) return false;

    // No resolvable shift boundary on this doc (legacy data / no
    // assigned shift) — fall back to the old calendar-day guard rather
    // than leaving these accounts completely unprotected.
    if (!data.shiftEndTime) {
        return isStaleShiftDay(data.shiftStart, nowMs);
    }

    // Core check: is the employee still inside their assigned shift
    // window? Only stale once the actual shift boundary has passed.
    return nowMs >= data.shiftEndTime;
}

// Guards against overlapping correction writes — handleSnapshot fires
// on every change to the whole users collection (any employee), not
// just this one, so a burst of unrelated snapshots could otherwise
// race multiple corrective writes for the same stale session.
let staleSessionResetInFlight = false;

// Mirrors status.js's Off Duty reset (same fields, same values) but
// triggered from the snapshot path instead of a manual status change,
// and additionally persisted back to Firestore so the correction
// sticks — otherwise the still-stale doc would just re-trigger this
// on every future reconnect instead of actually resolving it, and
// admin/colleague views would keep showing the employee stuck On Duty.
async function resetStaleShiftSession(now) {

    if (staleSessionResetInFlight) return;
    staleSessionResetInFlight = true;

    RelayDesk.currentStatus = "Off Duty";
    RelayDesk.timers = { work: 0, break: 0, away: 0 };
    RelayDesk.shiftStart = null;
    RelayDesk.shiftEndTime = null;
    RelayDesk.shiftEnded = false;
    RelayDesk.shiftId = null;
    RelayDesk.overtimeBaseline = null;
    RelayDesk.isOffDayShift = false;
    RelayDesk.overtimeStarted = false;
    RelayDesk.overtimeStartedAt = null;

    try {
        await db.collection("users").doc(RelayDesk.currentUser).set({
            status: "Off Duty",
            work: 0,
            breakT: 0,
            away: 0,
            lastSwitchTime: now,
            lastChange: now,
            shiftStart: null,
            shiftEndTime: null,
            shiftId: null,
            overtimeBaseline: null,
            isOffDayShift: false,
            overtimeStarted: false,
            overtimeStartedAt: null
        }, { merge: true });

        if (typeof logAudit === "function") {
            await logAudit(
                RelayDesk.currentUser,
                "PRESENCE_STALE_SESSION_RESET",
                "Restored session's assigned shift had already ended — reset instead of restored"
            );
        }
    } catch (err) {
        console.error("Stale session reset failed:", err);
    } finally {
        staleSessionResetInFlight = false;
    }
}

// ===========================================
// SNAPSHOT HANDLER (FIXED)
// ===========================================

function handleSnapshot(snapshot) {

    const users = [];

    snapshot.forEach(doc => {

        const data = doc.data();

        users.push({ id: doc.id, ...data });

        if (doc.id === RelayDesk.currentUser) {

            RelayDesk.currentUserData = data;

            // Step 6 (revised): is this restore an abandoned session, or
            // is the employee genuinely still inside their assigned
            // shift window (isShiftExpired handles overnight shifts
            // correctly — see comment above its definition)? Falls back
            // to lastSwitchTime as the reference timestamp only for the
            // legacy no-shiftEndTime path, same as before.
            const isStaleSession = isShiftExpired(
                { ...data, shiftStart: data.shiftStart || data.lastSwitchTime || null },
                Date.now()
            );

            if (isStaleSession) {

                // Don't restore any of it — treat exactly like the Off
                // Duty reset in status.js. resetStaleShiftSession() sets
                // RelayDesk.currentStatus/timers/shift fields itself and
                // persists the correction, so nothing below needs to run
                // for this snapshot cycle.
                resetStaleShiftSession(Date.now());

            } else {

                // FIX: always trust the DB status — don't force "Off Duty" on first snapshot
                RelayDesk.currentStatus = data.status || "Off Duty";
                RelayDesk.lastSwitchTime = data.lastSwitchTime || Date.now();

                // keep shift timing in sync too, so a relogin doesn't lose the countdown
                RelayDesk.shiftStart = data.shiftStart || RelayDesk.shiftStart || null;
                RelayDesk.shiftEndTime = data.shiftEndTime || RelayDesk.shiftEndTime || null;
                RelayDesk.overtimeBaseline = data.overtimeBaseline || RelayDesk.overtimeBaseline || null;
                RelayDesk.isOffDayShift = data.isOffDayShift ?? RelayDesk.isOffDayShift ?? false;

                RelayDesk.timers = {
                    work: data.work || 0,
                    break: data.breakT || 0,
                    away: data.away || 0
                };
            }

            // ROLE FIX
            const roleLabel = document.getElementById("roleLabel");
            const roleSelect = document.getElementById("roleSelect");

            if (roleLabel) {
                roleLabel.textContent = data.role || "";
            }

            if (roleSelect) {
                roleSelect.value = data.role || "";
            }

            // UI SYNC
            if (window.updateStatusDisplay)
                updateStatusDisplay(RelayDesk.currentStatus);

            if (window.updateTimersDisplay)
                updateTimersDisplay(RelayDesk.timers);

            const last = document.getElementById("lastChange");
            if (last && data.lastChange) {
                const usTime = new Date(data.lastChange).toLocaleTimeString();
                const syTime = window.formatDamascusTime
                    ? formatDamascusTime(data.lastChange)
                    : "--";

                last.textContent = `🇺🇸 ${usTime}  |  🇸🇾 ${syTime}`;
            }
        }
    });

    if (window.renderColleagues)
        renderColleagues(users);
}

// ===========================================
// ROLE SELECTOR INIT (SAFE)
// ===========================================

// ===========================================
// ROLE SELECTOR INIT (SAFE)
// ===========================================

function initializeRoleSelector() {

    const selector = document.getElementById("roleSelect");
    const label = document.getElementById("roleLabel");

    if (!selector || !label) return;

    selector.onchange = async () => {

        const uid = window.RelayDesk.currentUser;
        if (!uid) return;

        label.textContent = selector.value;

        try {

            await db.collection("users").doc(uid).set({
                role: selector.value
            }, { merge: true });

            if (typeof logAudit === "function") {
                await logAudit(
                    uid,
                    "Role Changed",
                    selector.value
                );
            }

            console.log("🎭 Role changed:", selector.value);

        } catch (err) {

            console.error("Role update failed:", err);

        }

    };

}

// ===========================================
// EXPORTS
// ===========================================

window.initializePresence = initializePresence;
window.initializeRoleSelector = initializeRoleSelector;
window.handleSnapshot = handleSnapshot;

function syncRoleUI(role) {

    const label = document.getElementById("roleLabel");
    const select = document.getElementById("roleSelect");

    const safeRole = role || "";

    if (label) {
        label.textContent = safeRole;
    }

    if (select) {
        select.value = safeRole;
    }
}

window.syncRoleUI = syncRoleUI;