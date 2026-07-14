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
// with no check for whether that data is from a previous calendar
// day. status.js's On Duty clock-in only resets when
// `!RelayDesk.shiftStart` — but right after a restore, shiftStart is
// already truthy from stale data, so that reset branch never runs.
// This specifically happens on app crash/force-close/lost-
// connectivity *before* the shift-end-zero fix (Step 2) ever gets a
// chance to run, which is why that fix alone doesn't cover it.
//
// "Calendar day" here uses local device time, matching the same
// convention status.js's getTodayShiftId() already uses to define a
// shift's day boundary — Damascus time (utils.js) is display-only
// and isn't used for any day-boundary logic elsewhere in this app.
function isStaleShiftDay(timestampMs, nowMs = Date.now()) {
    if (!timestampMs) return false;

    const then = new Date(timestampMs);
    const now = new Date(nowMs);

    const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return thenDay < nowDay;
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
                "Restored session was from a previous calendar day — reset instead of restored"
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

            // Step 6: is this restore actually from a previous calendar
            // day (an abandoned session), or genuinely today's shift?
            // shiftStart is the primary signal; lastSwitchTime is the
            // fallback for the (should-be-rare) case where shiftStart
            // itself is missing but the doc still looks mid-shift.
            const staleReferenceTs = data.shiftStart || data.lastSwitchTime || null;
            const isStaleSession = isStaleShiftDay(staleReferenceTs);

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