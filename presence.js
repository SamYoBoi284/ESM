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
// SNAPSHOT HANDLER (FIXED)
// ===========================================

function handleSnapshot(snapshot) {

    const users = [];

    snapshot.forEach(doc => {

        const data = doc.data();

        users.push({ id: doc.id, ...data });

        if (doc.id === RelayDesk.currentUser) {

            RelayDesk.currentUserData = data;

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