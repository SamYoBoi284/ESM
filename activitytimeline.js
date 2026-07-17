// ===========================================
// RelayDesk / ESM
// activitytimeline.js
// Personal "My Activity" timeline — a friendly, filtered view of the
// existing auditLogs collection, scoped to the signed-in user.
// ===========================================
//
// This does NOT replace or modify audit.js. audit.js still owns the
// full admin audit feed (canViewAudit-gated, all users, structured
// diffs, PDF export, clear log, etc). This module is a separate,
// read-only, personal-scope view: every user (not just admins) can
// see a plain-English log of their own actions.
//
// Query shape mirrors myhistory.js's own reasoning: filter by
// `.where("user", "==", ...)` alone (no `.orderBy`) so this never
// needs a composite Firestore index, then sort newest-first
// client-side.

(function () {

    let cachedEntries = [];
    let initialized = false;

    // ===========================================
    // FRIENDLY LABELS
    // ===========================================
    // Maps the action codes written by logAudit() (see audit.js,
    // status.js, shiftmanagement.js, admin-extras.js, etc) to
    // plain-English descriptions for this personal view. Anything not
    // in this map falls back to a de-slugified version of the action
    // code itself, so a newly added action code never disappears from
    // the timeline — it just looks a little less polished until it's
    // added here.
    //
    // English-only for now (no window.I18N wiring yet) — deliberate
    // scope cut to keep this a small, low-risk addition. Revisit if/
    // when this view needs Arabic support.

    const ACTION_LABELS = {
        "SHIFT_ENDED": "Ended shift",
        "OFF_DAY_SHIFT_STARTED": "Started an off-day shift",
        "LATE_CLOCK_IN": "Clocked in late",
        "OVERTIME_STARTED": "Started overtime",
        "OVERTIME_LOGGED": "Overtime logged",
        "OFF_DAY_OVERTIME_LOGGED": "Off-day overtime logged",
        "OVERTIME_REQUEST_SUPERSEDED": "An overtime request was superseded",
        "OVERTIME_APPROVED": "Overtime request approved",
        "OVERTIME_DENIED": "Overtime request denied",
        "LOAD_BOOKED": "Booked a load",
        "LOAD_EDITED": "Updated a booked load",
        "LOAD_DELETED": "Deleted a booked load",
        "DISPUTE_APPROVED": "Dispute approved",
        "DISPUTE_DENIED": "Dispute denied",
        "ANNOUNCEMENT_POSTED": "Posted an announcement",
        "ANNOUNCEMENT_DELETED": "Deleted an announcement",
        "PIN_RESET": "PIN was reset",
        "EMPLOYEE_CREATED": "Account created",
        "FEEDBACK_SUBMITTED": "Submitted feedback",
        "FEEDBACK_STATUS_CHANGED": "Feedback status changed",
        "FEEDBACK_FAVORITE_TOGGLED": "Feedback favorite toggled",
        "FEEDBACK_LABEL_ADDED": "Label added to feedback",
        "FEEDBACK_LABEL_REMOVED": "Label removed from feedback",
        "FEEDBACK_PLANNED_VERSION_SET": "Feedback planned version set",
        "FEEDBACK_UNLOCKED": "Feedback unlocked",
        "EXPORT_AUDIT_LOG": "Exported the audit log",
        "EXPORT_DEV_BACKUP": "Exported a dev backup",
        "EXPORT_MONTHLY_STATS": "Exported monthly stats",
        "EXPORT_SHIFT_HISTORY": "Exported shift history",
        "REPORT_EXPORT_CSV": "Exported a report (CSV)",
        "REPORT_EXPORT_PDF": "Exported a report (PDF)",
        "REPORT_GENERATED": "Generated a report",
        "STATS_CLEARED": "Cleared stats",
        "RELEASE_FINALIZED": "Release finalized",
        "ADMIN_ONLINE": "Came online",
        "ADMIN_OFFLINE": "Went offline",
        "AUTO_BREAK_IDLE": "Auto-switched to Break (idle)",
        "AUTO_OFFDUTY_IDLE": "Auto-switched to Off Duty (idle)",
        "IDLE_RETURN_ON_DUTY": "Returned to On Duty",
        "SHIFT_CREATED": "Created a shift",
        "SHIFT_UPDATED": "Updated a shift",
        "SHIFT_DELETED": "Deleted a shift",
        "SHIFT_ENABLED": "Enabled a shift",
        "SHIFT_DISABLED": "Disabled a shift"
    };

    // ===========================================
    // ICONS (Phase 0 polish)
    // ===========================================
    // Small per-entry emoji so the timeline reads a bit more alive at a
    // glance, instead of a uniform wall of text. Purely cosmetic — no
    // effect on data, filtering, or the underlying auditLogs collection.
    //
    // "Status Changed" entries reuse the same colored-dot convention
    // already shown in the live status pill (see status.js
    // updateStatusDisplay()) so the color stays consistent app-wide
    // instead of introducing a second, competing icon language.

    const STATUS_DOTS = {
        "On Duty": "🟢",
        "Break": "🟡",
        "Away": "🟣",
        "Off Duty": "🔴",
        "End Shift": "⚫"
    };

    const ACTION_ICONS = {
        "SHIFT_ENDED": "⚫",
        "OFF_DAY_SHIFT_STARTED": "🌙",
        "LATE_CLOCK_IN": "⏰",
        "OVERTIME_STARTED": "⏱️",
        "OVERTIME_LOGGED": "⏱️",
        "OFF_DAY_OVERTIME_LOGGED": "⏱️",
        "OVERTIME_REQUEST_SUPERSEDED": "⏱️",
        "OVERTIME_APPROVED": "✅",
        "OVERTIME_DENIED": "🚫",
        "LOAD_BOOKED": "📦",
        "LOAD_EDITED": "📦",
        "LOAD_DELETED": "🗑️",
        "DISPUTE_APPROVED": "⚖️",
        "DISPUTE_DENIED": "⚖️",
        "ANNOUNCEMENT_POSTED": "📢",
        "ANNOUNCEMENT_DELETED": "🗑️",
        "PIN_RESET": "🔑",
        "EMPLOYEE_CREATED": "👤",
        "FEEDBACK_SUBMITTED": "💬",
        "FEEDBACK_STATUS_CHANGED": "💬",
        "FEEDBACK_FAVORITE_TOGGLED": "⭐",
        "FEEDBACK_LABEL_ADDED": "🏷️",
        "FEEDBACK_LABEL_REMOVED": "🏷️",
        "FEEDBACK_PLANNED_VERSION_SET": "🏷️",
        "FEEDBACK_UNLOCKED": "🔓",
        "EXPORT_AUDIT_LOG": "📤",
        "EXPORT_DEV_BACKUP": "📤",
        "EXPORT_MONTHLY_STATS": "📤",
        "EXPORT_SHIFT_HISTORY": "📤",
        "REPORT_EXPORT_CSV": "📤",
        "REPORT_EXPORT_PDF": "📤",
        "REPORT_GENERATED": "📊",
        "STATS_CLEARED": "🧹",
        "RELEASE_FINALIZED": "🚀",
        "ADMIN_ONLINE": "🟢",
        "ADMIN_OFFLINE": "🔴",
        "AUTO_BREAK_IDLE": "💤",
        "AUTO_OFFDUTY_IDLE": "💤",
        "IDLE_RETURN_ON_DUTY": "🟢",
        "SHIFT_CREATED": "🆕",
        "SHIFT_UPDATED": "✏️",
        "SHIFT_DELETED": "🗑️",
        "SHIFT_ENABLED": "✅",
        "SHIFT_DISABLED": "🚫"
    };

    // Keyword fallback so a newly added action code (not yet in
    // ACTION_ICONS above) still gets a sensible icon instead of always
    // falling back to the generic default — same "never disappears,
    // just looks a little less polished" philosophy as friendlyLabel().
    const ICON_KEYWORD_FALLBACKS = [
        [/LOAD/, "📦"],
        [/OVERTIME/, "⏱️"],
        [/SHIFT/, "⏰"],
        [/DISPUTE/, "⚖️"],
        [/ANNOUNCEMENT/, "📢"],
        [/FEEDBACK/, "💬"],
        [/EXPORT/, "📤"],
        [/REPORT|STATS/, "📊"],
        [/IDLE/, "💤"],
        [/PIN/, "🔑"],
        [/EMPLOYEE/, "👤"],
        [/DELETE/, "🗑️"]
    ];

    function iconFor(entry) {
        if (entry.action === "Status Changed") {
            return STATUS_DOTS[entry.detail] || "⚪";
        }

        if (ACTION_ICONS[entry.action]) return ACTION_ICONS[entry.action];

        const code = String(entry.action || "").toUpperCase();
        for (const [pattern, icon] of ICON_KEYWORD_FALLBACKS) {
            if (pattern.test(code)) return icon;
        }

        return "🕘";
    }

    function friendlyLabel(entry) {

        // Special case: status.js logs this one as action="Status
        // Changed", detail=<newStatus>. Turn that into "Changed status
        // to Break" the way the spec describes, rather than showing
        // "Status Changed" + a separate detail line.
        if (entry.action === "Status Changed") {
            return `Changed status to ${entry.detail || "—"}`;
        }

        if (ACTION_LABELS[entry.action]) return ACTION_LABELS[entry.action];

        // Fallback: de-slugify unknown/future action codes
        // ("SOME_NEW_ACTION" -> "Some new action") instead of hiding them.
        return String(entry.action || "Activity")
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/^./, c => c.toUpperCase());
    }

    function detailLine(entry) {
        // Status changes already fold their detail into the label above.
        if (entry.action === "Status Changed") return "";
        return entry.detail ? escapeHtml(String(entry.detail)) : "";
    }

    // ===========================================
    // INIT
    // ===========================================

    window.initializeActivityTimeline = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeActivityTimeline, 300);
            return;
        }

        if (initialized) return;
        initialized = true;

        const openBtn = document.getElementById("activityTimelineBtn");
        const closeBtn = document.getElementById("activityTimelineCloseBtn");
        const modal = document.getElementById("activityTimelineModal");

        if (openBtn) {
            openBtn.onclick = () => {
                modal?.classList.remove("hidden");
                loadMyActivity();
            };
        }

        if (closeBtn) {
            closeBtn.onclick = () => modal?.classList.add("hidden");
        }

        console.log("🕘 Activity Timeline module ready");
    };

    async function loadMyActivity() {

        const list = document.getElementById("activityTimelineList");
        if (!list) return;

        list.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;

        try {

            const snap = await db.collection("auditLogs")
                .where("user", "==", RelayDesk.currentUser)
                .get();

            cachedEntries = [];
            snap.forEach(doc => cachedEntries.push(doc.data()));

            // sort newest-first client-side (avoids needing a composite index —
            // same reasoning as myhistory.js's loadMyShifts())
            cachedEntries.sort((a, b) => (b.time || 0) - (a.time || 0));

            if (!cachedEntries.length) {
                list.innerHTML = `<div class="workspaceEmpty">No activity yet.</div>`;
                return;
            }

            // Cap the render to the most recent 50 — this is a quick personal
            // glance, not an export tool. (Admins wanting the full history
            // across all users already have the Audit Log in the Admin Panel.)
            const visible = cachedEntries.slice(0, 50);

            list.innerHTML = visible.map(entry => {

                const time = entry.time ? new Date(entry.time).toLocaleString() : "";
                const detail = detailLine(entry);
                const icon = iconFor(entry);

                return `
                    <div class="shiftBlock activityTimelineEntry">
                        <span class="activityTimelineIcon" aria-hidden="true">${icon}</span>
                        <div class="activityTimelineBody">
                            <b>${escapeHtml(friendlyLabel(entry))}</b><br>
                            <small>${escapeHtml(time)}</small>
                            ${detail ? `<div>${detail}</div>` : ""}
                        </div>
                    </div>
                `;
            }).join("");

        } catch (err) {
            console.error("Load my activity failed:", err);
            list.innerHTML = `<div class="workspaceEmpty">Failed to load activity.</div>`;
        }
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // Phase 2 (employeeprofile.js) reuses these pure/read-only helpers
    // to render another employee's activity timeline on their profile,
    // instead of duplicating the icon/label maps in a second file.
    window.ActivityTimelineHelpers = { iconFor, friendlyLabel, detailLine, escapeHtml };

})();