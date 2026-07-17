// ===========================================
// RelayDesk / ESM
// notificationcenter.js
// PHASE 1: Notification Center
// ===========================================
//
// A persistent, general (non-shift-based) notification history —
// separate from the "My Activity" timeline (auditLogs, action-based)
// and separate from the toast pipeline in notificationmanager.js
// (transient, disappears after a few seconds).
//
// This module does NOT remove or replace toasts. notificationmanager.js
// still owns showToast()/notify() exactly as before. This module simply
// also writes a persistent record every time notify() fires, via a
// single additive hook (see the end of notificationmanager.js's
// notify() method) so nothing else in the app has to change.
//
// Storage: Firestore collection "notificationHistory", scoped to
// RelayDesk.currentUser. Query pattern mirrors myhistory.js /
// activitytimeline.js: `.where("user", "==", ...)` with no `.orderBy`
// (avoids needing a composite Firestore index), sorted newest-first
// client-side.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    let cachedEntries = [];
    let unreadCount = 0;
    let initialized = false;
    let activeFilter = "all";

    // Maps the same category strings NotificationManager already
    // normalizes (see notificationmanager.js normalizeCategory()) into
    // the six user-facing filter groups from the spec. Categories not
    // listed here (including any future ones) fall back to "system"
    // so nothing silently disappears from the center.
    const CATEGORY_TO_GROUP = {
        system: "System",
        admin: "System",
        away: "Status",
        offday: "Status",
        alerts: "Status",
        overtime: "Status",
        chat: "Chat",
        announcements: "Announcements",
        reports: "Reports",
        load: "Loads"
    };

    const GROUPS = ["All", "System", "Status", "Chat", "Announcements", "Reports", "Loads"];

    const GROUP_ICONS = {
        System: "⚙️",
        Status: "🚶",
        Chat: "💬",
        Announcements: "📢",
        Reports: "📊",
        Loads: "📦"
    };

    function groupFor(category) {
        return CATEGORY_TO_GROUP[category] || "System";
    }

    // ===========================================
    // WRITE — called from notificationmanager.js notify()
    // ===========================================
    // Fire-and-forget by design: a persistence hiccup here must never
    // block or delay the toast/desktop-notification pipeline itself.
    window.NotificationCenter = window.NotificationCenter || {};

    window.NotificationCenter.log = function (entry) {
        try {
            if (!window.db || !RelayDesk.currentUser || RelayDesk.currentUser === "A000") return;

            const doc = {
                user: RelayDesk.currentUser,
                message: entry.message || "",
                category: entry.category || "system",
                priority: entry.priority || "info",
                time: entry.timestamp || Date.now(),
                read: false
            };

            if (!doc.message) return;

            db.collection("notificationHistory").add(doc).then(() => {
                // Only bump the live badge/list if the center has already
                // been initialized for this session (avoids double-counting
                // on the very first load, which fetches its own fresh count).
                if (initialized) {
                    unreadCount++;
                    renderBadge();
                    if (!document.getElementById("notificationCenterModal")?.classList.contains("hidden")) {
                        loadNotificationCenter();
                    }
                }
            }).catch(err => console.warn("NotificationCenter: failed to log entry:", err));

        } catch (err) {
            console.warn("NotificationCenter.log failed:", err);
        }
    };

    // ===========================================
    // INIT
    // ===========================================

    window.initializeNotificationCenter = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeNotificationCenter, 300);
            return;
        }

        if (initialized) return;
        initialized = true;

        const openBtn = document.getElementById("notificationCenterBtn");
        const closeBtn = document.getElementById("notificationCenterCloseBtn");
        const modal = document.getElementById("notificationCenterModal");
        const markAllReadBtn = document.getElementById("notifCenterMarkAllReadBtn");
        const clearReadBtn = document.getElementById("notifCenterClearReadBtn");
        const clearAllBtn = document.getElementById("notifCenterClearAllBtn");
        const filterBar = document.getElementById("notifCenterFilterBar");

        if (openBtn) {
            openBtn.onclick = () => {
                modal?.classList.remove("hidden");
                loadNotificationCenter();
            };
        }

        if (closeBtn) {
            closeBtn.onclick = () => modal?.classList.add("hidden");
        }

        if (markAllReadBtn) {
            markAllReadBtn.onclick = markAllRead;
        }

        if (clearReadBtn) {
            clearReadBtn.onclick = () => clearEntries(entry => entry.read);
        }

        if (clearAllBtn) {
            clearAllBtn.onclick = () => clearEntries(() => true);
        }

        if (filterBar) {
            filterBar.querySelectorAll("[data-notif-filter]").forEach(btn => {
                btn.onclick = () => {
                    activeFilter = btn.dataset.notifFilter;
                    filterBar.querySelectorAll("[data-notif-filter]").forEach(b =>
                        b.classList.toggle("notifCenterFilterActive", b === btn));
                    renderList();
                };
            });
        }

        refreshUnreadCount();

        console.log("🔔 Notification Center module ready");
    };

    // ===========================================
    // READ / LOAD
    // ===========================================

    async function loadNotificationCenter() {
        const list = document.getElementById("notificationCenterList");
        if (!list) return;

        list.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;

        try {
            const snap = await db.collection("notificationHistory")
                .where("user", "==", RelayDesk.currentUser)
                .get();

            cachedEntries = [];
            snap.forEach(doc => cachedEntries.push({ id: doc.id, ...doc.data() }));

            cachedEntries.sort((a, b) => (b.time || 0) - (a.time || 0));

            unreadCount = cachedEntries.filter(e => !e.read).length;
            renderBadge();
            renderList();

        } catch (err) {
            console.error("Load notification center failed:", err);
            list.innerHTML = `<div class="workspaceEmpty">Failed to load notifications.</div>`;
        }
    }

    // Lightweight count-only fetch on login so the bell badge is correct
    // before the user ever opens the panel.
    async function refreshUnreadCount() {
        try {
            if (!window.db || !RelayDesk.currentUser || RelayDesk.currentUser === "A000") return;

            const snap = await db.collection("notificationHistory")
                .where("user", "==", RelayDesk.currentUser)
                .get();

            cachedEntries = [];
            snap.forEach(doc => cachedEntries.push({ id: doc.id, ...doc.data() }));
            unreadCount = cachedEntries.filter(e => !e.read).length;
            renderBadge();
        } catch (err) {
            console.warn("NotificationCenter: could not refresh unread count:", err);
        }
    }

    function renderList() {
        const list = document.getElementById("notificationCenterList");
        if (!list) return;

        const visible = activeFilter === "all"
            ? cachedEntries
            : cachedEntries.filter(e => groupFor(e.category) === activeFilter);

        const capped = visible.slice(0, 100);

        if (!capped.length) {
            list.innerHTML = `<div class="workspaceEmpty">No notifications.</div>`;
            return;
        }

        list.innerHTML = capped.map(entry => {
            const time = entry.time ? new Date(entry.time).toLocaleString() : "";
            const group = groupFor(entry.category);
            const icon = GROUP_ICONS[group] || "🔔";

            return `
                <div class="shiftBlock notifCenterEntry ${entry.read ? "" : "notifCenterEntryUnread"}" data-notif-id="${entry.id}">
                    <span class="activityTimelineIcon" aria-hidden="true">${icon}</span>
                    <div class="activityTimelineBody">
                        <b>${escapeHtml(entry.message)}</b><br>
                        <small>${escapeHtml(group)} · ${escapeHtml(time)}</small>
                    </div>
                </div>
            `;
        }).join("");

        list.querySelectorAll("[data-notif-id]").forEach(el => {
            el.onclick = () => markOneRead(el.dataset.notifId);
        });
    }

    // ===========================================
    // ACTIONS
    // ===========================================

    async function markOneRead(id) {
        const entry = cachedEntries.find(e => e.id === id);
        if (!entry || entry.read) return;

        entry.read = true;
        unreadCount = Math.max(0, unreadCount - 1);
        renderBadge();
        renderList();

        try {
            await db.collection("notificationHistory").doc(id).update({ read: true });
        } catch (err) {
            console.warn("NotificationCenter: failed to mark entry read:", err);
        }
    }

    async function markAllRead() {
        const unread = cachedEntries.filter(e => !e.read);
        if (!unread.length) return;

        unread.forEach(e => e.read = true);
        unreadCount = 0;
        renderBadge();
        renderList();

        try {
            const batch = db.batch();
            unread.forEach(e => batch.update(db.collection("notificationHistory").doc(e.id), { read: true }));
            await batch.commit();
        } catch (err) {
            console.warn("NotificationCenter: failed to mark all read:", err);
        }
    }

    async function clearEntries(predicate) {
        const toRemove = cachedEntries.filter(predicate);
        if (!toRemove.length) return;

        cachedEntries = cachedEntries.filter(e => !predicate(e));
        unreadCount = cachedEntries.filter(e => !e.read).length;
        renderBadge();
        renderList();

        try {
            const batch = db.batch();
            toRemove.forEach(e => batch.delete(db.collection("notificationHistory").doc(e.id)));
            await batch.commit();
        } catch (err) {
            console.warn("NotificationCenter: failed to clear entries:", err);
        }
    }

    // ===========================================
    // BADGE
    // ===========================================

    function renderBadge() {
        const badge = document.getElementById("notificationCenterBadge");
        if (!badge) return;
        badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        badge.classList.toggle("hidden", unreadCount <= 0);
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

})();
