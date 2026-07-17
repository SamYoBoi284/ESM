// ===========================================
// RelayDesk / ESM
// employeeprofile.js
// PHASE 2: Employee Profiles
// ===========================================
//
// A read-only "view" feature: every employee becomes clickable from
// user-facing lists (colleagues board, admin panel), opening a modal
// with the info already available elsewhere in the system — employee
// code, role, current status + duration, shift, today's activity, and
// join date if present. No admin-only editing here (that stays a
// future phase, per spec).
//
// Data sources (all pre-existing, nothing new written to Firestore):
//   - users/{code}                 -> code, role, status, lastSwitchTime, joinDate
//   - window.getEmployeeAssignedShift(code) (shiftmanagement.js)
//   - auditLogs where user == code -> today's activity, rendered with
//     activitytimeline.js's exported ActivityTimelineHelpers (no
//     duplicated icon/label maps — see that file's Phase 2 export).
//
// Department was in the original spec's suggested field list, but this
// codebase has no per-employee department field (only per-load
// division), so it's deliberately left out rather than faked.

(function () {

    let initialized = false;

    function statusDotFor(status) {
        switch (status) {
            case "On Duty": return "🟢";
            case "Break": return "🟡";
            case "Away": return "🟣";
            case "Off Duty": return "🔴";
            default: return "⚫";
        }
    }

    function formatDuration(ms) {
        if (!ms || ms < 0) return "0m";
        const totalMin = Math.floor(ms / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h <= 0) return `${m}m`;
        return `${h}h ${m}m`;
    }

    function formatJoinDate(value) {
        if (!value) return null;
        // Supports either a stored ms number or a Firestore Timestamp
        // (has .toMillis()) — same tolerance pattern used elsewhere in
        // this codebase (e.g. activitytimeline.js's `entry.time`).
        const ms = typeof value === "number" ? value
            : (value?.toMillis ? value.toMillis() : null);
        if (!ms) return null;
        return new Date(ms).toLocaleDateString();
    }

    function row(label, value) {
        if (value === null || value === undefined || value === "") return "";
        return `<div class="employeeProfileRow"><b>${label}:</b> <span>${value}</span></div>`;
    }

    // ===========================================
    // OPEN
    // ===========================================

    window.openEmployeeProfile = async function (userId) {

        if (!userId) return;

        const modal = document.getElementById("employeeProfileModal");
        const body = document.getElementById("employeeProfileBody");
        if (!modal || !body) return;

        modal.classList.remove("hidden");
        body.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;

        try {

            const doc = await db.collection("users").doc(userId).get();

            if (!doc.exists) {
                body.innerHTML = `<div class="workspaceEmpty">Employee not found.</div>`;
                return;
            }

            const u = doc.data();
            const status = u.status || "Off Duty";
            const duration = formatDuration(Date.now() - (u.lastSwitchTime || Date.now()));
            const shift = window.getEmployeeAssignedShift?.(userId);
            const shiftLabel = shift
                ? `${shift.name} (${shift.startTime}–${shift.endTime})${shift.enabled === false ? " (Disabled)" : ""}`
                : "Unassigned";
            const joinDate = formatJoinDate(u.joinDate);
            const escapeName = window.ActivityTimelineHelpers?.escapeHtml || (s => s);
            const nameLine = u.name ? `<div class="employeeProfileName">${escapeName(u.name)}</div>` : "";

            body.innerHTML = `
                <div class="employeeProfileHeader">
                    <div class="employeeProfileAvatar">${statusDotFor(status)}</div>
                    <div>
                        <h3 class="employeeProfileCode">${userId}</h3>
                        ${nameLine}
                        <div class="employeeProfileStatusLine">${statusDotFor(status)} ${status} · ${duration}</div>
                    </div>
                </div>

                <div class="employeeProfileDetails">
                    ${row("Role", u.role)}
                    ${row("Permission Level", u.permissionLevel)}
                    ${row("Shift", shiftLabel)}
                    ${joinDate ? row("Joined", joinDate) : ""}
                </div>

                <hr>

                <h4>🕘 Today's Activity</h4>
                <div id="employeeProfileActivity"><div class="workspaceEmpty">Loading...</div></div>
            `;

            loadEmployeeActivity(userId);

        } catch (err) {
            console.error("Load employee profile failed:", err);
            body.innerHTML = `<div class="workspaceEmpty">Failed to load profile.</div>`;
        }
    };

    async function loadEmployeeActivity(userId) {

        const list = document.getElementById("employeeProfileActivity");
        if (!list) return;

        try {

            const snap = await db.collection("auditLogs")
                .where("user", "==", userId)
                .get();

            let entries = [];
            snap.forEach(d => entries.push(d.data()));

            // Same reasoning as activitytimeline.js: no .orderBy (avoids a
            // composite index), sort newest-first client-side, then scope
            // to "today" for this profile view (full history is what the
            // "My Activity" personal view / admin Audit Log are for).
            entries.sort((a, b) => (b.time || 0) - (a.time || 0));

            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            entries = entries.filter(e => (e.time || 0) >= startOfToday.getTime()).slice(0, 20);

            if (!entries.length) {
                list.innerHTML = `<div class="workspaceEmpty">No activity today.</div>`;
                return;
            }

            const helpers = window.ActivityTimelineHelpers;

            list.innerHTML = entries.map(entry => {
                const time = entry.time ? new Date(entry.time).toLocaleTimeString() : "";
                const icon = helpers ? helpers.iconFor(entry) : "🕘";
                const label = helpers ? helpers.friendlyLabel(entry) : (entry.action || "Activity");
                const escape = helpers ? helpers.escapeHtml : (s => s);

                return `
                    <div class="shiftBlock activityTimelineEntry">
                        <span class="activityTimelineIcon" aria-hidden="true">${icon}</span>
                        <div class="activityTimelineBody">
                            <b>${escape(label)}</b><br>
                            <small>${escape(time)}</small>
                        </div>
                    </div>
                `;
            }).join("");

        } catch (err) {
            console.error("Load employee activity failed:", err);
            list.innerHTML = `<div class="workspaceEmpty">Failed to load activity.</div>`;
        }
    }

    // ===========================================
    // INIT
    // ===========================================

    window.initializeEmployeeProfiles = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeEmployeeProfiles, 300);
            return;
        }

        if (initialized) return;
        initialized = true;

        const modal = document.getElementById("employeeProfileModal");
        const closeBtn = document.getElementById("employeeProfileCloseBtn");

        if (closeBtn) closeBtn.onclick = () => modal?.classList.add("hidden");

        console.log("👤 Employee Profiles module ready");
    };

})();