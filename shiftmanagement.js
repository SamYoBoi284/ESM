// ===========================================
// RelayDesk / ESM
// shiftmanagement.js
// Shift Management — configurable, Firestore-backed shifts
// ===========================================
//
// This is the NEW, fully data-driven shift system. It replaces the
// hardcoded 3-cycle engine in shifts.js (SHIFT_SCHEDULES / SHIFT_CYCLES
// / assignEmployeeShift / checkLateness / scanForAlerts), but does so
// as a staged migration — see SHIFT_MANAGEMENT_CONTEXT_TRACKER.md for
// the full plan. This file is currently STEP 1 ONLY: the Firestore
// data layer + timezone-correct evaluation helpers. Nothing in the
// rest of the app calls into this file yet, so it changes no visible
// behavior on its own.
//
// ===========================================
// SCHEMA (Firestore collection "shifts", one doc per shift):
//
//   {
//     name: "Morning Crew",              // string, required
//     startTime: "14:00",                // "HH:MM" 24h, wall-clock in `timezone`
//     endTime: "23:00",                  // "HH:MM" 24h — may be <= startTime (overnight wrap)
//     timezoneRegion: "US" | "SY",       // UI selector key (see SHIFT_TIMEZONE_ZONES)
//     timezone: "America/Chicago",       // IANA identifier — the actual source of truth
//     assignedEmployees: ["A011","A014"],// user codes; an id can only ever
//                                        // appear in ONE shift's array at a time
//     enabled: true,
//     order: 0,                          // creation order, for stable display
//     createdAt: 1752300000000,
//     createdBy: "A000",
//     updatedAt: 1752300000000,
//     updatedBy: "A000"
//   }
//
// Deliberately NOT written yet (kept reserved so they can be added
// later without any restructuring): department, color,
// breakDurationMinutes, workLocation, notes.
// ===========================================


// ===========================================
// TIME ZONE REGISTRY
// Extensible: adding a future region is one array entry, nothing
// else in this file (or any consumer) needs to change.
// ===========================================

window.SHIFT_TIMEZONE_ZONES = [
    { code: "US", label: "USA Time", labelAr: "التوقيت الأمريكي", iana: "America/Chicago" },
    { code: "SY", label: "Syria Time", labelAr: "التوقيت السوري", iana: "Asia/Damascus" }
];

window.getShiftTimezoneZone = function (code) {
    return window.SHIFT_TIMEZONE_ZONES.find(z => z.code === code) || window.SHIFT_TIMEZONE_ZONES[0];
};

window.getIanaForTimezoneRegion = function (code) {
    return window.getShiftTimezoneZone(code).iana;
};


// ===========================================
// LIVE CACHE — kept in sync with Firestore via onSnapshot
// ===========================================

window.SHIFTS = {};       // { [shiftId]: shiftDataWithId }
window.SHIFTS_LIST = [];  // ordered array, same objects as above

window.initShiftManagement = function () {

    if (window._shiftManagementListenerAttached) return;
    if (typeof db === "undefined" || !db) return;

    window._shiftManagementListenerAttached = true;

    db.collection("shifts").orderBy("createdAt", "asc").onSnapshot(snapshot => {

        const list = [];
        const map = {};

        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            list.push(data);
            map[doc.id] = data;
        });

        window.SHIFTS_LIST = list;
        window.SHIFTS = map;

        document.dispatchEvent(new CustomEvent("shiftsChanged", { detail: { shifts: list } }));

        // UI hook — defined by the Admin Panel Shift Management UI
        // (added in a later step). Safe no-op until then.
        window.renderShiftManagementUI?.();

    }, err => {
        console.error("shifts listener failed:", err);
    });
};


// ===========================================
// CRUD
// ===========================================

// Creates a new shift (shiftId falsy) or updates an existing one
// (shiftId truthy). Returns true on success, false on validation /
// permission / write failure (caller can use this to keep a modal
// open on failure).
window.saveShift = async function (shiftId, payload) {

    const isNew = !shiftId;

    // ===== PERMISSION SYSTEM =====
    // Creating a new shift is Owner+A000 only. Editing an existing one
    // stays on "canAssignShifts" — same permission the old hardcoded
    // system already gated shift-assignment/timezone actions behind.
    if (isNew) {
        if (!window.isOwnerOrAbove?.()) {
            alert("You don't have permission to create shifts.");
            return false;
        }
    } else if (!window.hasPermission?.("canAssignShifts")) {
        alert("You don't have permission to manage shifts.");
        return false;
    }

    const name = (payload?.name || "").trim();
    if (!name) {
        alert("Shift Name is required.");
        return false;
    }

    if (typeof db === "undefined" || !db) {
        alert("Not connected to the database. Please try again.");
        return false;
    }

    const startTime = /^\d{2}:\d{2}$/.test(payload?.startTime) ? payload.startTime : "00:00";
    const endTime = /^\d{2}:\d{2}$/.test(payload?.endTime) ? payload.endTime : "00:00";

    const timezoneRegion = window.getShiftTimezoneZone(payload?.timezoneRegion).code;
    const timezone = window.getIanaForTimezoneRegion(timezoneRegion);

    // De-duplicate + drop anything falsy from the incoming employee list
    const assignedEmployees = Array.isArray(payload?.assignedEmployees)
        ? [...new Set(payload.assignedEmployees.filter(Boolean))]
        : [];

    const shiftsRef = db.collection("shifts");
    const targetId = shiftId || shiftsRef.doc().id;
    const targetRef = shiftsRef.doc(targetId);

    const now = Date.now();
    const actor = window.RelayDesk?.currentUser || "A000";

    const data = {
        name,
        startTime,
        endTime,
        timezoneRegion,
        timezone,
        assignedEmployees,
        enabled: payload?.enabled !== false,
        updatedAt: now,
        updatedBy: actor
    };

    if (isNew) {
        data.createdAt = now;
        data.createdBy = actor;
        data.order = (window.SHIFTS_LIST || []).length;
    }

    try {

        const batch = db.batch();

        // ===== ENFORCE: an employee may only belong to ONE shift =====
        // Whatever the new list says, strip these employee ids out of
        // every OTHER shift's assignedEmployees array first, in the
        // same atomic batch, so no client ever observes an employee
        // in two shifts at once.
        if (assignedEmployees.length) {
            (window.SHIFTS_LIST || []).forEach(existing => {
                if (existing.id === targetId) return;
                const current = existing.assignedEmployees || [];
                const overlap = current.some(id => assignedEmployees.includes(id));
                if (overlap) {
                    batch.set(shiftsRef.doc(existing.id), {
                        assignedEmployees: current.filter(id => !assignedEmployees.includes(id)),
                        updatedAt: now,
                        updatedBy: actor
                    }, { merge: true });
                }
            });
        }

        batch.set(targetRef, data, { merge: true });

        await batch.commit();

        if (typeof logAudit === "function") {
            await logAudit(
                actor,
                isNew ? "SHIFT_CREATED" : "SHIFT_UPDATED",
                `${name} (${startTime}-${endTime} ${timezoneRegion}) -> [${assignedEmployees.join(", ") || "no employees"}]`
            );
        }

        return true;

    } catch (err) {
        console.error("Failed to save shift:", err);
        alert("Failed to save the shift. Please try again.");
        return false;
    }
};

window.deleteShiftById = async function (shiftId) {

    if (!shiftId) return;

    // ===== PERMISSION SYSTEM =====
    // Owner+A000 only — deleting a shift is more sensitive than the
    // everyday edit/enable-disable actions canAssignShifts covers.
    if (!window.isOwnerOrAbove?.()) {
        alert("You don't have permission to delete shifts.");
        return;
    }

    const shift = window.SHIFTS?.[shiftId];
    if (!confirm(`Delete the shift "${shift?.name || shiftId}"? This cannot be undone.`)) return;

    try {
        await db.collection("shifts").doc(shiftId).delete();

        if (typeof logAudit === "function") {
            await logAudit(
                window.RelayDesk?.currentUser || "A000",
                "SHIFT_DELETED",
                shift?.name || shiftId
            );
        }
    } catch (err) {
        console.error("Failed to delete shift:", err);
        alert("Failed to delete the shift. Please try again.");
    }
};

// Quick Enable/Disable toggle — doesn't require opening the full
// Create/Edit modal.
window.setShiftEnabledState = async function (shiftId, enabled) {

    if (!shiftId) return;

    // ===== PERMISSION SYSTEM =====
    if (!window.hasPermission?.("canAssignShifts")) {
        alert("You don't have permission to enable/disable shifts.");
        window.renderShiftManagementUI?.(); // snap any toggle back
        return;
    }

    const actor = window.RelayDesk?.currentUser || "A000";

    try {
        await db.collection("shifts").doc(shiftId).set({
            enabled: !!enabled,
            updatedAt: Date.now(),
            updatedBy: actor
        }, { merge: true });

        if (typeof logAudit === "function") {
            const shift = window.SHIFTS?.[shiftId];
            await logAudit(
                actor,
                enabled ? "SHIFT_ENABLED" : "SHIFT_DISABLED",
                shift?.name || shiftId
            );
        }
    } catch (err) {
        console.error("Failed to update shift enabled state:", err);
        alert("Failed to update the shift. Please try again.");
        window.renderShiftManagementUI?.();
    }
};


// ===========================================
// TIME ZONE — WALL CLOCK MATH
// Uses Intl.DateTimeFormat to read the correct wall-clock time in an
// arbitrary IANA zone (DST-safe, no library dependency), rather than
// assuming a fixed UTC offset.
// ===========================================

window.getZonedParts = function (timezone, date = new Date()) {

    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    const map = {};
    fmt.formatToParts(date).forEach(p => {
        if (p.type !== "literal") map[p.type] = p.value;
    });

    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        // Intl can format midnight as "24" for hour12:false in some
        // environments — normalize that back to 0.
        hour: map.hour === "24" ? 0 : Number(map.hour),
        minute: Number(map.minute),
        second: Number(map.second)
    };
};

// Offset (in minutes) of `timezone` from UTC, AT `date`. Positive
// means the zone is ahead of UTC. Computed by re-interpreting the
// zone's own wall-clock reading of `date` as if it were UTC, then
// diffing against the true UTC instant.
window.getTimezoneOffsetMinutes = function (timezone, date = new Date()) {
    const p = window.getZonedParts(timezone, date);
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return (asUTC - date.getTime()) / 60000;
};

// Converts a wall-clock "Y-M-D HH:MM" that's meant to be read IN
// `timezone` into the actual epoch ms instant it represents.
// `referenceForOffset` just needs to be close in time (used only to
// resolve DST — the caller typically passes "now" or the same day).
window.zonedWallTimeToEpoch = function (timezone, year, month, day, hour, minute, referenceForOffset = new Date()) {
    const offsetMin = window.getTimezoneOffsetMinutes(timezone, referenceForOffset);
    return Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMin * 60000;
};

function parseHM(str) {
    const [h, m] = (str || "00:00").split(":").map(Number);
    return { h: h || 0, m: m || 0 };
}

function minutesSinceMidnight(h, m) {
    return h * 60 + m;
}


// ===========================================
// SHIFT EVALUATION
// ===========================================

// Is `referenceDate` currently inside `shift`'s wall-clock window, in
// the shift's own timezone? Fully overnight-wrap aware (e.g.
// 22:00-07:00) and ignores disabled shifts.
window.isNowWithinShift = function (shift, referenceDate = new Date()) {

    if (!shift || shift.enabled === false) return false;

    const tz = shift.timezone || "America/Chicago";
    const parts = window.getZonedParts(tz, referenceDate);
    const nowMin = minutesSinceMidnight(parts.hour, parts.minute);

    const s = parseHM(shift.startTime);
    const e = parseHM(shift.endTime);
    const startMin = minutesSinceMidnight(s.h, s.m);
    const endMin = minutesSinceMidnight(e.h, e.m);

    if (startMin === endMin) return true; // 24-hour shift edge case

    if (startMin < endMin) {
        // same-day shift
        return nowMin >= startMin && nowMin < endMin;
    }

    // overnight wrap (e.g. 22:00 -> 07:00)
    return nowMin >= startMin || nowMin < endMin;
};

// Expected shift START as an actual epoch-ms instant, anchored to
// whichever of yesterday/today/tomorrow's start (in the shift's own
// timezone) is the most recent one at-or-before `referenceTime`. This
// mirrors the old shifts.js getExpectedShiftStart() anchoring logic,
// but is timezone/DST-correct and works for any arbitrary start time,
// not just the 3 fixed legacy cycles.
window.getShiftExpectedStartEpoch = function (shift, referenceTime = Date.now()) {

    if (!shift) return null;

    const tz = shift.timezone || "America/Chicago";
    const refDate = new Date(referenceTime);
    const parts = window.getZonedParts(tz, refDate);
    const s = parseHM(shift.startTime);

    const todayEpoch = window.zonedWallTimeToEpoch(tz, parts.year, parts.month, parts.day, s.h, s.m, refDate);

    const DAY_MS = 24 * 60 * 60 * 1000;
    const candidates = [todayEpoch - DAY_MS, todayEpoch, todayEpoch + DAY_MS]
        .filter(c => c <= referenceTime);

    return candidates.length ? Math.max(...candidates) : todayEpoch - DAY_MS;
};

// Shift duration in ms (overnight-wrap aware — a shift whose end time
// is numerically <= its start time, e.g. 22:00-07:00, wraps to the
// next day; equal start/end means a 24-hour shift). Factored out so
// consumers that need actual clock-in-based countdowns (status.js —
// Step 5) can use it directly, not just the scheduled-start-anchored
// getShiftExpectedEndEpoch below.
window.getShiftDurationMs = function (shift) {

    if (!shift) return null;

    const s = parseHM(shift.startTime);
    const e = parseHM(shift.endTime);
    const startMin = minutesSinceMidnight(s.h, s.m);
    const endMin = minutesSinceMidnight(e.h, e.m);

    const durationMin = endMin > startMin
        ? (endMin - startMin)
        : (endMin - startMin + 24 * 60); // overnight wrap (or 24h if equal)

    return durationMin * 60000;
};

// Expected shift END, derived from the expected START plus the
// shift's configured duration (correctly handles overnight wrap).
window.getShiftExpectedEndEpoch = function (shift, referenceTime = Date.now()) {

    if (!shift) return null;

    const startEpoch = window.getShiftExpectedStartEpoch(shift, referenceTime);
    if (startEpoch === null) return null;

    return startEpoch + window.getShiftDurationMs(shift);
};


// ===========================================
// EMPLOYEE RESOLUTION
// An employee's shift is resolved by looking at which shift's
// assignedEmployees array currently contains them — this is the
// single source of truth (saveShift() enforces it can only ever be
// one shift at a time), so there's nothing to keep in sync on the
// users/{code} doc itself.
// ===========================================

window.getEmployeeAssignedShift = function (userId) {
    if (!userId) return null;
    return (window.SHIFTS_LIST || []).find(s => (s.assignedEmployees || []).includes(userId)) || null;
};

window.isEmployeeCurrentlyOnShift = function (userId, referenceDate = new Date()) {
    const shift = window.getEmployeeAssignedShift(userId);
    if (!shift) return false;
    return window.isNowWithinShift(shift, referenceDate);
};


// ===========================================
// STEP 2 — OWNER / ADMIN PANEL UI
// Create/Edit modal + shift list/cards. Mirrors the modal pattern
// used by #permissionsModal (admin-extras.js) and the multi-select
// checkbox-grid idiom already established by renderPermissionCheckboxes
// / renderOffDayCheckboxes (the correct existing idiom in this
// codebase for "pick N of a known set" — see Context Tracker section
// 1 for why this was chosen over literally reusing the freeform
// Additional-Stops row markup, which is for arbitrary text entries,
// not picking from an existing employee roster).
// ===========================================

let shiftMgmtEditingId = null;              // null = creating a new shift
let shiftMgmtSelectedEmployees = new Set(); // source of truth for the modal's checkbox grid
let shiftMgmtExpandedIds = new Set();       // which cards have "View Assigned Employees" open

function shiftMgmtEscapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}

// "All registered employees" — window.adminLiveUsers is the live
// users/{code} cache admin.js already maintains (populated by its own
// onSnapshot in initializeAdmin()); A000 is never added to it.
function shiftMgmtGetAllEmployeeIds() {
    return Object.keys(window.adminLiveUsers || {}).sort();
}

// ----------------- Employee multi-select grid -----------------

function renderShiftMgmtEmployeeGrid() {

    const grid = document.getElementById("shiftMgmtEmployeeGrid");
    if (!grid) return;

    const ids = shiftMgmtGetAllEmployeeIds();

    if (!ids.length) {
        grid.innerHTML = `<div class="workspaceEmpty" data-en="No registered employees yet." data-ar="لا يوجد موظفون مسجلون بعد.">No registered employees yet.</div>`;
        window.I18N?.apply?.(grid);
        return;
    }

    grid.innerHTML = ids.map(id => `
        <label class="permissionRow shiftMgmtEmployeeRow" data-emp="${id}">
            <input type="checkbox" class="shiftMgmtEmployeeCheckbox" value="${id}" ${shiftMgmtSelectedEmployees.has(id) ? "checked" : ""}>
            ${shiftMgmtEscapeHtml(id)}
        </label>
    `).join("");

    grid.querySelectorAll(".shiftMgmtEmployeeCheckbox").forEach(cb => {
        cb.addEventListener("change", () => {
            if (cb.checked) shiftMgmtSelectedEmployees.add(cb.value);
            else shiftMgmtSelectedEmployees.delete(cb.value);
        });
    });

    filterShiftMgmtEmployeeGrid();
}

// Filters by hiding non-matching rows (rather than removing them from
// the DOM), so shiftMgmtSelectedEmployees never loses a selection just
// because the search box currently hides that row.
function filterShiftMgmtEmployeeGrid() {

    const grid = document.getElementById("shiftMgmtEmployeeGrid");
    const search = document.getElementById("shiftMgmtEmployeeSearch");
    if (!grid || !search) return;

    const term = search.value.trim().toLowerCase();

    grid.querySelectorAll(".shiftMgmtEmployeeRow").forEach(row => {
        const id = (row.dataset.emp || "").toLowerCase();
        row.classList.toggle("hidden", !!term && !id.includes(term));
    });
}

// ----------------- Create/Edit modal -----------------

function openShiftMgmtModal(shiftId = null) {

    // ===== PERMISSION SYSTEM =====
    // Creating a new shift is Owner+A000 only; editing an existing one
    // stays on "canAssignShifts" (mirrors the same split in saveShift).
    if (!shiftId) {
        if (!window.isOwnerOrAbove?.()) {
            alert("You don't have permission to create shifts.");
            return;
        }
    } else if (!window.hasPermission?.("canAssignShifts")) {
        alert("You don't have permission to manage shifts.");
        return;
    }

    const modal = document.getElementById("shiftMgmtModal");
    if (!modal) return;

    const shift = shiftId ? window.SHIFTS?.[shiftId] : null;

    shiftMgmtEditingId = shiftId || null;
    shiftMgmtSelectedEmployees = new Set(shift?.assignedEmployees || []);

    const titleEl = document.getElementById("shiftMgmtModalTitle");
    const nameInput = document.getElementById("shiftMgmtNameInput");
    const startInput = document.getElementById("shiftMgmtStartInput");
    const endInput = document.getElementById("shiftMgmtEndInput");
    const tzSelect = document.getElementById("shiftMgmtTimezoneSelect");
    const enabledToggle = document.getElementById("shiftMgmtEnabledToggle");
    const searchInput = document.getElementById("shiftMgmtEmployeeSearch");
    const nameError = document.getElementById("shiftMgmtNameError");

    if (titleEl) titleEl.textContent = shift ? `✏️ Edit Shift — ${shift.name}` : "🕐 New Shift";
    if (nameInput) nameInput.value = shift?.name || "";
    if (startInput) startInput.value = shift?.startTime || "09:00";
    if (endInput) endInput.value = shift?.endTime || "17:00";
    if (tzSelect) tzSelect.value = shift?.timezoneRegion || "US";
    if (enabledToggle) enabledToggle.checked = shift ? shift.enabled !== false : true;
    if (searchInput) searchInput.value = "";
    if (nameError) nameError.textContent = "";
    nameInput?.classList.remove("fieldError");

    renderShiftMgmtEmployeeGrid();

    modal.classList.remove("hidden");
}

function closeShiftMgmtModal() {
    const modal = document.getElementById("shiftMgmtModal");
    modal?.classList.add("hidden");
    shiftMgmtEditingId = null;
    shiftMgmtSelectedEmployees = new Set();
}

async function saveShiftMgmtModal() {

    const nameInput = document.getElementById("shiftMgmtNameInput");
    const startInput = document.getElementById("shiftMgmtStartInput");
    const endInput = document.getElementById("shiftMgmtEndInput");
    const tzSelect = document.getElementById("shiftMgmtTimezoneSelect");
    const enabledToggle = document.getElementById("shiftMgmtEnabledToggle");
    const nameError = document.getElementById("shiftMgmtNameError");
    const saveBtn = document.getElementById("shiftMgmtSaveBtn");

    const name = (nameInput?.value || "").trim();

    nameInput?.classList.remove("fieldError");
    if (nameError) nameError.textContent = "";

    if (!name) {
        nameInput?.classList.add("fieldError");
        if (nameError) nameError.textContent = "Shift Name is required.";
        return;
    }

    saveBtn?.setAttribute("disabled", "true");

    const ok = await window.saveShift(shiftMgmtEditingId, {
        name,
        startTime: startInput?.value || "00:00",
        endTime: endInput?.value || "00:00",
        timezoneRegion: tzSelect?.value || "US",
        assignedEmployees: Array.from(shiftMgmtSelectedEmployees),
        enabled: !!enabledToggle?.checked
    });

    saveBtn?.removeAttribute("disabled");

    if (ok) closeShiftMgmtModal();
}

// ----------------- Shift list / cards -----------------

// Re-rendered on every "shifts" snapshot update (called from
// initShiftManagement()'s onSnapshot above) AND on local UI-only state
// changes (expand/collapse). Cheap no-op if the Admin Panel isn't
// currently in the DOM.
window.renderShiftManagementUI = function () {

    const listEl = document.getElementById("shiftMgmtList");
    if (!listEl) return;

    const addBtn = document.getElementById("shiftMgmtAddBtn");
    const canManage = !!window.hasPermission?.("canAssignShifts");
    const isOwner = !!window.isOwnerOrAbove?.();
    if (addBtn) addBtn.classList.toggle("hidden", !isOwner);

    const shifts = window.SHIFTS_LIST || [];

    if (!shifts.length) {
        listEl.innerHTML = `<div class="workspaceEmpty" data-en="No shifts created yet." data-ar="لا توجد ورديات بعد.">No shifts created yet.</div>`;
        window.I18N?.apply?.(listEl);
        return;
    }

    listEl.innerHTML = shifts.map(shift => {

        const zone = window.getShiftTimezoneZone(shift.timezoneRegion);
        const employees = shift.assignedEmployees || [];
        const isDisabled = shift.enabled === false;
        const expanded = shiftMgmtExpandedIds.has(shift.id);

        return `
            <div class="shiftMgmtCard ${isDisabled ? "disabled" : ""}" data-shift-id="${shift.id}">

                <div class="shiftMgmtCardHeader">
                    <h4>
                        ${shiftMgmtEscapeHtml(shift.name)}
                        <span class="shiftMgmtBadge ${isDisabled ? "disabled" : "enabled"}">
                            ${isDisabled ? "Disabled" : "Enabled"}
                        </span>
                    </h4>
                </div>

                <div class="shiftMgmtCardMeta">
                    🕐 ${shiftMgmtEscapeHtml(shift.startTime)} - ${shiftMgmtEscapeHtml(shift.endTime)} (${zone.label})<br>
                    👥 ${employees.length} employee${employees.length === 1 ? "" : "s"} assigned
                </div>

                <div class="shiftMgmtCardButtons">
                    <button type="button" class="smallButton shiftMgmtViewBtn" data-id="${shift.id}">
                        ${expanded ? "🔽 Hide Employees" : "👥 View Assigned Employees"}
                    </button>
                    ${canManage ? `
                        <button type="button" class="smallButton shiftMgmtEditBtn" data-id="${shift.id}">✏️ Edit</button>
                        <button type="button" class="smallButton shiftMgmtToggleBtn" data-id="${shift.id}" data-enabled="${!isDisabled}">
                            ${isDisabled ? "✅ Enable" : "🚫 Disable"}
                        </button>
                    ` : ""}
                    ${isOwner ? `
                        <button type="button" class="dangerButton shiftMgmtDeleteBtn" data-id="${shift.id}">🗑 Delete</button>
                    ` : ""}
                </div>

                ${expanded ? `
                    <div class="shiftMgmtEmployeeList">
                        ${employees.length
                            ? employees.map(id => `<span class="shiftMgmtEmployeeChip">${shiftMgmtEscapeHtml(id)}</span>`).join("")
                            : `<span class="shiftMgmtEmployeeChip">— none —</span>`}
                    </div>
                ` : ""}

            </div>
        `;
    }).join("");

    listEl.querySelectorAll(".shiftMgmtViewBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            if (shiftMgmtExpandedIds.has(id)) shiftMgmtExpandedIds.delete(id);
            else shiftMgmtExpandedIds.add(id);
            window.renderShiftManagementUI();
        });
    });

    listEl.querySelectorAll(".shiftMgmtEditBtn").forEach(btn => {
        btn.addEventListener("click", () => openShiftMgmtModal(btn.dataset.id));
    });

    listEl.querySelectorAll(".shiftMgmtToggleBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            const currentlyEnabled = btn.dataset.enabled === "true";
            window.setShiftEnabledState(btn.dataset.id, !currentlyEnabled);
        });
    });

    listEl.querySelectorAll(".shiftMgmtDeleteBtn").forEach(btn => {
        btn.addEventListener("click", () => window.deleteShiftById(btn.dataset.id));
    });
};

// ----------------- Init / binding -----------------

let shiftManagementUIInitialized = false;

function initShiftManagementUI() {

    if (shiftManagementUIInitialized) return;
    shiftManagementUIInitialized = true;

    document.getElementById("shiftMgmtAddBtn")?.addEventListener("click", () => openShiftMgmtModal(null));
    document.getElementById("shiftMgmtCancelBtn")?.addEventListener("click", closeShiftMgmtModal);
    document.getElementById("shiftMgmtSaveBtn")?.addEventListener("click", saveShiftMgmtModal);
    document.getElementById("shiftMgmtEmployeeSearch")?.addEventListener("input", filterShiftMgmtEmployeeGrid);

    window.renderShiftManagementUI();

    console.log("🕐 Shift Management UI ready");
}

// Same startup idiom as admin-extras.js: wait for the Admin Panel to
// actually be reachable (A000, or anyone with canAccessAdminPanel)
// before binding, so the DOM elements are guaranteed to exist.
window.addEventListener("DOMContentLoaded", () => {
    const check = setInterval(() => {
        if (window.hasAdminAccess?.()) {
            initShiftManagementUI();
            clearInterval(check);
        }
    }, 400);
});
