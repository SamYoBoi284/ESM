(() => {
    const GUIDE_DATA = [
        {
            id: "overview",
            icon: "🧭",
            title: "Admin Guide Overview",
            body: [
                { p: "This guide is meant to help you use the Admin dashboard quickly and confidently during a normal shift." },
                { p: "The main goal is to keep operations organized, understand what is happening in real time, and resolve issues without confusion." },
                { p: "Most of your daily admin work will revolve around these core tasks:" },
                { ul: [
                    "Confirming whether the admin desk is currently Online or Offline",
                    "Checking recent loads and the current status of outstanding entries",
                    "Reviewing the audit log for activity and changes",
                    "Monitoring staff availability and workload through the dashboard panels"
                ]}
            ]
        },
        {
            id: "admin-status",
            icon: "🟢",
            title: "Admin Status & Availability",
            body: [
                { p: "Use the Online and Offline buttons to signal whether you are actively monitoring the system or temporarily stepping away." },
                { p: "Switch to Online when you are handling requests, reviewing updates, or responding to issues in real time." },
                { p: "Switch to Offline when you are away, focused on another task, or finishing up work for the moment." },
                { p: "This status is visible to the team and helps colleagues know whether they can expect an immediate response from admin." }
            ]
        },
        {
            id: "load-history",
            icon: "🔍",
            title: "Load History & Load Review",
            body: [
                { p: "Open Load History whenever you need to verify one load, inspect a trend, or investigate a reported issue." },
                { p: "Search by date, VRID, driver, or department to locate specific loads quickly and avoid scrolling through unrelated entries." },
                { p: "This is especially useful when a user asks about a booked load, when a load appears incorrect, or when you need to confirm whether a correction was already made." },
                { p: "If a load was edited or changed, reviewing its history helps you understand what happened and whether the change was appropriate." }
            ]
        },
        {
            id: "status-workflow",
            icon: "🔄",
            title: "Load Status Workflow",
            body: [
                { p: "Loads may move through several statuses as they are reviewed and handled over time." },
                { p: "The most common flow is from booked to cancelled, disputed, appealed, or paid depending on the situation and the reason for the change." },
                { p: "When a load needs attention, make sure you understand the current status before applying a change, because the next allowed steps depend on what state the load is already in." },
                { p: "Only request or apply the next valid transition for that load so the history remains clean and consistent." }
            ]
        },
        {
            id: "audit-log",
            icon: "📜",
            title: "Audit Log",
            body: [
                { p: "The Audit Log is one of the most important tools for reviewing changes and understanding what happened during a shift." },
                { p: "Refresh it regularly to see the latest actions, or filter by user, action, or date range if you are investigating a specific issue." },
                { p: "Use it when you need to confirm who changed something, when it happened, and whether the change was expected." },
                { p: "It is especially useful when a user reports a problem or when you want to confirm that a correction was completed properly." }
            ]
        },
        {
            id: "permissions",
            icon: "🔐",
            title: "Permissions & Access",
            body: [
                { p: "For non-super-admin users, admin access is not only about seeing more information — it also means being trusted to act on sensitive changes within the scope of your assigned permissions." },
                { p: "The real super admin account remains A000, and non-super-admin admins should treat that role as the highest-level authority for system-wide decisions." },
                { p: "Make sure you are aware of the permissions available to you and the level of access each action requires before changing or deleting anything important." },
                { p: "If a feature or button does not appear for you, it usually means your current permissions do not allow that action." },
                { p: "If you believe a permission should be available but it is not, check with the appropriate owner or admin before assuming it is a bug." },
                { p: "To edit an existing user's permissions, open the user management area, select the target person, and adjust the permission toggles carefully based on their role and operational needs." },
                { p: "Permissions should be granted only when necessary, and should be reviewed regularly so users do not keep access they no longer need." }
            ]
        },
        {
            id: "user-management",
            icon: "👤",
            title: "Creating Users & Managing Accounts",
            body: [
                { p: "When creating a new user, enter the required account details and confirm the initial role and permissions before saving." },
                { p: "A new user should be assigned the appropriate baseline permissions based on their job, such as dispatch, safety, supervisor, or admin responsibilities." },
                { p: "After creation, review the account carefully to ensure the correct status, permissions, and initial access are in place." },
                { p: "For existing users, you can update their role, permissions, and status as their responsibilities change over time." },
                { p: "If an account should be temporarily blocked, use the freeze or account-access controls only when appropriate and document the reason clearly." }
            ]
        },
        {
            id: "off-days",
            icon: "🗓️",
            title: "Off Days, Weekly Scheduling & Requests",
            body: [
                { p: "Off days are part of the user's weekly schedule and should be reviewed regularly to make sure the roster is correct." },
                { p: "When assigning or changing a user’s off days, confirm the correct day or days before saving so the schedule remains accurate." },
                { p: "If a user requests a different day off, review the request, verify the current schedule, and approve or deny it based on staffing and operational need." },
                { p: "A pending request should not be treated as final until it is approved, and the actual schedule should not change until the admin confirms it." },
                { p: "Off-day changes can affect late-clock-in logic, overtime behavior, and overall shift planning, so they should be handled carefully." }
            ]
        },
        {
            id: "shift-assignment",
            icon: "🕐",
            title: "Shift Assignment & Existing Users",
            body: [
                { p: "Shift assignment controls allow you to assign or update a user's scheduled shift pattern based on their role and availability." },
                { p: "When assigning shifts to existing users, confirm their current schedule first so you do not overwrite a needed pattern or create a conflict." },
                { p: "When creating a new user, set their initial shift assignment carefully so the system has a clear schedule from the beginning." },
                { p: "If the user’s duties change, update their assignment rather than leaving the old pattern in place by mistake." },
                { p: "Shift assignments affect timing, attendance tracking, overtime, and reporting, so they should always be reviewed before being saved." }
            ]
        },
        {
            id: "action-center",
            icon: "🧠",
            title: "Admin Action Center",
            body: [
                { p: "The Admin Action Center is the main place for operational decisions that affect users, loads, schedules, and account access." },
                { p: "Use it to review requests, make changes, confirm updates, and keep the team aligned with the current workflow." },
                { p: "Every button in the Action Center should be interpreted as an operational action rather than a simple display option." },
                { p: "Approve or deny user changes carefully, confirm permission changes before saving, and make sure any schedule modification is intentional and appropriate." },
                { p: "If a button updates a user record, load record, or system setting, check the current state first and make sure you understand the impact before clicking it." }
            ]
        },
        {
            id: "announcements-detail",
            icon: "📣",
            title: "Announcements & Dropdown Options",
            body: [
                { p: "Announcements are used to share important information with staff, such as policy updates, safety notes, schedule changes, maintenance notices, or operational reminders." },
                { p: "Use the announcement category or type options to match the message to the correct purpose, such as a general update, an urgent notice, or a team-specific briefing." },
                { p: "Use the audience or visibility options to decide whether the announcement should reach everyone, a specific team, or only a certain group of users." },
                { p: "Use the priority or urgency options for messages that require immediate attention, such as urgent safety information or operational changes." },
                { p: "Use the schedule or expiration options when a message should only remain visible for a temporary period, such as a short-term maintenance window or a temporary policy change." },
                { p: "If a dropdown option is unclear, choose the one that best matches the message’s urgency, scope, and expected audience rather than trying to force an unrelated category." }
            ]
        },
        {
            id: "alerts-panel",
            icon: "🚨",
            title: "Alerts Panel",
            body: [
                { p: "The Alerts panel is the admin dashboard’s live attention queue. Review it regularly during a shift so you can spot attendance issues, extended status changes, and pending approvals before they become larger problems." },
                { ul: [
                    "Late clock-ins: this alert means an employee was assigned to a shift but has not clocked on after the grace period. It appears when the employee is still marked Off Duty or otherwise not active after their expected start time. Respond by confirming their current status, checking whether the delay is valid, and following up if the lateness is unexplained or repeated.",
                    "Extended breaks: this alert means an employee has been on break longer than the system threshold. It appears when the break has lasted beyond the expected limit, usually because the employee is still away from work or the break has stretched beyond normal expectations. Respond by checking whether the break is still necessary, reminding the employee of the expected return time, and escalating only if the delay is unreasonable or affecting operations.",
                    "Extended away status: this alert means an employee has remained in Away status for an unusually long time. It appears when the employee has been away from active duty longer than the configured threshold. Respond by confirming whether they are truly away, whether they need support, and whether the status should be corrected or the team should be notified.",
                    "Overtime requests: this alert means an employee has submitted a request to work extra time. It appears when a pending overtime request is saved in the system and needs admin review. Respond by checking the reason, confirming that the request fits staffing and policy expectations, and approve or deny it promptly.",
                    "Off-day change requests: this alert means an employee wants a different weekly off day than the one currently scheduled. It appears when a pending request has been submitted and is waiting for approval. Respond by reviewing the current schedule, the staffing impact, and the employee’s reason, then approve or deny the change so the roster remains accurate."
                ]}
            ]
        },
        {
            id: "team-insights",
            icon: "👥",
            title: "Team Monitoring & User Insights",
            body: [
                { p: "Use the dashboard panels to monitor workload, user activity, recent shifts, and operational patterns across the team." },
                { p: "Clicking into an individual user gives you a deeper look at their recent history and helps you understand how their workload is evolving." },
                { p: "This information is helpful for identifying issues early, spotting unusual patterns, and supporting the team with better follow-up." }
            ]
        },
        {
            id: "announcements",
            icon: "📢",
            title: "Announcements & Communication",
            body: [
                { p: "Announcements help keep the team informed about important operational updates without relying on scattered messages." },
                { p: "Use them for schedule information, policy updates, maintenance notices, and other information that everyone should see." },
                { p: "If a message is time-sensitive, make sure it is clear, concise, and easy to understand so staff can act on it quickly." }
            ]
        },
        {
            id: "daily-routine",
            icon: "🛠️",
            title: "Recommended Daily Routine",
            body: [
                { p: "A strong daily admin routine is to check the system status first, review any recent load activity, and then scan the audit log for anything unusual." },
                { p: "After that, check the dashboard panels for workload or user issues that may need attention before the next wave of requests arrives." },
                { p: "If a user reports a problem, start by confirming the details in the relevant record before taking action, so you can respond professionally and accurately." },
                { p: "The goal is to stay proactive, keep the operation visible, and resolve questions before they grow into larger issues." }
            ]
        },
        {
            id: "troubleshooting",
            icon: "⚠️",
            title: "Troubleshooting & Best Practices",
            body: [
                { p: "If something seems inconsistent, start by checking the relevant load, user record, and audit event before changing anything else." },
                { p: "When you are unsure, verify the current state rather than assuming a previous action was completed successfully." },
                { p: "Keep notes clear, stay consistent with the workflow, and document any unusual issues so follow-up is easier for the next admin or shift lead." }
            ]
        },
        {
            id: "admin-buttons",
            icon: "🧩",
            title: "How Every Admin Panel Button Works",
            body: [
                { p: "This section explains the purpose of each visible control in the admin panel so you can use the screen confidently without guessing." },
                { p: "🟢 Online: switches the admin account to Online and marks the admin as available for active monitoring and response." },
                { p: "🔴 Offline: switches the admin account to Offline and marks the admin as temporarily unavailable or not actively monitoring." },
                { p: "🔍 Search Loads: opens the Load History tool so you can search booked loads across the system by date, VRID, driver, or department." },
                { p: "🔄 Refresh: reloads the audit log so you can see the newest changes immediately without refreshing the whole page." },
                { p: "🗑 Clear Log: removes the existing audit log entries from the visible log area. Use with care because it permanently clears the currently loaded log content." },
                { p: "Filter controls: let you narrow the audit log by specific user, action type, or date range so you can investigate a particular issue faster." },
                { p: "Filter button: applies the selected audit filter values and updates the visible results based on your chosen criteria." },
                { p: "📊 Statistics / user panel controls: show the current system workload and allow you to inspect users, shifts, and performance details from the admin overview." },
                { p: "👤 User drilldown actions: open deeper views for a selected employee so you can inspect their status, shifts, and related history in more detail." },
                { p: "🔁 Refresh Shifts: rebuilds or refreshes the shift-history view so the latest shift data is displayed correctly." },
                { p: "� Load History / Search Loads: used to investigate any load ever booked, not just the current shift, and is one of the most common admin review tools." },
                { p: "🧾 Audit filters: let you narrow results by user, action, or date range when you are investigating a specific change or issue." },
                { p: "🗑 Clear Log: removes the currently visible audit log content from the page. Use this only when you are sure the old entries no longer need to be reviewed." },
                { p: "📅 Shift history buttons: help you review, rebuild, or refresh historical shift information when the data looks incomplete or stale." },
                { p: "�🛠 Admin-only tools: any additional admin function that appears in the panel is intended for operational control and should be used carefully and only when needed." },
                { p: "Best rule: if a button changes data, updates state, or removes records, treat it as a high-impact action and confirm the current context before using it." }
            ]
        },
        {
            id: "settings",
            icon: "⚙️",
            title: "Settings",
            body: [
                { p: "Settings is available to every account, including admins, from the ⚙️ Settings button in the top bar or the dashboard sidebar. Every option here is stored locally on that one computer and only changes how ESM behaves there — it never reads or writes shared team data, so the same employee can have different Settings on different machines." },
                { p: "General" },
                { p: "Remember Login keeps an employee signed in across app restarts on that computer by saving their code locally; turning it off makes ESM always start at the login screen, and clears any login it had already remembered the next time the app closes or that employee logs out. Confirm Before Closing While On Duty shows a confirmation dialog if the window is closed while the employee is On Duty (Off Duty closes normally, no prompt). Minimize To Tray controls whether the X button hides ESM to the system tray (click the tray icon to restore) or exits the app completely. Launch On Windows Startup opens ESM automatically in the background on sign-in, via Electron's login-item API. Clear Local Cache clears cached local data (queued offline writes, small local flags) without signing the employee out, changing their Settings, or touching Firestore. Reset Settings restores every option on the page to default immediately." },
                { p: "Appearance" },
                { p: "UI Scale offers 75% through 150% and applies instantly; Ctrl + Mouse Wheel and the Ctrl + Plus / Minus / 0 shortcuts do the same thing on the fly. Whatever level an employee lands on is remembered locally and reapplied the next time they open ESM on that computer." },
                { p: "Notifications" },
                { p: "Desktop notifications and notification sounds each have a master on/off switch, and sounds additionally have five separate category toggles: chat, load updates, announcements, overtime requests, and shift reminders — so an employee can, for example, silence load-update sounds while keeping chat sounds on." },
                { p: "Chat" },
                { p: "Enter to Send and Ctrl+Enter to Send are independent toggles — either, both, or neither can send a message; whichever combo's toggle is off just inserts a newline instead. Shift+Enter always inserts a newline regardless of these settings. Auto Scroll controls whether the chat window always jumps to the newest message or leaves the employee's scroll position alone." },
                { p: "Load Management" },
                { p: "Confirm Before Delete adds a confirmation dialog before any load is removed. Highlight Recently Edited Loads briefly pulses a load's outline right after it's edited, fading after about 5 minutes. Default Sort Order (Newest, VRID, or Price) controls how the booked-loads list is ordered within each Department/Driver/VRID Type grouping, and is remembered per computer." },
                { p: "Shift" },
                { p: "Shift Reminder fires once an employee has been On Duty for the selected duration (Disabled, 15, or 30 minutes) into the current shift. Extended Away Reminder and Break Reminder each independently notify the employee if they've stayed on Away or Break status longer than expected, and both reset automatically the moment the employee switches to any other status, so they can fire again on the next stay." },
                { p: "Keyboard Shortcuts" },
                { p: "Ctrl + N opens Add Load, Ctrl + H opens Load History, Ctrl + K opens Team Chat, Ctrl + , opens Settings, Escape closes the topmost open modal (or Settings itself), and Ctrl + Shift + A opens the Admin Panel for accounts with admin access. All of these except Escape, Ctrl + ,, and Ctrl + Shift + A are automatically suppressed while the employee is typing in a text field or textarea, so they never interfere with normal typing." },
                { p: "About" },
                { p: "Shows the installed ESM/application version, the Electron version, the build date, the operating system, the application's install path and user data path, and the currently logged-in employee — all read automatically from the application package and the Electron runtime, nothing to configure." }
            ]
        }
    ];

    function renderBlock(block) {
        if (block.p) {
            const p = document.createElement("p");
            p.textContent = block.p;
            return p;
        }

        if (block.ul) {
            const ul = document.createElement("ul");
            block.ul.forEach(item => {
                const li = document.createElement("li");
                li.textContent = item;
                ul.appendChild(li);
            });
            return ul;
        }

        return document.createTextNode("");
    }

    function renderAdminGuide() {
        const body = document.getElementById("adminGuideBody");
        const toc = document.getElementById("adminGuideToc");
        const noResults = document.getElementById("adminGuideNoResults");

        if (!body || !toc) return;

        body.innerHTML = "";
        toc.innerHTML = "";
        if (noResults) noResults.classList.add("hidden");

        GUIDE_DATA.forEach(section => {
            const link = document.createElement("a");
            link.href = "#admin-guide-" + section.id;
            link.className = "guideTocLink";
            link.textContent = section.icon + " " + section.title;
            link.addEventListener("click", (e) => {
                e.preventDefault();
                jumpToSection(section.id);
            });
            toc.appendChild(link);

            const el = document.createElement("div");
            el.className = "guideSection";
            el.id = "admin-guide-" + section.id;
            el.dataset.id = section.id;

            const header = document.createElement("button");
            header.type = "button";
            header.className = "guideSectionHeader";
            header.setAttribute("aria-expanded", "false");
            header.innerHTML =
                '<span class="guideSectionIcon">' + section.icon + '</span>' +
                '<span class="guideSectionTitle">' + section.title + '</span>' +
                '<span class="guideSectionChevron">▾</span>';

            header.addEventListener("click", () => toggleSection(el));

            const contentBody = document.createElement("div");
            contentBody.className = "guideSectionBody";

            section.body.forEach(block => {
                contentBody.appendChild(renderBlock(block));
            });

            el.appendChild(header);
            el.appendChild(contentBody);
            body.appendChild(el);
        });
    }

    function toggleSection(el, forceOpen) {
        const shouldOpen = forceOpen !== undefined ? forceOpen : !el.classList.contains("open");
        el.classList.toggle("open", shouldOpen);
        const header = el.querySelector(".guideSectionHeader");
        if (header) header.setAttribute("aria-expanded", String(shouldOpen));
    }

    function jumpToSection(id) {
        const el = document.getElementById("admin-guide-" + id);
        if (!el) return;

        const searchInput = document.getElementById("adminGuideSearchInput");
        if (searchInput && searchInput.value) {
            searchInput.value = "";
            applySearchFilter("");
        }

        toggleSection(el, true);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function applySearchFilter(query) {
        const q = query.trim().toLowerCase();
        const sections = document.querySelectorAll("#adminGuideBody .guideSection");
        const noResults = document.getElementById("adminGuideNoResults");
        let anyVisible = false;

        sections.forEach(el => {
            const matches = !q || el.innerText.toLowerCase().includes(q);
            el.classList.toggle("hidden", !matches);

            if (matches) {
                anyVisible = true;
                if (q) toggleSection(el, true);
            }
        });

        if (noResults) noResults.classList.toggle("hidden", anyVisible);
    }

    function openAdminGuide() {
        const guideScreen = document.getElementById("adminGuideScreen");
        const adminScreen = document.getElementById("adminScreen");
        if (!guideScreen) return;

        document.querySelectorAll(".screen").forEach(screen => screen.classList.add("hidden"));
        guideScreen.classList.remove("hidden");
        adminScreen?.classList.add("hidden");
    }

    function closeAdminGuide() {
        const guideScreen = document.getElementById("adminGuideScreen");
        const adminScreen = document.getElementById("adminScreen");
        if (!guideScreen) return;

        guideScreen.classList.add("hidden");
        adminScreen?.classList.remove("hidden");
    }

    function initAdminGuide() {
        renderAdminGuide();

        const openBtn = document.getElementById("openAdminGuideBtn");
        const backBtn = document.getElementById("adminGuideBackBtn");
        const searchInput = document.getElementById("adminGuideSearchInput");

        openBtn?.addEventListener("click", openAdminGuide);
        backBtn?.addEventListener("click", closeAdminGuide);
        searchInput?.addEventListener("input", () => applySearchFilter(searchInput.value));
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", initAdminGuide);
    } else {
        initAdminGuide();
    }

    window.openAdminGuide = openAdminGuide;
    window.closeAdminGuide = closeAdminGuide;
})();
