// ===========================================
// RelayDesk
// admin-extras.js
// Audit filters + Admin-added employees + Idle/Lateness alerts
// ===========================================

let adminExtrasInitialized = false;

function initAdminExtras() {

    if (adminExtrasInitialized) return;
    adminExtrasInitialized = true;

    bindAuditFilters();
    bindAddEmployeeForm();
    bindPermissionsEditor();
    initOvertimeAdmin();
    initOffDayChangeAdmin();

    console.log("🧩 Admin extras ready (filters / add-employee / permissions / alerts)");
}

// hook into the same startup path admin.js uses
window.addEventListener("DOMContentLoaded", () => {
    // initAuditSystem() (auth.js -> startSession, admin branch) already
    // runs initializeAdmin(); we piggyback shortly after so the DOM
    // elements exist by the time we bind to them.
    // ===== PERMISSION SYSTEM =====
    // this used to only ever fire for A000 — now it fires for any
    // permission-elevated employee who lands in the Admin Panel too
    const check = setInterval(() => {
        if (window.hasAdminAccess?.()) {
            initAdminExtras();
            clearInterval(check);
        }
    }, 400);
});


// ===========================================
// AUDIT LOG FILTERS
// ===========================================

let allAuditLogsCache = [];

function bindAuditFilters() {

    const userSel = document.getElementById("auditFilterUser");
    const actionSel = document.getElementById("auditFilterAction");
    const fromInput = document.getElementById("auditFilterFrom");
    const toInput = document.getElementById("auditFilterTo");
    const applyBtn = document.getElementById("auditFilterApplyBtn");
    const clearBtn = document.getElementById("auditFilterClearBtn");

    if (!userSel || !actionSel || !applyBtn) return;

    // ===== PERMISSION SYSTEM =====
    // hide the entire audit filter/log UI from anyone who wasn't
    // granted canViewAudit (A000 always passes via hasPermission)
    if (!window.hasPermission?.("canViewAudit")) {
        const auditSection = document.getElementById("auditLog")?.closest(".auditHeaderBar");
        if (auditSection) auditSection.classList.add("hidden");
        return;
    }

    applyBtn.onclick = () => {
        renderFilteredAuditLogs({
            user: userSel.value,
            action: actionSel.value,
            from: fromInput.value ? new Date(fromInput.value).getTime() : null,
            to: toInput.value ? new Date(toInput.value + "T23:59:59").getTime() : null
        });
    };

    if (clearBtn) {
        clearBtn.onclick = () => {
            userSel.value = "";
            actionSel.value = "";
            fromInput.value = "";
            toInput.value = "";
            loadAuditLogs(); // restore the default unfiltered view
        };
    }

    // keep filter dropdowns populated as logs stream in
    db.collection("auditLogs")
        .orderBy("time", "desc")
        .limit(300)
        .onSnapshot(snapshot => {

            allAuditLogsCache = [];
            const users = new Set();
            const actions = new Set();

            snapshot.forEach(doc => {
                const l = doc.data();
                allAuditLogsCache.push(l);
                if (l.user) users.add(l.user);
                if (l.action) actions.add(l.action);
            });

            populateSelect(userSel, users);
            populateSelect(actionSel, actions);
        });
}

function populateSelect(select, valuesSet) {

    const current = select.value;
    const first = select.options[0]; // "All ..." option

    select.innerHTML = "";
    select.appendChild(first);

    Array.from(valuesSet).sort().forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
    });

    select.value = current || "";
}

function renderFilteredAuditLogs(filters) {

    const box = document.getElementById("auditLog");
    if (!box) return;

    const filtered = allAuditLogsCache.filter(l => {

        if (filters.user && l.user !== filters.user) return false;
        if (filters.action && l.action !== filters.action) return false;
        if (filters.from && l.time < filters.from) return false;
        if (filters.to && l.time > filters.to) return false;

        return true;
    });

    if (!filtered.length) {
        box.innerHTML = `<div class="auditEmpty">No matching audit logs</div>`;
        return;
    }

    const grouped = {};

    filtered.forEach(l => {
        if (!grouped[l.user]) grouped[l.user] = [];
        grouped[l.user].push(l);
    });

    box.innerHTML = "";

    Object.keys(grouped).forEach(user => {

        const container = document.createElement("div");
        container.className = "auditGroup";

        const details = grouped[user].map(l => {
            const time = new Date(l.time).toLocaleString();
            return `
                <div class="auditItem">
                    <b>${l.action}</b>
                    <small>${l.detail || ""}</small>
                    <small>${time}</small>
                </div>
            `;
        }).join("");

        container.innerHTML = `
            <div class="auditHeader" onclick="this.nextElementSibling.classList.toggle('open')">
                👤 ${user} ▼
            </div>
            <div class="auditDropdown open">
                ${details}
            </div>
        `;

        box.appendChild(container);
    });
}


// ===========================================
// ADMIN-ADDED EMPLOYEES
// (pre-create an account instead of relying on first-login onboarding)
// ===========================================

function bindAddEmployeeForm() {

    const btn = document.getElementById("addEmployeeBtn");
    if (!btn) return;

    const levelSelect = document.getElementById("newEmpPermissionLevel");
    const permGrid = document.getElementById("newEmpPermissionGrid");
    const offDaysGrid = document.getElementById("newEmpOffDaysGrid");

    // populate the checkbox grid with the currently selected level's
    // preset, and keep it in sync whenever the level changes
    function refreshPermGrid() {
        const level = levelSelect?.value || "Employee";
        const preset = window.PERMISSION_PRESETS?.[level] || {};
        window.renderPermissionCheckboxes?.(permGrid, preset);
    }

    if (levelSelect && permGrid) {
        refreshPermGrid();
        levelSelect.onchange = refreshPermGrid;
    }

    if (offDaysGrid) {
        window.renderOffDayCheckboxes?.(offDaysGrid, []);
    }

    btn.onclick = async () => {

        // ===== LOGIN CHANGES (Phase 9) =====
        // Creating a new account is narrower than canManageEmployees —
        // only A000 / Owner-level users.
        if (!window.canCreateEmployeeAccounts?.()) {
            alert("You don't have permission to create employees.");
            return;
        }

        const codeInput = document.getElementById("newEmpCode");
        const roleInput = document.getElementById("newEmpRole");
        const pinInput = document.getElementById("newEmpPin");

        const code = (codeInput?.value || "").trim().toUpperCase();
        const role = roleInput?.value || "Not Set";
        const pin = (pinInput?.value || "").trim();

        const permissionLevel = levelSelect?.value || "Employee";
        const permissions = window.readPermissionCheckboxes?.(permGrid) || {};
        const weeklyOffDays = window.readOffDayCheckboxes?.(offDaysGrid) || [];

        if (!code) {
            alert("Enter an employee code");
            return;
        }

        // Any PIN/password length is accepted now, or leave it blank
        // entirely — if blank, the employee sets their own PIN (or
        // chooses to stay blank/no-PIN) on their first login.

        try {

            const ref = db.collection("users").doc(code);
            const existing = await ref.get();

            if (existing.exists) {
                alert(`${code} already exists.`);
                return;
            }

            await ref.set({
                pin: pin || null,        // if blank, employee sets it on first login
                status: "Off Duty",
                work: 0,
                breakT: 0,
                away: 0,
                lastSwitchTime: Date.now(),
                lastChange: Date.now(),
                adminStatus: "Not Authorized",
                role,
                weeklyOffDays,
                frozen: false,
                lastStatusBeforeFreeze: null,
                createdByAdmin: true,
                // ===== PERMISSION SYSTEM =====
                permissionLevel,
                permissions
            });

            await logAudit(RelayDesk.currentUser, "EMPLOYEE_CREATED", `${code} (${role}, ${permissionLevel})`);

            alert(`Employee ${code} created ✔`);

            codeInput.value = "";
            pinInput.value = "";
            if (levelSelect) levelSelect.value = "Employee";
            refreshPermGrid();
            if (offDaysGrid) window.renderOffDayCheckboxes?.(offDaysGrid, []);

        } catch (err) {
            console.error("Add employee failed:", err);
            alert("Failed to create employee.");
        }
    };
}


// ===========================================
// OVERTIME REQUESTS
// (third divider in the Alerts card — pending employee requests,
// with Approve/Deny. Approving lets status.js log the actual
// duration into the user's analytics once they End Shift.)
// ===========================================

let overtimeAdminInitialized = false;

function initOvertimeAdmin() {

    if (overtimeAdminInitialized) return;
    overtimeAdminInitialized = true;

    const box = document.getElementById("overtimeAlerts");
    if (!box) return;

    db.collection("overtimeRequests")
        .where("status", "==", "pending")
        .onSnapshot(snapshot => {

            if (snapshot.empty) {
                box.innerHTML = `<h4>🕐 Overtime Requests</h4><div class="workspaceEmpty">No pending requests 👍</div>`;
                return;
            }

            const rows = [];

            snapshot.forEach(doc => {
                const r = doc.data();
                rows.push(`
                    <div class="alertRow">
                        <b>${r.user}</b> — ${new Date(r.time).toLocaleString()}
                        <div><small>${escapeHtmlAdmin(r.reason || "")}</small></div>
                        <div class="modalButtons">
                            <button onclick="approveOvertimeRequest('${doc.id}')">✅ Approve</button>
                            <button onclick="denyOvertimeRequest('${doc.id}')">❌ Deny</button>
                        </div>
                    </div>
                `);
            });

            box.innerHTML = `<h4>🕐 Overtime Requests</h4>` + rows.join("");
        }, err => console.error("Overtime requests listener failed:", err));
}

window.approveOvertimeRequest = async function (reqId) {

    try {
        const reqRef = db.collection("overtimeRequests").doc(reqId);
        const reqSnap = await reqRef.get();
        const req = reqSnap.data();

        if (!req) return;

        const now = Date.now();

        await reqRef.set({
            status: "approved",
            approvedAt: now
        }, { merge: true });

        // Credit the employee's analytics right away instead of waiting
        // for them to actually work overtime and click End Shift — this
        // entry is marked "pending" and gets reconciled with the real
        // duration worked once the shift actually ends (see status.js).
        if (req.user) {
            await db.collection("users").doc(req.user).set({
                overtimeHistory: firebase.firestore.FieldValue.arrayUnion({
                    date: new Date().toISOString().split("T")[0],
                    durationMs: 0,
                    requestId: reqId,
                    shiftId: null,
                    pending: true
                })
            }, { merge: true });
        }

        if (typeof logAudit === "function") {
            await logAudit("A000", "OVERTIME_APPROVED", reqId);
        }
    } catch (err) {
        console.error("Approve overtime failed:", err);
    }
};

window.denyOvertimeRequest = async function (reqId) {

    try {
        await db.collection("overtimeRequests").doc(reqId).set({
            status: "denied",
            deniedAt: Date.now()
        }, { merge: true });

        if (typeof logAudit === "function") {
            await logAudit("A000", "OVERTIME_DENIED", reqId);
        }
    } catch (err) {
        console.error("Deny overtime failed:", err);
    }
};


// ===========================================
// OFF-DAY CHANGE REQUESTS
// (fourth divider in the Alerts card — pending employee requests to
// change their weekly off day(s). weeklyOffDays only actually updates
// once an admin Approves; Deny just closes the request out.)
// ===========================================

let offDayChangeAdminInitialized = false;

function initOffDayChangeAdmin() {

    if (offDayChangeAdminInitialized) return;
    offDayChangeAdminInitialized = true;

    const box = document.getElementById("offDayChangeAlerts");
    if (!box) return;

    db.collection("offDayChangeRequests")
        .where("status", "==", "pending")
        .onSnapshot(snapshot => {

            if (snapshot.empty) {
                box.innerHTML = `<h4>🗓️ Off-Day Change Requests</h4><div class="workspaceEmpty">No pending requests 👍</div>`;
                return;
            }

            const rows = [];

            snapshot.forEach(doc => {

                const r = doc.data();
                const current = (r.currentOffDays || []).join(", ") || "none";
                const requested = (r.requestedOffDays || []).join(", ") || "none";

                rows.push(`
                    <div class="alertRow">
                        <b>${r.user}</b> — ${new Date(r.time).toLocaleString()}
                        <div><small>${current} → ${requested}</small></div>
                        ${r.reason ? `<div><small>💬 <i>${escapeHtmlAdmin(r.reason)}</i></small></div>` : ""}
                        <div class="modalButtons">
                            <button onclick="approveOffDayChangeRequest('${doc.id}')">✅ Approve</button>
                            <button onclick="denyOffDayChangeRequest('${doc.id}')">❌ Deny</button>
                        </div>
                    </div>
                `);
            });

            box.innerHTML = `<h4>🗓️ Off-Day Change Requests</h4>` + rows.join("");
        }, err => console.error("Off-day change requests listener failed:", err));
}

window.approveOffDayChangeRequest = async function (reqId) {

    // ===== PERMISSION SYSTEM =====
    if (!window.hasPermission?.("canManageEmployees")) {
        alert("You don't have permission to approve off-day changes.");
        return;
    }

    try {

        const reqRef = db.collection("offDayChangeRequests").doc(reqId);
        const reqSnap = await reqRef.get();
        const req = reqSnap.data();

        if (!req) return;

        // the actual schedule change — only happens here, on approval
        await db.collection("users").doc(req.user).set({
            weeklyOffDays: req.requestedOffDays || []
        }, { merge: true });

        await reqRef.set({
            status: "approved",
            approvedAt: Date.now(),
            approvedBy: RelayDesk?.currentUser || "A000"
        }, { merge: true });

        if (typeof logAudit === "function") {
            await logAudit(
                RelayDesk?.currentUser || "A000",
                "OFFDAY_CHANGE_APPROVED",
                `${req.user}: ${(req.currentOffDays || []).join(", ") || "none"} -> ${(req.requestedOffDays || []).join(", ") || "none"}`
            );
        }

    } catch (err) {
        console.error("Approve off-day change failed:", err);
        alert("Failed to approve the off-day change.");
    }
};

window.denyOffDayChangeRequest = async function (reqId) {

    // ===== PERMISSION SYSTEM =====
    if (!window.hasPermission?.("canManageEmployees")) {
        alert("You don't have permission to deny off-day changes.");
        return;
    }

    try {

        const reqRef = db.collection("offDayChangeRequests").doc(reqId);
        const reqSnap = await reqRef.get();
        const req = reqSnap.data();

        await reqRef.set({
            status: "denied",
            deniedAt: Date.now(),
            deniedBy: RelayDesk?.currentUser || "A000"
        }, { merge: true });

        if (typeof logAudit === "function") {
            await logAudit(
                RelayDesk?.currentUser || "A000",
                "OFFDAY_CHANGE_DENIED",
                req?.user || reqId
            );
        }

    } catch (err) {
        console.error("Deny off-day change failed:", err);
        alert("Failed to deny the off-day change.");
    }
};


// ===========================================
// IDLE / LATENESS ALERTS
// ===========================================

window.renderAdminAlerts = function (users) {

    const lateBox = document.getElementById("lateAlerts");
    const idleBox = document.getElementById("idleAlerts");
    const breakBox = document.getElementById("breakAlerts");

    if (!lateBox && !idleBox && !breakBox) return;
    if (typeof window.scanForAlerts !== "function") return;

    const { late, idle, overBreak } = window.scanForAlerts(users);

    function disputeHtml(userId, type, dispute) {

        if (!dispute) return "";

        const status = dispute.status || "pending";

        if (status === "pending") {
            return `
                <div class="disputeNote">
                    💬 <i>${escapeHtmlAdmin(dispute.reason)}</i>
                    <div class="modalButtons">
                        <button onclick="approveDispute('${userId}','${type}')">✅ Approve</button>
                        <button onclick="denyDispute('${userId}','${type}')">❌ Deny</button>
                    </div>
                </div>
            `;
        }

        const badge = status === "approved" ? "✅ Approved" : "❌ Denied";

        return `
            <div class="disputeNote">
                💬 <i>${escapeHtmlAdmin(dispute.reason)}</i>
                <div><small>${badge}</small></div>
            </div>
        `;
    }

    // Approve = employee is excused for this alert, no penalty.
    // Deny = the opposite — alert stands, decision is logged.
    // Dismiss = alert is cleared from this panel outright (no badge left behind).
    // Once resolved (approved/denied) the buttons are swapped for a badge;
    // "resolution" is null for alerts nobody has acted on yet.
    function resolutionHtml(userId, type, resolution) {

        if (!resolution) {
            return `
                <div class="modalButtons">
                    <button onclick="resolveAdminAlert('${userId}','${type}','approved')">✅ Approve</button>
                    <button onclick="resolveAdminAlert('${userId}','${type}','denied')">❌ Deny</button>
                    <button onclick="resolveAdminAlert('${userId}','${type}','dismissed')">🚫 Dismiss</button>
                </div>
            `;
        }

        const badge = resolution.status === "approved" ? "✅ Approved (excused)" : "❌ Denied";
        return `<div><small>${badge}</small></div>`;
    }

    if (lateBox) {
        lateBox.innerHTML = late.length
            ? `<h4>⏰ Late Clock-ins</h4>` + late.map(l => `
                <div class="alertRow">
                    <b>${l.id}</b> — ${l.minutesLate} min late
                    <div><small>${l.shiftLabel}</small></div>
                    ${disputeHtml(l.id, "late", l.dispute)}
                    ${resolutionHtml(l.id, "late", l.resolution)}
                </div>
            `).join("")
            : `<h4>⏰ Late Clock-ins</h4><div class="workspaceEmpty">No one is late 🎉</div>`;
    }

    if (idleBox) {
        idleBox.innerHTML = idle.length
            ? `<h4>🚶 Extended Away</h4>` + idle.map(i => `
                <div class="alertRow">
                    <b>${i.id}</b> — Away for ${i.minutesAway} min
                    ${disputeHtml(i.id, "away", i.dispute)}
                    ${resolutionHtml(i.id, "away", i.resolution)}
                </div>
            `).join("")
            : `<h4>🚶 Extended Away</h4><div class="workspaceEmpty">No idle stretches 👍</div>`;
    }

    if (breakBox) {
        breakBox.innerHTML = overBreak.length
            ? `<h4>☕ Extended Break</h4>` + overBreak.map(b => `
                <div class="alertRow">
                    <b>${b.id}</b> — On break for ${b.minutesOnBreak} min
                    ${disputeHtml(b.id, "break", b.dispute)}
                    ${resolutionHtml(b.id, "break", b.resolution)}
                </div>
            `).join("")
            : `<h4>☕ Extended Break</h4><div class="workspaceEmpty">No one's over on break 👍</div>`;
    }
};

// ===========================================
// ADMIN RESOLUTION FOR LATE / AWAY / BREAK ALERTS
// (Approve = excuse the employee, no penalty. Deny = the opposite,
// the alert stands as a logged decision. Dismiss = just clear it from
// the Alerts panel — no badge, no record shown to admin afterward.)
// ===========================================

const ALERT_RESOLUTION_FIELDS = {
    late: "lateAlertResolution",
    away: "awayAlertResolution",
    break: "breakAlertResolution"
};

const ALERT_AUDIT_LABELS = {
    late: "LATE_ALERT",
    away: "AWAY_ALERT",
    break: "BREAK_ALERT"
};

window.resolveAdminAlert = async function (userId, type, action) {

    const field = ALERT_RESOLUTION_FIELDS[type];
    if (!field) return;

    // ===== PERMISSION SYSTEM =====
    if (!window.hasPermission?.("canManageEmployees")) {
        alert("You don't have permission to resolve alerts.");
        return;
    }

    try {

        const today = new Date().toISOString().split("T")[0];

        await db.collection("users").doc(userId).set({
            [field]: {
                date: today,
                status: action,
                by: window.RelayDesk?.currentUser || "A000",
                at: Date.now()
            }
        }, { merge: true });

        if (typeof logAudit === "function") {
            await logAudit(
                window.RelayDesk?.currentUser || "A000",
                `${ALERT_AUDIT_LABELS[type]}_${action.toUpperCase()}`,
                userId
            );
        }

    } catch (err) {
        console.error(`Resolve ${type} alert failed:`, err);
        alert("Failed to update the alert.");
    }
};

window.approveDispute = async function (userId, type) {

    const field = type === "away" ? "awayDispute"
        : type === "break" ? "breakDispute"
        : "lateDispute";

    try {
        await db.collection("users").doc(userId).update({
            [`${field}.status`]: "approved"
        });

        if (typeof logAudit === "function") {
            await logAudit("A000", "DISPUTE_APPROVED", `${userId} (${type})`);
        }
    } catch (err) {
        console.error("Approve dispute failed:", err);
    }
};

window.denyDispute = async function (userId, type) {

    const field = type === "away" ? "awayDispute"
        : type === "break" ? "breakDispute"
        : "lateDispute";

    try {
        await db.collection("users").doc(userId).update({
            [`${field}.status`]: "denied"
        });

        if (typeof logAudit === "function") {
            await logAudit("A000", "DISPUTE_DENIED", `${userId} (${type})`);
        }
    } catch (err) {
        console.error("Deny dispute failed:", err);
    }
};

function escapeHtmlAdmin(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}


// ===========================================
// PERMISSIONS EDITOR (for existing employees)
// ===========================================

let permissionsEditorTargetId = null;

function bindPermissionsEditor() {

    const modal = document.getElementById("permissionsModal");
    const levelSelect = document.getElementById("permissionsLevelSelect");
    const grid = document.getElementById("permissionsModalGrid");
    const offDaysGrid = document.getElementById("permissionsModalOffDays");
    const saveBtn = document.getElementById("permissionsSaveBtn");
    const cancelBtn = document.getElementById("permissionsCancelBtn");

    if (!modal || !levelSelect || !grid || !saveBtn) return;

    // switching the level in the modal refreshes the grid to that
    // level's preset — the admin can still hand-tune from there
    levelSelect.onchange = () => {
        const preset = window.PERMISSION_PRESETS?.[levelSelect.value] || {};
        window.renderPermissionCheckboxes?.(grid, preset);
    };

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.classList.add("hidden");
            permissionsEditorTargetId = null;
        };
    }

    saveBtn.onclick = async () => {

        if (!permissionsEditorTargetId) return;

        // ===== PERMISSION SYSTEM =====
        if (!window.hasPermission?.("canManageEmployees")) {
            alert("You don't have permission to change employee permissions.");
            return;
        }

        const permissionLevel = levelSelect.value;
        const permissions = window.readPermissionCheckboxes?.(grid) || {};
        const weeklyOffDays = window.readOffDayCheckboxes?.(offDaysGrid) || [];

        // ===== LOGIN CHANGES (Phase 9) =====
        // Granting (or revoking) Owner is restricted to A000 only —
        // otherwise an Admin with canManageEmployees could self-promote
        // someone (including themselves) to Owner and bypass the
        // account-creation restriction entirely. The "Owner" <option>
        // is also hidden from anyone but A000 in openPermissionsEditor
        // below, so this is a belt-and-suspenders server-side... well,
        // client-side check for anyone who reaches this handler another way.
        if (permissionLevel === "Owner" && RelayDesk.currentUser !== "A000") {
            alert("Only A000 can grant Owner permission level.");
            return;
        }

        try {

            await db.collection("users").doc(permissionsEditorTargetId).set({
                permissionLevel,
                permissions,
                weeklyOffDays
            }, { merge: true });

            await logAudit(
                RelayDesk.currentUser,
                "PERMISSIONS_UPDATED",
                `${permissionsEditorTargetId} -> ${permissionLevel}`
            );

            alert(`Permissions updated for ${permissionsEditorTargetId} ✔`);

            modal.classList.add("hidden");
            permissionsEditorTargetId = null;

        } catch (err) {
            console.error("Update permissions failed:", err);
            alert("Failed to update permissions.");
        }
    };
}

// Opens the modal for a given user, pre-filled with their current
// permission level + individual permission grants. Called from the
// "🔑 Permissions" button on each admin user card (admin.js).
window.openPermissionsEditor = async function (userId) {

    if (!window.hasPermission?.("canManageEmployees")) {
        alert("You don't have permission to manage employee permissions.");
        return;
    }

    const modal = document.getElementById("permissionsModal");
    const levelSelect = document.getElementById("permissionsLevelSelect");
    const grid = document.getElementById("permissionsModalGrid");
    const offDaysGrid = document.getElementById("permissionsModalOffDays");
    const titleEl = document.getElementById("permissionsModalUser");

    if (!modal || !levelSelect || !grid) return;

    try {

        const doc = await db.collection("users").doc(userId).get();
        const u = doc.exists ? doc.data() : {};

        permissionsEditorTargetId = userId;

        if (titleEl) titleEl.textContent = userId;

        // ===== LOGIN CHANGES (Phase 9) =====
        // Only A000 gets to see "Owner" as a choice — otherwise a
        // regular Admin could promote someone (or themselves) to Owner
        // and route around the account-creation restriction.
        const ownerOption = levelSelect.querySelector('option[value="Owner"]');
        if (ownerOption) {
            ownerOption.classList.toggle("hidden", RelayDesk.currentUser !== "A000");
            ownerOption.disabled = RelayDesk.currentUser !== "A000";
            ownerOption.hidden = RelayDesk.currentUser !== "A000";
        }

        const level = u.permissionLevel || "Employee";
        levelSelect.value = level;

        // show the user's ACTUAL effective permissions (preset + their
        // own overrides), not just the raw preset, so the admin sees
        // exactly what's currently in effect
        const effective = window.getUserPermissions(u, userId);
        window.renderPermissionCheckboxes(grid, effective);

        if (offDaysGrid) {
            window.renderOffDayCheckboxes?.(offDaysGrid, u.weeklyOffDays || []);
        }

        modal.classList.remove("hidden");

    } catch (err) {
        console.error("Open permissions editor failed:", err);
        alert("Failed to load permissions.");
    }
};
