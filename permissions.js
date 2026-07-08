// ===========================================
// RelayDesk
// permissions.js
// Flexible Permission System (replaces hardcoded role checks)
// ===========================================
//
// This sits ALONGSIDE the existing "role" field (Dispatch, Safety
// Employee, Dispatch + Safety, etc) — that field stays exactly what
// it was: a work-level label. Permissions are a separate, orthogonal
// layer that controls what admin-style actions a user is allowed to
// perform.
//
// Firestore shape added to users/{code}:
//
//   permissionLevel: "Employee" | "Trainer" | "Supervisor" | "Admin" | "Owner"
//   permissions: {
//       canEditLoads: true,
//       canDeleteLoads: false,
//       canViewAudit: false,
//       canManageEmployees: true,
//       canAssignShifts: true,
//       canViewStatistics: true,
//       canExportHistory: true,
//       canFreezeAccounts: true,
//       canAccessAdminPanel: true
//   }
//
// `permissionLevel` just picks a starting preset (see
// PERMISSION_PRESETS below) — an admin can then fine-tune individual
// keys on top of it. Anything actually stored in `permissions` always
// wins over the preset.
//
// A000 is the one permanent super-admin account: it's always treated
// as "Owner" with every permission granted, no matter what (or
// whether anything) is stored on its doc, so it can never be locked
// out of its own system.

// ===========================================
// PERMISSION KEYS
// ===========================================

window.PERMISSION_KEYS = [
    "canEditLoads",
    "canDeleteLoads",
    "canViewAudit",
    "canManageEmployees",
    "canAssignShifts",
    "canViewStatistics",
    "canExportHistory",
    "canFreezeAccounts",
    "canAccessAdminPanel"
];

window.PERMISSION_LABELS = {
    canEditLoads:       "✏️ Edit Loads",
    canDeleteLoads:      "🗑 Delete Loads",
    canViewAudit:        "📜 View Audit Log",
    canManageEmployees:  "👥 Manage Employees",
    canAssignShifts:     "🕐 Assign Shifts",
    canViewStatistics:   "📊 View Statistics",
    canExportHistory:    "📤 Export History",
    canFreezeAccounts:   "🧊 Freeze / Unfreeze Accounts",
    canAccessAdminPanel: "🛠 Access Admin Panel"
};

window.PERMISSION_LEVELS = ["Employee", "Trainer", "Supervisor", "Admin", "Owner"];

function buildPermissionSet(defaultValue) {
    return window.PERMISSION_KEYS.reduce((acc, key) => {
        acc[key] = defaultValue;
        return acc;
    }, {});
}

const ALL_GRANTED = buildPermissionSet(true);
const ALL_DENIED = buildPermissionSet(false);

// ===========================================
// PRESETS PER PERMISSION LEVEL
// ===========================================

window.PERMISSION_PRESETS = {

    Employee: {
        ...ALL_DENIED,
        canEditLoads: true,
        canDeleteLoads: true
    },

    Trainer: {
        ...ALL_DENIED,
        canEditLoads: true,
        canDeleteLoads: true
    },

    Supervisor: {
        ...ALL_DENIED,
        canEditLoads: true,
        canDeleteLoads: true,
        canViewAudit: true,
        canAssignShifts: true,
        canViewStatistics: true,
        canAccessAdminPanel: true
    },

    Admin: {
        ...ALL_DENIED,
        canEditLoads: true,
        canDeleteLoads: true,
        canViewAudit: true,
        canManageEmployees: true,
        canAssignShifts: true,
        canViewStatistics: true,
        canExportHistory: true,
        canFreezeAccounts: true,
        canAccessAdminPanel: true
    },

    // Owner is reserved for A000, but exposed here too in case an
    // admin ever wants to promote someone to full trust.
    Owner: { ...ALL_GRANTED }
};

// ===========================================
// RESOLVE A USER'S EFFECTIVE PERMISSIONS
// ===========================================

window.getUserPermissions = function (userData, userId = null) {

    if (userId === "A000") {
        return { ...ALL_GRANTED };
    }

    const level = userData?.permissionLevel || "Employee";
    const preset = window.PERMISSION_PRESETS[level] || window.PERMISSION_PRESETS.Employee;

    // explicit per-user overrides always win over the level preset
    const overrides = userData?.permissions || {};

    return { ...preset, ...overrides };
};

// ===========================================
// SINGLE PERMISSION CHECK
// (defaults to whoever is currently logged in)
// ===========================================

window.hasPermission = function (key, userData = null, userId = null) {

    const id = userId || window.RelayDesk?.currentUser || null;

    if (id === "A000") return true;

    const data = userData || window.RelayDesk?.currentUserData || {};

    return !!window.getUserPermissions(data, id)[key];
};

// Does the currently logged-in user get into the Admin Panel at all
// (A000, or anyone granted canAccessAdminPanel)?
window.hasAdminAccess = function () {
    return window.RelayDesk?.currentUser === "A000" ||
           window.hasPermission("canAccessAdminPanel");
};

// ===========================================
// ACCOUNT CREATION (Phase 9 — Login Changes)
// ===========================================
// Deliberately SEPARATE from canManageEmployees. canManageEmployees
// still covers editing/deleting/freezing/permission-editing an
// EXISTING employee — Admins keep all of that. Creating a NEW
// account is narrower: only A000, or a user whose permissionLevel is
// already "Owner", may do it. Gates the Admin Panel's "Add Employee"
// section/button.
window.canCreateEmployeeAccounts = function () {
    const id = window.RelayDesk?.currentUser || null;

    if (id === "A000") return true;

    const data = window.RelayDesk?.currentUserData || {};
    return data.permissionLevel === "Owner";
};

// ===========================================
// UI HELPER — render a checkbox grid for a
// given permissions object (used by both the
// "Add Employee" form and the edit modal)
// ===========================================

window.renderPermissionCheckboxes = function (containerEl, currentPermissions = {}) {

    if (!containerEl) return;

    containerEl.innerHTML = window.PERMISSION_KEYS.map(key => `
        <label class="permissionRow">
            <input type="checkbox" data-permkey="${key}" ${currentPermissions[key] ? "checked" : ""}>
            ${window.PERMISSION_LABELS[key] || key}
        </label>
    `).join("");
};

window.readPermissionCheckboxes = function (containerEl) {

    if (!containerEl) return {};

    const result = {};

    containerEl.querySelectorAll("input[data-permkey]").forEach(input => {
        result[input.dataset.permkey] = input.checked;
    });

    return result;
};
