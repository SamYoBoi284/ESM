// ===========================================
// RelayDesk V5
// admin.js (CLEAN FIXED VERSION)
// ===========================================

// Phase 11, batch 3: confirm() dialog strings registered with the
// shared language manager so they follow the global Settings
// language choice. See ESM_Release_Context_Tracker.md.
if (window.I18N) {
    window.I18N.register("admin", {
        en: {
            confirmRebuildShiftHistory: "Rebuild missing active shift history?",
            confirmResetAllUsers: "Reset ALL users?",
            confirmDeleteUser: "Delete user {id}?",
            confirmResetPin: "Reset PIN for {id}? They'll be asked to set a new one at next login."
        },
        ar: {
            confirmRebuildShiftHistory: "إعادة بناء سجل الوردية النشطة المفقود؟",
            confirmResetAllUsers: "إعادة تعيين جميع المستخدمين؟",
            confirmDeleteUser: "حذف المستخدم {id}؟",
            confirmResetPin: "إعادة تعيين الرقم السري لـ {id}؟ سيُطلب منه تعيين رقم جديد عند تسجيل الدخول التالي."
        }
    });
}

// ===========================================
// INIT ADMIN
// ===========================================

let isShiftHistoryOpen = false;

// Phase 2 follow-up: caches the flat, still-active loads collected
// during the last loadStatisticsPanel() run, so the "Total Loads"
// company-wide breakdown (toggleStatsLoadsBreakdown) doesn't need a
// separate Firestore round-trip just to re-group the same data.
let statsAllActiveLoads = [];

// ===========================================
// SHARED LOADS GROUP RENDERER (Phase 2 follow-up)
// Builds the Department -> Driver -> VRID Type -> Loads grouped-tree
// HTML (via the shared window.groupLoadsHierarchy helper workspace.js
// also uses) from a flat loads array. Used by: the per-shift drilldown
// (toggleShiftLoads), the Admin Statistics "Total Loads" breakdown,
// and the per-user Analytics drilldown's aggregated Total Loads
// breakdown — one renderer, three call sites, so all three stay in
// sync automatically.
// ===========================================
function renderLoadsGroupedHTML(loads) {

    if (!loads.length) return `<div class="shiftLoadItem">No loads found</div>`;

    const grouped = window.groupLoadsHierarchy(loads);

    return grouped.map(deptGroup => {

        const driverBlocks = deptGroup.drivers.map(driverGroup => {

            const vridBlocks = driverGroup.vridGroups.map(vg => {

                const loadItems = vg.loads.map(l => `
                    <div class="shiftLoadItem${l.active === false ? " deletedLoad" : ""}">
                        📅 ${l.date}<br>
                        💰 $${l.price}<br>
                        ${l.vrid ? `🔢 ${l.vrid}<br>` : ""}
                        👤 ${l.bookedBy}<br>
                        📝 ${l.note || "No notes"}
                        ${l.active === false ? `<br><span class="deletedTag">🗑 Deleted from workspace</span>` : ""}
                    </div>
                `).join("");

                return `
                    <div class="loadGroupVrid">
                        <div class="loadGroupVridHeader">🔖 ${vg.vridType} (${vg.loads.length})</div>
                        ${loadItems}
                    </div>
                `;
            }).join("");

            return `
                <div class="loadGroupDriver">
                    <div class="loadGroupDriverHeader">🚚 ${driverGroup.driver}</div>
                    ${vridBlocks}
                </div>
            `;
        }).join("");

        return `
            <div class="loadGroupDept">
                <div class="loadGroupDeptHeader">🏢 ${deptGroup.department}</div>
                ${driverBlocks}
            </div>
        `;
    }).join("");
}

// ===========================================
// V51: LOAD COUNT — single source of truth
// ===========================================
// Never trust a separately-stored counter for a shift's load count.
// shiftHistory.loadsLog is the permanent per-shift ledger (every add/
// edit/delete is already appended there by the queue) — count the
// still-active entries straight from it. Falls back to the legacy
// metrics.bookedLoads snapshot only for shifts recorded before
// loadsLog existed.
function getShiftLoadCount(s) {
    if (Array.isArray(s?.loadsLog)) {
        return s.loadsLog.filter(l => l.active !== false).length;
    }
    return s?.metrics?.bookedLoads || 0;
}

// ===========================================
// PERMISSION-DRIVEN SECTION VISIBILITY
// ===========================================

function applyAdminPermissionVisibility() {

    const statsCard = document.getElementById("adminStatsCard")?.closest(".card");
    const addEmployeeSection = document.getElementById("addEmployeeBtn")?.closest("section");

    if (statsCard) {
        statsCard.classList.toggle("hidden", !window.hasPermission?.("canViewStatistics"));
    }

    if (addEmployeeSection) {
        // ===== LOGIN CHANGES (Phase 9) =====
        // Creating a new employee account is narrower than general
        // "manage employees" — only A000 / Owner-level users get this
        // section now.
        addEmployeeSection.classList.toggle("hidden", !window.canCreateEmployeeAccounts?.());
    }
}

// ===========================================
// STATS BASELINE (for "Clear Stats")
// ===========================================
// Clearing stats does NOT delete shiftHistory or load records —
// it just moves this timestamp forward so the aggregate views
// (Statistics panel) ignore anything before it. The per-user
// drilldown always shows full permanent history regardless.
let statsBaseline = 0;

async function loadStatsBaseline() {
    try {
        const doc = await db.collection("system").doc("statsReset").get();
        statsBaseline = doc.exists ? (doc.data().resetAt || 0) : 0;
    } catch (err) {
        console.error("Failed to load stats baseline:", err);
        statsBaseline = 0;
    }
}

window.clearStatistics = async function () {

    if (!window.hasPermission?.("canViewStatistics")) {
        alert("You don't have permission to manage statistics.");
        return;
    }

    if (!confirm(
        "Clear all statistics back to zero?\n\n" +
        "This only resets the numbers shown in the Statistics panel — " +
        "it does NOT delete shift or load history (use Clear Shift History for that)."
    )) return;

    const now = Date.now();

    try {

        await db.collection("system").doc("statsReset").set({
            resetAt: now,
            by: RelayDesk.currentUser
        }, { merge: true });

        statsBaseline = now;

        if (typeof logAudit === "function") {
            await logAudit(RelayDesk.currentUser, "STATS_CLEARED", "Statistics reset to zero");
        }

        await loadStatisticsPanel();

        alert("Statistics cleared ✔");

    } catch (err) {
        console.error("Clear statistics failed:", err);
        alert("Failed to clear statistics.");
    }
};

function initializeAdmin() {

    console.log("🧠 Admin system fully initialized");

    // ===== PERMISSION SYSTEM =====
    // hide whole sections the current user isn't permitted to use —
    // the underlying actions are still guarded individually below,
    // this just keeps the UI honest about what's actually usable
    applyAdminPermissionVisibility();

    // ===== MONTHLY ARCHIVE (monthlystats.js) =====
    if (window.initMonthlyArchiveAdmin) {
        initMonthlyArchiveAdmin();
    }

    // ===== VIOLATIONS LOG (violations.js) =====
    if (window.initViolationsAdmin) {
        initViolationsAdmin();
    }

    const adminList = $("adminList");
    const adminOnlineBtn = $("adminOnlineBtn");
    const adminOfflineBtn = $("adminOfflineBtn");
    const logoutBtn = $("adminLogoutBtn");
    const clearShiftHistoryBtn = $("clearShiftHistoryBtn");
    const rebuildBtn = $("rebuildShiftHistoryBtn");
    const shiftHistoryContainer = document.getElementById("shiftHistoryList");
    const exportBtn = $("exportShiftHistoryBtn");
    const statsRefreshBtn = $("statsRefreshBtn");

if (exportBtn) {
    exportBtn.onclick = exportShiftHistory;
}

if (statsRefreshBtn) {
    statsRefreshBtn.onclick = async () => {
        statsRefreshBtn.disabled = true;
        const original = statsRefreshBtn.textContent;
        statsRefreshBtn.textContent = "🔄 Refreshing...";

        await loadStatisticsPanel();

        statsRefreshBtn.textContent = original;
        statsRefreshBtn.disabled = false;
    };
}
    // detect when admin interacts with history area
if (shiftHistoryContainer) {

    shiftHistoryContainer.addEventListener("mouseenter", () => {
        isShiftHistoryOpen = true;
    });

}

    let isRebuilding = false;

    // =====================================
    // REBUILD SHIFT HISTORY BUTTON
    // =====================================

    if (rebuildBtn) {

        rebuildBtn.onclick = async () => {

            if (!confirm(window.I18N ? window.I18N.t("admin.confirmRebuildShiftHistory") : "Rebuild missing active shift history?")) return;

            isRebuilding = true;

            rebuildBtn.disabled = true;
            rebuildBtn.textContent = "Rebuilding.";

            try {

                await rebuildActiveShiftHistory();

                await loadShiftHistory();

                alert("Shift history synced ✔");

            } catch (err) {
                console.error("Rebuild failed:", err);
            }

            rebuildBtn.textContent = "🔁 Refresh Shifts";
            rebuildBtn.disabled = false;

            isRebuilding = false;
        };
    }

    // =====================================
    // CORE ADMIN SYSTEM STARTUP
    // =====================================

    startAdminLiveTimers();
    startAdminBigStatusListener();
    startStatsLiveTimer();

    // load the stats-reset baseline first so the very first render
    // already respects a previous "Clear Stats" click
    loadStatsBaseline().then(() => {
        loadStatisticsPanel();
    });

    loadShiftHistory();

setInterval(() => {

    if (isRebuilding) return;
    if (isShiftHistoryOpen) return;

    loadShiftHistory();

}, 20000);

setInterval(loadStatisticsPanel, 10000);

    // =====================================

    if (!adminList) {
        console.error("❌ adminList missing");
        return;
    }

    // (rest of your function continues below...)

    // =====================
    // ADMIN BUTTONS
    // =====================

    adminOnlineBtn.onclick = async () => {

        await db.collection("users").doc("A000").set({
            adminStatus: "Online",
            status: "On Duty",
            lastChange: Date.now()
        }, { merge: true });

        logAudit("A000", "ADMIN_ONLINE", "Admin changed status to online");
    };

    adminOfflineBtn.onclick = async () => {

        await db.collection("users").doc("A000").set({
            adminStatus: "Offline",
            status: "Off Duty",
            lastChange: Date.now()
        }, { merge: true });

        logAudit("A000", "ADMIN_OFFLINE", "Admin changed status to offline");
    };

    async function clearShiftHistory() {

    const answer = prompt(
        'Type "clear" to permanently delete ALL shift history.'
    );

    if (answer !== "clear") {
        alert("Cancelled.");
        return;
    }

    const snapshot =
        await db.collection("shiftHistory").get();

    const batch = db.batch();

    snapshot.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    logAudit(
        "A000",
        "SHIFT_HISTORY_CLEARED",
        "Entire shift history deleted"
    );

    loadShiftHistory();

    alert("Shift history cleared.");
}

    clearShiftHistoryBtn.onclick = clearShiftHistory;

    // =====================
    // ADMIN PIN
    // =====================

    window.resetAdminPin = async () => {

        const newPin = prompt("Enter NEW admin PIN/Password (leave blank for no PIN):");

        // prompt() returns null only if the dialog was cancelled —
        // that's the one case that should abort. An empty string means
        // the admin deliberately submitted a blank PIN, which is
        // allowed, same as any employee account.
        if (newPin === null) return;

        await db.collection("users").doc("A000").set({
            pin: newPin.trim()
        }, { merge: true });

        logAudit("A000", "PIN_RESET", "Admin changed PIN");
        alert("Admin PIN updated");
    };

    // =====================
    // LOGOUT
    // =====================

    logoutBtn.onclick = () => {
        window.relayLogout();
    };

    // =====================
    // LIVE ADMIN PANEL
    // =====================

    // Cached so the panel can re-render purely off a `shiftsChanged` event
    // (new Shift Management system) without waiting for the next `users`
    // snapshot — e.g. renaming a shift or moving an employee to a
    // different shift from the Shift Management UI should update this
    // list immediately even though no `users/{id}` doc changed.
    window._lastAdminUsersSnapshot = null;

    function renderAdminUserList(snapshot) {

        adminList.innerHTML = "";
        window.adminLiveUsers = {};

        const allUsersForAlerts = [];

        snapshot.forEach(doc => {

            const u = doc.data();
            const id = doc.id;

            allUsersForAlerts.push({ id, ...u });

            // =========================
            // ADMIN CARD
            // =========================

            if (id === "A000") {

                const adminSelf = document.createElement("div");
                adminSelf.className = "adminUserCard";

                const adminStatus = u.adminStatus || "Offline";

                // BIG STATUS FIX
                const bigStatus = $("adminStatusText");

                if (bigStatus) {

                    bigStatus.textContent =
                        adminStatus === "Online"
                            ? "🟢 Online"
                            : "🔴 Offline";

                    bigStatus.className =
                        "status " + (adminStatus === "Online" ? "onDuty" : "offDuty");
                }

                adminSelf.innerHTML = `
                    <h3>👑 ADMIN (A000)</h3>
                    <div>
                        Status: <b>${u.status || "Off Duty"}</b><br>
                        Admin Mode: <b>${adminStatus}</b>
                    </div>

                    <br>
                    <button onclick="resetAdminPin()">Reset Admin PIN</button>
                `;

                adminList.appendChild(adminSelf);
                return;
            }

            // =========================
            // USER CARD
            // =========================

            // cache raw doc so the live 1s timer loop can compute
            // real-time elapsed work/break/away without hitting Firestore
            window.adminLiveUsers[id] = u;

            const card = document.createElement("div");
            card.className = "adminUserCard";

            card.innerHTML = `
                <div class="adminHeader">
                    <b>${id}</b>
                    <span>${u.status || "Off Duty"}${(u.autoIdleStatus && u.autoIdleStatus === u.status) ? ' <span class="autoIdleBadge">Auto Idle</span>' : ""}</span>
                </div>

                ${window.isOffDayToday?.(u) ? `<div class="offTodayBadge">📴 Off Today</div>` : ""}
                ${u.pinResetRequested ? `<div class="pinResetBadge">🔑 PIN Reset Request</div>` : ""}

                <div>
                    <small>PIN: <span id="adminPinValue-${id}" class="adminPinValue${window.adminRevealedPins?.has(id) ? " revealed" : ""}">${u.pin || "Not Set"}</span> <button type="button" class="adminPinToggleBtn" id="adminPinToggleBtn-${id}" onclick="toggleAdminPinVisibility('${id}')" title="Show/hide this employee's PIN/Password">${window.adminRevealedPins?.has(id) ? "🙈" : "👁️"}</button></small>
                </div>

                <div class="adminTimers" id="timer-${id}">
                    Work: ${formatTime(u.work || 0)}<br>
                    Break: ${formatTime(u.breakT || 0)}<br>
                    Away: ${formatTime(u.away || 0)}
                </div>

                <div class="shiftAssignRow">
                    <label>Shift:</label>
                    ${(() => {
                        // Resolved from the new Shift Management system —
                        // assignment now happens from the shift's own
                        // "Assigned Employees" multi-select (Owner Panel →
                        // Shift Management), not from a per-employee picker.
                        const resolved = window.getEmployeeAssignedShift?.(id);
                        if (!resolved) return `<span class="shiftResolvedDisplay shiftUnassigned">Unassigned</span>`;
                        const zone = window.getShiftTimezoneZone?.(resolved.timezoneRegion);
                        return `<span class="shiftResolvedDisplay">${resolved.name} (${resolved.startTime}–${resolved.endTime}${zone ? " " + zone.label : ""})${resolved.enabled === false ? ' <span class="shiftMgmtBadge disabled">Disabled</span>' : ""}</span>`;
                    })()}
                </div>

                <div class="adminButtons">

                    <button onclick="setUserStatus('${id}','On Duty')">Online</button>
                    <button onclick="setUserStatus('${id}','Off Duty')">Offline</button>

                    ${window.hasPermission?.("canManageEmployees") ? `
                        <button onclick="resetUser('${id}')">Reset</button>
                        <button onclick="resetUserPin('${id}')">Reset PIN</button>
                        <button onclick="openPermissionsEditor('${id}')">🔑 Permissions</button>
                    ` : ""}

                    ${window.isOwnerOrAbove?.() ? `
                        <button onclick="deleteUser('${id}')">Delete</button>
                    ` : ""}

                </div>

                <div class="permBadge">${u.permissionLevel || "Employee"}</div>
            `;

            adminList.appendChild(card);
        });

        if (typeof window.renderAdminAlerts === "function") {
            window.renderAdminAlerts(allUsersForAlerts);
        }
    }

    db.collection("users").onSnapshot(snapshot => {
        window._lastAdminUsersSnapshot = snapshot;
        renderAdminUserList(snapshot);
    });

    // New Shift Management system fires this whenever `shifts` docs
    // change (create/edit/delete/enable-disable/reassign). No `users`
    // doc changes in that case, so without this the "Shift:" line on
    // each employee card would go stale until the next unrelated
    // `users` snapshot. Re-render off the cached snapshot instead of
    // waiting on Firestore again.
    document.addEventListener("shiftsChanged", () => {
        if (window._lastAdminUsersSnapshot) {
            renderAdminUserList(window._lastAdminUsersSnapshot);
        }
    });
}


// ===========================================
// LIVE ADMIN TIMERS (TRUE SECOND-BY-SECOND)
// ===========================================

// raw per-user docs, kept fresh by the "LIVE ADMIN PANEL" onSnapshot
// listener in initializeAdmin(). This lets us compute live elapsed
// time locally every second, just like the employee's own page does,
// instead of only updating whenever the employee changes status.
window.adminLiveUsers = window.adminLiveUsers || {};

function computeLiveAdminTimers(u) {

    let work = u.work || 0;
    let breakT = u.breakT || 0;
    let away = u.away || 0;

    // add the time elapsed since their last status switch, based on
    // whatever status they're currently sitting in
    if (u.status && u.lastSwitchTime) {

        const elapsed = Date.now() - u.lastSwitchTime;

        if (elapsed > 0) {
            if (u.status === "On Duty") work += elapsed;
            if (u.status === "Break") breakT += elapsed;
            if (u.status === "Away") away += elapsed;
        }
    }

    return { work, breakT, away };
}

function startAdminLiveTimers() {

    console.log("⏱ Admin live timers started");

    setInterval(() => {

        Object.keys(window.adminLiveUsers).forEach(id => {

            const el = document.getElementById(`timer-${id}`);
            if (!el) return;

            const u = window.adminLiveUsers[id];
            const { work, breakT, away } = computeLiveAdminTimers(u);

            el.innerHTML = `
                Work: ${formatTime(work)}<br>
                Break: ${formatTime(breakT)}<br>
                Away: ${formatTime(away)}
            `;
        });

    }, 1000);
}


// ===========================================
// STATISTICS PANEL — LIVE "ACTIVE"/"IDLE" TICK
// ===========================================
// loadStatisticsPanel() only re-queries Firestore every 10s (or on
// manual refresh). This ticks the displayed Active/Idle numbers every
// second in between, using the staticTime/liveStart cached per user,
// so it moves in real time just like the employee's own page does.

window.statsLiveData = window.statsLiveData || {};

function startStatsLiveTimer() {

    console.log("⏱ Statistics live timer started");

    setInterval(() => {

        Object.keys(window.statsLiveData).forEach(id => {

            const data = window.statsLiveData[id];

            const activeEl = document.getElementById(`stat-active-${id}`);
            const idleEl = document.getElementById(`stat-idle-${id}`);

            if (!activeEl && !idleEl) return;

            const liveShiftTime =
                data.staticTime + (data.liveStart ? (Date.now() - data.liveStart) : 0);

            if (activeEl) {
                activeEl.textContent = formatTime(liveShiftTime);
            }

            if (idleEl) {
                const idleRatio = liveShiftTime > 0
                    ? (data.breakTime + data.awayTime) / liveShiftTime
                    : 0;

                idleEl.textContent = `${(idleRatio * 100).toFixed(1)}%`;
            }
        });

    }, 1000);
}


// ===========================================
// BIG ADMIN STATUS LISTENER (NEW FIX)
// ===========================================

function startAdminBigStatusListener() {

    db.collection("users").doc("A000")
        .onSnapshot(doc => {

            const u = doc.data();
            if (!u) return;

            const el = $("adminStatusText");

            if (!el) return;

            el.textContent =
                u.adminStatus === "Online"
                    ? "🟢 Online"
                    : "🔴 Offline";

            el.className =
                "status " + (u.adminStatus === "Online" ? "onDuty" : "offDuty");
        });
}


// ===========================================
// ADMIN ACTIONS
// ===========================================

window.setUserStatus = async (id, status) => {

    if (!window.hasPermission?.("canManageEmployees")) {
        alert("You don't have permission to change employee status.");
        return;
    }

    // prevent frozen user from changing anything except Off Duty
if (id !== "A000") {

    const userDoc = await db.collection("users").doc(id).get();
    const u = userDoc.data();

    if (u?.frozen) {

        if (status !== "Off Duty") {
            alert("User is frozen");
            return;
        }
    }
}

    await db.collection("users").doc(id).set({
        status: status,
        lastChange: Date.now()
    }, { merge: true });

    // 🔥 AUDIT FIX
    logAudit(id, "Status Changed", status);
};

window.resetUser = async (id) => {

    if (!window.hasPermission?.("canManageEmployees")) {
        alert("You don't have permission to reset employees.");
        return;
    }

    await db.collection("users").doc(id).set({
        work: 0,
        breakT: 0,
        away: 0,
        status: "Off Duty",
        lastSwitchTime: Date.now(),
        lastChange: Date.now()
    }, { merge: true });

    // 🔥 AUDIT FIX
    logAudit(id, "Timers Reset", "All timers cleared");
};

window.clearUserStats = async function (userId) {

    if (!window.hasPermission?.("canViewStatistics")) {
        alert("You don't have permission to manage statistics.");
        return;
    }

    if (!confirm(
        `Clear ALL stats for ${userId}?\n\n` +
        "This permanently deletes their shift history and overtime history " +
        "(Total Work / Break / Away / Loads / Overtime will all reset to 0). " +
        "This cannot be undone."
    )) return;

    try {

        const shiftSnap = await db.collection("shiftHistory")
            .where("user", "==", userId)
            .get();

        const batch = db.batch();

        shiftSnap.forEach(doc => batch.delete(doc.ref));

        batch.set(db.collection("users").doc(userId), {
            overtimeHistory: []
        }, { merge: true });

        await batch.commit();

        if (typeof logAudit === "function") {
            await logAudit(
                window.RelayDesk?.currentUser || "A000",
                "USER_STATS_CLEARED",
                `${userId} stats reset to zero`
            );
        }

        alert(`Stats cleared for ${userId} ✔`);

        renderUserDrilldown(userId);

    } catch (err) {
        console.error("Clear user stats failed:", err);
        alert("Failed to clear stats.");
    }
};

window.deleteUser = async (id) => {

    // Deliberately Owner+A000 only (not canManageEmployees) — account
    // deletion is more sensitive than the everyday employee-management
    // actions that permission covers.
    if (!window.isOwnerOrAbove?.()) {
        alert("You don't have permission to delete employees.");
        return;
    }

    if (!confirm(window.I18N ? window.I18N.t("admin.confirmDeleteUser", { id: id }) : "Delete user " + id + "?")) return;

    await db.collection("users").doc(id).delete();

    // 🔥 AUDIT FIX
    logAudit(id, "User Deleted", "Account removed");
};

// =====================================
// SHOW/HIDE ONE EMPLOYEE'S PIN/PASSWORD
// =====================================
// Masked (dots) by default, per employee — the admin list otherwise
// shows every employee's PIN/password in plain text at all times.
// Kept as a plain Set (not per-card local state) so it survives the
// user card list being torn down and rebuilt on every live snapshot
// update — the render below just checks membership each time it draws
// a card. Toggling also updates the DOM directly for instant feedback,
// since the next live re-render might not fire right away.
window.adminRevealedPins = window.adminRevealedPins || new Set();

window.toggleAdminPinVisibility = function (id) {

    const set = window.adminRevealedPins;
    const nowRevealed = !set.has(id);

    if (nowRevealed) set.add(id);
    else set.delete(id);

    const span = document.getElementById(`adminPinValue-${id}`);
    const btn = document.getElementById(`adminPinToggleBtn-${id}`);

    if (span) span.classList.toggle("revealed", nowRevealed);
    if (btn) btn.textContent = nowRevealed ? "🙈" : "👁️";
};

window.resetUserPin = async (id) => {

    if (!window.hasPermission?.("canManageEmployees")) {
        alert("You don't have permission to reset PINs.");
        return;
    }

    if (!confirm(window.I18N ? window.I18N.t("admin.confirmResetPin", { id: id }) : "Reset PIN for " + id + "? They'll be asked to set a new one at next login.")) return;

    // ===== LOGIN CHANGES (Phase 9) =====
    // Blank the PIN instead of the Admin picking one — the employee
    // sets their own new PIN via the same first-time-PIN branch in
    // login() that brand-new accounts already use. Clears the request
    // flag too, since it's now been actioned.
    await db.collection("users").doc(id).set({
        pin: null,
        pinWasReset: true,
        pinResetRequested: false,
        pinResetRequestedAt: null
    }, { merge: true });

    // 🔥 AUDIT FIX
    logAudit(id, "PIN Reset", "PIN blanked — employee will set a new one at next login");

    alert("PIN reset for " + id + ". They'll set a new one at their next login.");
};

function loadShiftHistory() {

    const container = document.getElementById("shiftHistoryList");
    if (!container) return;

    db.collection("shiftHistory")
        .orderBy("date", "desc")
        .get()
        .then(snapshot => {

            const grouped = {};

            snapshot.forEach(doc => {

                const data = doc.data();

                if (!grouped[data.date]) {
                    grouped[data.date] = {};
                }

                if (!grouped[data.date][data.user]) {
                    grouped[data.date][data.user] = [];
                }

                grouped[data.date][data.user].push(data);
            });

            container.innerHTML = "";

            Object.keys(grouped).forEach(date => {

                const dateBlock = document.createElement("div");
                dateBlock.className = "auditGroup";

                let usersHTML = "";

                Object.keys(grouped[date]).forEach(user => {

                    const shifts = grouped[date][user];

                    const shiftHTML = shifts.map(s => {

    const duration = s.shiftDuration || "Active";

    return `
    <div 
        class="auditItem shiftBlock"
        data-shift-id="${s.shiftId || s.startTime}"
        data-user="${user}"
    >
            <b>Start:</b> ${new Date(s.startTime).toLocaleTimeString()}<br>
            <b>End:</b> ${s.endTime ? new Date(s.endTime).toLocaleTimeString() : "Active"}<br>
            <b>Duration:</b> ${duration}<br>
            <b>Work:</b> ${s.workTime || "--:--:--"}<br>
            <b>Break:</b> ${s.breakTime || "--:--:--"}<br>
            <b>Away:</b> ${s.awayTime || "--:--:--"}<br>
            <b>Status:</b> ${s.status}<br>
            <b>Loads:</b>
<span 
    class="clickableLoads" 
    onclick="toggleShiftLoads('${s.shiftId || s.startTime}')"
>
    ${getShiftLoadCount(s)}
</span>
<br>
            <b>Notes:</b> ${s.metrics?.notesWritten ? "Yes" : "No"}
        </div>
    `;
}).join("");

                    usersHTML += `
                        <div class="auditHeader">
                            👤 ${user}
                        </div>
                        <div class="auditDropdown open">
                            ${shiftHTML}
                        </div>
                    `;
                });

                dateBlock.innerHTML = `
                    <div class="auditHeader" onclick="this.nextElementSibling.classList.toggle('open')">
                        📅 ${date}
                    </div>
                    <div class="auditDropdown">
                        ${usersHTML}
                    </div>
                `;

                container.appendChild(dateBlock);
            });
        });
}

async function rebuildActiveShiftHistory() {

    const users = await db.collection("users").get();

    for (const doc of users.docs) {

        const u = doc.data();

        // Only active shift statuses
        if (!["On Duty", "Break", "Away"].includes(u.status))
            continue;

        if (!u.shiftId || !u.shiftStart)
            continue;

        const ref = db.collection("shiftHistory").doc(u.shiftId);

        const existing = await ref.get();

        // Already exists
        if (existing.exists)
            continue;

        await ref.set({
            shiftId: u.shiftId,
            user: doc.id,
            date: new Date(u.shiftStart)
                .toISOString()
                .split("T")[0],

            startTime: u.shiftStart,
            endTime: null,
            status: "active",

            work: u.work || 0,
            break: u.breakT || 0,
            away: u.away || 0,

            metrics: {
                bookedLoads: (u.bookedLoads || []).length,
                notesWritten: !!(u.notes && u.notes.trim()),
                endedEarly: false
            }

        });

        console.log("♻ Rebuilt shift:", u.shiftId);
    }
}

window.exportShiftHistory = async function () {

    if (!window.hasPermission?.("canExportHistory")) {
        alert("You don't have permission to export shift history.");
        return;
    }

    const snapshot = await db.collection("shiftHistory")
        .orderBy("date", "desc")
        .get();

    let output = "===== RELAYDESK SHIFT HISTORY EXPORT =====\n\n";

    let currentDate = "";

    snapshot.forEach(doc => {

        const s = doc.data();

        if (s.date !== currentDate) {
            currentDate = s.date;
            output += `\n📅 DATE: ${currentDate}\n`;
            output += "---------------------------------\n";
        }

        const start = s.startTime
            ? new Date(s.startTime).toLocaleTimeString()
            : "N/A";

        const end = s.endTime
            ? new Date(s.endTime).toLocaleTimeString()
            : "Active";

        const duration = s.shiftDuration || "Active";

        const work = s.workTime || "--:--:--";
        const brk = s.breakTime || "--:--:--";
        const away = s.awayTime || "--:--:--";

        const loads = getShiftLoadCount(s);
        const notes = s.metrics?.notesWritten ? "Yes" : "No";

        output += `
👤 User: ${s.user}
Start: ${start}
End: ${end}
Duration: ${duration}
Work: ${work}
Break: ${brk}
Away: ${away}
Status: ${s.status}
Loads: ${loads}
Notes: ${notes}
---------------------------------
`;
    });

    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `shift-history-export-${Date.now()}.txt`;
    a.click();

    URL.revokeObjectURL(url);

    logAudit(RelayDesk.currentUser, "EXPORT_SHIFT_HISTORY", "Downloaded TXT export");
};

window.toggleShiftLoads = async function(shiftIdOrTime) {

    const el = document.getElementById(`loads-${shiftIdOrTime}`);

    // already open → close it
    if (el) {
        el.remove();
        return;
    }

    // find shift block so we know where to attach the results
    const container = document.querySelector(`[data-shift-id="${shiftIdOrTime}"]`);
    if (!container) return;

    // the drilldown panel prefixes its shift ids with "drill-" so its
    // DOM elements never collide with the main Shift History list —
    // strip that prefix to get the real shiftHistory document id
    const realShiftId = shiftIdOrTime.replace(/^drill-/, "");

    // pull the permanent load ledger straight off THAT shift's own
    // record — not the employee's current/live workspace loads — so
    // old shifts always show what actually happened that day, even
    // for loads that have since been deleted from the workspace
    const shiftDoc = await db.collection("shiftHistory").doc(realShiftId).get();
    const shiftData = shiftDoc.data() || {};
    const shiftLoads = Array.isArray(shiftData.loadsLog) ? shiftData.loadsLog : [];

    const wrapper = document.createElement("div");
    wrapper.id = `loads-${shiftIdOrTime}`;
    wrapper.className = "shiftLoadsBox";

    // Phase 2 item 4: grouped Department -> Driver -> VRID Type -> Loads
    // tree via the shared renderLoadsGroupedHTML() helper above (same
    // one used by the Stats panel and Analytics drilldown breakdowns).
    wrapper.innerHTML = renderLoadsGroupedHTML(shiftLoads);

    container.appendChild(wrapper);
};

async function loadStatisticsPanel() {

    const totalEl = document.getElementById("statsTotalLoads");
    const activeEl = document.getElementById("statsActiveUsers");
    const perUserEl = document.getElementById("statsPerUser");

    if (!totalEl || !activeEl || !perUserEl) return;

    // Phase 2 follow-up: make the Total Loads line clickable to reveal
    // the grouped Department -> Driver -> VRID breakdown. Re-assigning
    // onclick/class here is harmless — it's idempotent and this
    // function already re-runs on every refresh.
    totalEl.classList.add("clickableLoads");
    totalEl.onclick = window.toggleStatsLoadsBreakdown;

    const usersSnap = await db.collection("users").get();
    const shiftSnap = await db.collection("shiftHistory").get();

    let totalLoads = 0;
    let activeUsers = 0;

    const perUser = {};

    // Phase 2 follow-up: every still-active load seen during this
    // scan, so the "Total Loads" header can show a grouped
    // Department -> Driver -> VRID breakdown on click instead of just
    // a number.
    const allActiveLoads = [];

    // =========================
    // USERS (STATUS + ACTIVE)
    // =========================
    usersSnap.forEach(doc => {

        const u = doc.data();

        if (u.role === "Safety Employee") return;

        if (u.status && u.status !== "Off Duty") {
            activeUsers++;
        }

        if (!perUser[doc.id]) {
            perUser[doc.id] = {
                id: doc.id,
                loads: 0,
                status: u.status || "Off Duty",
                shiftTime: 0,
                breakTime: 0,
                awayTime: 0,
                staticTime: 0,
                liveStart: null
            };
        } else {
            perUser[doc.id].status = u.status;
        }
    });

    // =========================
    // SHIFT AGGREGATION (TRUTH SOURCE)
    // =========================
    shiftSnap.forEach(doc => {

        const s = doc.data();
        const user = s.user;
        if (!user) return;

        // respect "Clear Stats" — skip anything before the baseline
        if ((s.startTime || 0) < statsBaseline) return;

        const start = s.startTime || 0;
        const end = s.endTime || Date.now();

        const duration = end - start;

        const loads = getShiftLoadCount(s);

        totalLoads += loads;

        if (Array.isArray(s.loadsLog)) {
            s.loadsLog.filter(l => l.active !== false).forEach(l => allActiveLoads.push(l));
        }

        if (!perUser[user]) {
            perUser[user] = {
                id: user,
                loads: 0,
                status: "Off Duty",
                shiftTime: 0,
                breakTime: 0,
                awayTime: 0,
                staticTime: 0,
                liveStart: null
            };
        }

        perUser[user].loads += loads;
        perUser[user].shiftTime += duration;
        perUser[user].breakTime += (s.breakT || 0);
        perUser[user].awayTime += (s.away || 0);

        // completed shifts feed the static baseline; a shift with no
        // endTime is still running, so remember its start so we can
        // tick it forward live every second instead of re-querying
        if (s.endTime) {
            perUser[user].staticTime += duration;
        } else {
            perUser[user].liveStart = start;
        }
    });

    // =========================
    // DERIVED STATS
    // =========================
    const usersArr = Object.values(perUser).map(u => {

        const total = u.shiftTime || 1;
        const idle = (u.breakTime + u.awayTime) / total;

        return {
            ...u,
            idleRatio: idle
        };
    });

    // =========================
    // SUMMARY STATS (TOPS)
    // =========================
    const topLoads = [...usersArr].sort((a, b) => b.loads - a.loads)[0];
    const topActive = [...usersArr].sort((a, b) => b.shiftTime - a.shiftTime)[0];
    const mostIdle = [...usersArr].sort((a, b) => b.idleRatio - a.idleRatio)[0];

    // =========================
    // HEADER STATS
    // =========================
    totalEl.textContent = `📦 Total Loads: ${totalLoads}`;
    activeEl.textContent = `🟢 Active Users: ${activeUsers}`;

    // =========================
    // USER LIST (CLICKABLE DRILLDOWN)
    // =========================

    window.statsLiveData = window.statsLiveData || {};

    perUserEl.innerHTML = usersArr
        .sort((a, b) => b.loads - a.loads)
        .map(u => {

            // cache the pieces needed to tick "Active"/"Idle" live,
            // without hitting Firestore every second
            window.statsLiveData[u.id] = {
                staticTime: u.staticTime || 0,
                liveStart: u.liveStart || null,
                breakTime: u.breakTime || 0,
                awayTime: u.awayTime || 0
            };

            return `
                <div class="statUserRow" onclick="openUserDrilldown('${u.id}')">
                    <b>${u.id}</b>
                    <span>${u.status}</span><br>

                    📦 Loads: ${u.loads}<br>
                    🕒 Active: <span id="stat-active-${u.id}">${formatTime(u.shiftTime)}</span><br>
                    😴 Idle: <span id="stat-idle-${u.id}">${(u.idleRatio * 100).toFixed(1)}%</span>
                </div>
            `;
        }).join("");

    // drop cached users who no longer exist so the live loop doesn't
    // keep updating stale/removed entries
    Object.keys(window.statsLiveData).forEach(id => {
        if (!usersArr.find(u => u.id === id)) delete window.statsLiveData[id];
    });

    // =========================
    // TOP SUMMARY LINE (clean)
    // =========================
    statsAllActiveLoads = allActiveLoads;

    document.getElementById("statsTotalLoads").innerText =
        `📦 Total Loads: ${totalLoads} | 🏆 Top: ${topLoads?.id || "-"} (click to view breakdown)`;

    document.getElementById("statsActiveUsers").innerText =
        `🟢 Active Users: ${activeUsers} | 🏆 Most Active: ${topActive?.id || "-"}`;

    // if the breakdown panel is currently open, refresh its contents
    // in place so it doesn't go stale until the next manual toggle
    const breakdownEl = document.getElementById("statsLoadsBreakdown");
    if (breakdownEl && !breakdownEl.classList.contains("hidden")) {
        breakdownEl.innerHTML = renderLoadsGroupedHTML(statsAllActiveLoads);
    }
}

// Phase 2 follow-up: toggles the company-wide grouped Department ->
// Driver -> VRID breakdown under the Statistics panel's "Total Loads"
// line. Reuses whatever loadStatisticsPanel() already collected on its
// last pass instead of re-querying Firestore on click.
window.toggleStatsLoadsBreakdown = function () {

    const el = document.getElementById("statsLoadsBreakdown");
    if (!el) return;

    if (!el.classList.contains("hidden")) {
        el.classList.add("hidden");
        return;
    }

    el.innerHTML = renderLoadsGroupedHTML(statsAllActiveLoads);
    el.classList.remove("hidden");
};

async function calculateAdminStats() {

    const snapshot = await db.collection("shiftHistory").get();

    const stats = {};

    snapshot.forEach(doc => {

        const s = doc.data();
        const user = s.user;

        // respect "Clear Stats" — skip anything before the baseline
        if ((s.startTime || 0) < statsBaseline) return;

        if (!stats[user]) {
            stats[user] = {
                totalWork: 0,
                totalBreak: 0,
                totalAway: 0,
                totalLoads: 0,
                shiftCount: 0
            };
        }

        // SHIFT TIME
        const start = s.startTime || 0;
        const end = s.endTime || Date.now();

        const duration = end - start;

        stats[user].shiftCount++;
        stats[user].totalWork += s.work || 0;
        stats[user].totalBreak += s.breakT || 0;
        stats[user].totalAway += s.away || 0;

        stats[user].totalLoads += getShiftLoadCount(s);

        stats[user].lastShiftDuration = duration;
    });

    return stats;
}

async function renderAdminStats() {

    const stats = await calculateAdminStats();

    const container = document.getElementById("statsPerUser");
    if (!container) return;

    container.innerHTML = "";

    let topActive = null;
    let topLoads = null;
    let mostIdle = null;

    Object.keys(stats).forEach(user => {

        const u = stats[user];

        const totalTime = u.totalWork + u.totalBreak + u.totalAway;

        const idleRatio = totalTime > 0
            ? u.totalAway / totalTime
            : 0;

        // MOST ACTIVE (work time)
        if (!topActive || u.totalWork > topActive.totalWork) {
            topActive = { user, ...u };
        }

        // MOST LOADS
        if (!topLoads || u.totalLoads > topLoads.totalLoads) {
            topLoads = { user, ...u };
        }

        // MOST IDLE
        if (!mostIdle || idleRatio > mostIdle.ratio) {
            mostIdle = { user, ratio: idleRatio };
        }

        const card = document.createElement("div");
        card.className = "statUserRow";

        card.innerHTML = `
            <b>${user}</b><br>
            Work: ${formatTime(u.totalWork)}<br>
            Break: ${formatTime(u.totalBreak)}<br>
            Away: ${formatTime(u.totalAway)}<br>
            Loads: ${u.totalLoads}
        `;

        container.appendChild(card);
    });

    // TOP SUMMARY
    document.getElementById("statsTotalLoads").innerText =
        `Top Loads: ${topLoads?.user || "-"} (${topLoads?.totalLoads || 0})`;

    document.getElementById("statsActiveUsers").innerText =
        `Most Active: ${topActive?.user || "-"} (${formatTime(topActive?.totalWork || 0)})`;
}


window.exportAdminStats = async function () {

    if (!window.hasPermission?.("canExportHistory")) {
        alert("You don't have permission to export statistics.");
        return;
    }

    const usersSnap = await db.collection("users").get();
    const shiftSnap = await db.collection("shiftHistory").get();

    let csv =
"USER, LAST RECORDED STATUS, LOADS, SHIFT TIME (hrs), IDLE (%)\n";

    const map = {};

    usersSnap.forEach(doc => {
        map[doc.id] = {
            status: doc.data().status || "Off Duty",
            loads: 0,
            shift: 0,
            breakT: 0,
            away: 0
        };
    });

    shiftSnap.forEach(doc => {

        const s = doc.data();
        const u = map[s.user];

        if (!u) return;

        const start = s.startTime || 0;
        const end = s.endTime || Date.now();

        u.shift += (end - start);
        u.loads += (getShiftLoadCount(s));
        u.breakT += (s.breakT || 0);
        u.away += (s.away || 0);
    });

    Object.entries(map).forEach(([id, u]) => {

        const idle = (u.breakT + u.away) / (u.shift || 1);

        const shiftHours = (u.shift / 3600000).toFixed(2);
const idlePercent = (idle * 100).toFixed(1);

csv += `${id}, ${u.status}, ${u.loads}, ${shiftHours} hrs, ${idlePercent}%\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `relaydesk-stats-${Date.now()}.csv`;
    a.click();

    URL.revokeObjectURL(url);
};

// Step 1 (live drilldown sync): mirrors timers.js's own-view live calc
// exactly — base totals as last written to Firestore, plus elapsed
// time in whichever bucket matches the current status. Firestore only
// gets a fresh work/breakT/away/lastSwitchTime write on each status
// change (see status.js "SAVE USER STATE"), so this local tick is what
// makes the admin view count up smoothly in between those writes,
// same as the employee's own screen does.
function renderDrillLiveSection(u) {

    const section = document.getElementById("drillLiveSection");
    if (!section || !u) return;

    const now = Date.now();

    let work = u.work || 0;
    let breakT = u.breakT || 0;
    let away = u.away || 0;

    const elapsed = u.lastSwitchTime ? Math.max(0, now - u.lastSwitchTime) : 0;

    if (u.status === "On Duty") work += elapsed;
    if (u.status === "Break") breakT += elapsed;
    if (u.status === "Away") away += elapsed;

    section.innerHTML = `
        <h4>📡 Live Status</h4>
        <div>Status: ${u.status}${(u.autoIdleStatus && u.autoIdleStatus === u.status) ? ' <span class="autoIdleBadge">Auto Idle</span>' : ""}</div>
        <div>Role: ${u.role}</div>
        <div>Shift ID: ${u.shiftId || "N/A"}</div>
        <div class="drillLiveTimers">
            <span>🟢 Work: ${formatTime(work)}</span>
            <span>🟡 Break: ${formatTime(breakT)}</span>
            <span>🟣 Away: ${formatTime(away)}</span>
        </div>
        <button class="dangerBtn" onclick="clearUserStats('${u.id}')" style="margin-top:8px;">
            🗑️ Clear Stats for ${u.id}
        </button>
    `;
}

let drillHistoryStack = [];

// Step 1 (live drilldown sync): scoped single-doc listener + local
// ticking interval for whichever user's drilldown panel is currently
// open. Additive only — does not touch the existing global `users`
// listener in presence.js or colleagues.js.
let drillLiveUnsub = null;
let drillLiveInterval = null;
let drillLiveUserData = null;

function teardownDrillLive() {
    if (typeof drillLiveUnsub === "function") drillLiveUnsub();
    drillLiveUnsub = null;

    if (drillLiveInterval) clearInterval(drillLiveInterval);
    drillLiveInterval = null;

    drillLiveUserData = null;
}

window.openUserDrilldown = async function(userId) {

    // Safety filter
    const userDoc = await db.collection("users").doc(userId).get();
    const u = userDoc.data();

    if (!u) return;

    // store navigation stack
    drillHistoryStack.push(userId);

    const panel = document.getElementById("userDrillPanel");
    panel.classList.remove("hidden");

    document.getElementById("drillUserTitle").innerText =
        `👤 ${userId} Analytics`;

    renderUserDrilldown(userId);

    // Tear down any previous target's listener/interval before wiring
    // up this one (covers both re-opening and drilling into a
    // different user without closing first).
    teardownDrillLive();

    drillLiveUnsub = db.collection("users").doc(userId).onSnapshot(doc => {
        const data = doc.data();
        if (!data) return;
        drillLiveUserData = { id: userId, ...data };
        renderDrillLiveSection(drillLiveUserData);
    });

    // Ticks the display every second between Firestore writes, using
    // the exact same base + (now - lastSwitchTime) formula timers.js
    // uses for the employee's own view — so admin sees the same live
    // count, not just an update on every status change.
    drillLiveInterval = setInterval(() => {
        if (drillLiveUserData) renderDrillLiveSection(drillLiveUserData);
    }, 1000);
};

window.closeUserDrilldown = function() {
    document.getElementById("userDrillPanel").classList.add("hidden");
    drillHistoryStack = [];
    teardownDrillLive();
};

window.toggleOvertimeHistory = function (userId) {
    document.getElementById(`overtimeHistoryList-${userId}`)?.classList.toggle("hidden");
};

// Phase 2 follow-up: toggles the aggregated Department -> Driver ->
// VRID breakdown under a user's "Total Loads" stat in the Analytics
// drilldown — covers ALL of that user's shifts, not just one.
window.toggleUserLoadsBreakdown = function (userId) {

    const el = document.getElementById(`drillLoadsBreakdown-${userId}`);
    if (!el) return;

    if (!el.classList.contains("hidden")) {
        el.classList.add("hidden");
        return;
    }

    const loads = window._drillLoadsCache?.[userId] || [];
    el.innerHTML = renderLoadsGroupedHTML(loads);
    el.classList.remove("hidden");
};

async function renderUserDrilldown(userId) {

    const userRef = await db.collection("users").doc(userId).get();
    const u = userRef.data();

    const shiftSnap = await db.collection("shiftHistory")
        .where("user", "==", userId)
        .get();

    let totalWork = 0;
    let totalBreak = 0;
    let totalAway = 0;
    let totalLoads = 0;

    const shifts = [];

    // Phase 2 follow-up: every still-active load across ALL of this
    // user's shifts, aggregated so the drilldown's "Total Loads" can
    // show a grouped Department -> Driver -> VRID breakdown, not just
    // the per-shift "View Loads" breakdown that already existed.
    const userAllActiveLoads = [];

let shiftCount = 0;
let totalShiftTime = 0;

    shiftSnap.forEach(doc => {

        const s = doc.data();

        shiftCount++;

const start = s.startTime || 0;
const end = s.endTime || Date.now();

totalShiftTime += (end - start);

        totalWork += s.work || 0;
        totalBreak += s.breakT || 0;
        totalAway += s.away || 0;
        totalLoads += getShiftLoadCount(s);

        if (Array.isArray(s.loadsLog)) {
            s.loadsLog.filter(l => l.active !== false).forEach(l => userAllActiveLoads.push(l));
        }

        shifts.push(s);
    });

    // =========================
    // LIVE SECTION
    // =========================
    // Initial paint from the one-shot fetch above, so there's no blank
    // flash before the onSnapshot listener (wired in openUserDrilldown)
    // delivers its first update a moment later.

    renderDrillLiveSection({ id: userId, ...u });

    // =========================
    // OVERTIME
    // =========================

    const overtimeHistory = u.overtimeHistory || [];
    const otSection = document.getElementById("drillOvertimeSection");

    if (otSection) {

        otSection.innerHTML = `
            <h4>🕐 Overtime</h4>
            <div class="drillStat clickableLoads" onclick="toggleOvertimeHistory('${userId}')">
                Overtime: ${overtimeHistory.length} ${overtimeHistory.length === 1 ? "time" : "times"} (click to view)
            </div>
            <div id="overtimeHistoryList-${userId}" class="hidden">
                ${overtimeHistory.length
                    ? overtimeHistory.map(o => {
                        // Legacy entries from before this workflow change
                        // (approved-but-not-yet-worked placeholder) —
                        // kept as-is for old data that never got
                        // reconciled.
                        if (o.pending && !o.overtimeReviewStatus) {
                            return `
                        <div class="alertRow">
                            <b>${o.date}</b> — Approved (not yet worked)
                        </div>
                    `;
                        }
                        const reviewLabels = {
                            pending: " — ⏳ Pending review",
                            approved: " — ✅ Approved",
                            denied: " — ❌ Denied (not counted)"
                        };
                        const reviewLabel = reviewLabels[o.overtimeReviewStatus] || "";
                        return `
                        <div class="alertRow">
                            <b>${o.date}</b> — ${formatTime(o.durationMs || 0)}${reviewLabel}
                        </div>
                    `;
                    }).join("")
                    : `<div class="workspaceEmpty">No overtime recorded.</div>`
                }
            </div>
        `;
    }

    // =========================
    // CORE STATS
    // =========================

    // Phase 2 follow-up: cache this user's aggregated active loads so
    // toggleUserLoadsBreakdown() can render them without re-querying.
    window._drillLoadsCache = window._drillLoadsCache || {};
    window._drillLoadsCache[userId] = userAllActiveLoads;

    document.getElementById("drillStatsSection").innerHTML = `

    <h4>📊 Core Statistics</h4>

    <div class="drillStat">
    <b>Total Shift Time</b><br>
    ${formatTime(totalShiftTime)}
    </div>

    <div class="drillStat">
    <b>Total Work</b><br>
    ${formatTime(totalWork)}
    </div>

    <div class="drillStat">
    <b>Total Break</b><br>
    ${formatTime(totalBreak)}
    </div>

    <div class="drillStat">
    <b>Total Away</b><br>
    ${formatTime(totalAway)}
    </div>

    <div class="drillStat">
    <b>Total Shifts</b><br>
    ${shiftCount}
    </div>

    <div class="drillStat${u.role === "Safety Employee" ? "" : " clickableLoads"}"
        ${u.role === "Safety Employee" ? "" : `onclick="toggleUserLoadsBreakdown('${userId}')"`}>
    <b>Total Loads</b><br>
    ${u.role === "Safety Employee"
    ? "N/A (Safety)"
    : `${totalLoads} (click to view breakdown)`}
    </div>

    <div id="drillLoadsBreakdown-${userId}" class="hidden loadsBreakdownBox"></div>

    `;

    // =========================
    // SHIFT STACK
    // =========================

    const stackEl = document.getElementById("drillShiftStack");

    stackEl.innerHTML = `<h4>📅 Shift History (${shiftCount})</h4>`;

    shifts.forEach(s => {

        const idleRatio =
            (s.away || 0) /
            ((s.work || 1) + (s.breakT || 1) + (s.away || 1));

        const div = document.createElement("div");
        div.className = "shiftBlock";
        div.setAttribute("data-shift-id", "drill-" + (s.shiftId || s.startTime));
        div.setAttribute("data-user", userId);

        div.innerHTML = `
            <b>${new Date(s.startTime).toLocaleDateString()}</b><br>
            ${s.offDayShift ? `<div class="offTodayBadge">📴 Off-Day Shift — Overtime: ${formatTime(s.overtimeMs || 0)}</div>` : ""}
            Work: ${formatTime(s.work || 0)}<br>
            Break: ${formatTime(s.breakT || 0)}<br>
            Away: ${formatTime(s.away || 0)}<br>
            Loads: ${getShiftLoadCount(s)}<br>
            Idle: ${(idleRatio * 100).toFixed(1)}%
            <hr>
            <span class="clickableLoads"
                onclick="toggleShiftLoads('drill-${s.shiftId || s.startTime}')">
                View Loads
            </span>
        `;

        stackEl.appendChild(div);
    });
}

