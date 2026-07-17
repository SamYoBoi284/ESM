// ===========================================
// RelayDesk / ESM
// dashboardlayout.js
// Tabbed Workspace + Sidebar Navigation dashboard layout modes.
// ===========================================
//
// Classic Dashboard (default) is completely untouched by this file —
// every panel already has its own CSS/behavior and this module simply
// never runs any hiding logic unless dashboardLayout is "tabs" or
// "sidebar".
//
// Both alternate modes group the existing, unmoved dashboard panels
// into the same 3 sections by tagging them with a `data-tab-panel`
// attribute (added directly in index.html, no elements moved):
//
//   workspace -> Today's Timers dropdown + the Workspace aside
//                (chat, announcements, notes, overtime reason, loads)
//   team      -> STS Team section (inside #performanceCard)
//   stats     -> Monthly Stats dropdown + Personal Performance
//                (inside #performanceCard) + the Report Formatter column
//
// Tabbed mode shows a horizontal bar (#dashboardTabsNav) above the
// grid. Sidebar mode shows a vertical nav (#dashboardSidebarNav) to
// the left of the grid (both live in the DOM the whole time — only
// one is ever un-hidden). Both bars use the same
// `[data-dashboard-tab]` buttons and share one setActiveTab(), so
// switching between Tabbed and Sidebar never re-derives which panel
// belongs to which section — that mapping is defined once.
//
// Sidebar mode additionally has 4 extra buttons with no tab content
// of their own: Dashboard (hides all 3 sections, showing only the
// status-button area of `.card` — see showDashboardOnly()), Team Chat
// (opens the chat list + window as a draggable floating popup — see
// the TEAM CHAT POPUP section below), Settings, and Admin.
// Settings/Admin don't duplicate any navigation or permission logic —
// they proxy-click the existing #topBarSettingsBtn /
// #adminPanelAccessBtn buttons, so they inherit exactly the same
// behavior (and, for Admin, the same permission gating) as those
// buttons already have elsewhere in the UI. Team Chat is the only
// popup among these — Dashboard/Settings/Admin all just change what's
// visible in place, they don't float anything.
//
// The always-visible header/status-button area at the top of `.card`
// is NOT tagged, so it stays visible in every mode — those are core
// shift actions (On Duty/Break/Away/Off Duty/End Shift), not something
// that should ever be hidden behind a tab/sidebar click.
//
// Switching sections only ever sets inline `style.display` on the
// tagged panels — never touches the "hidden" class those same panels'
// own accordion/collapse toggles use, so this can't fight with
// existing collapse-state logic. Clearing the inline style
// (`el.style.display = ""`) restores whatever the stylesheet would
// normally show, which is why Classic mode needs no special-casing:
// with no inline style set, every panel just renders exactly as it
// always has.

(function () {

    const TABS = ["workspace", "team", "stats"];
    const ACTIVE_TAB_KEY = "esm_active_dashboard_tab";

    function panelsFor(tab) {
        return document.querySelectorAll(`#dashboardScreen [data-tab-panel="${tab}"]`);
    }

    function allNavButtons() {
        return document.querySelectorAll(
            "#dashboardTabsNav [data-dashboard-tab], #dashboardSidebarNav [data-dashboard-tab]"
        );
    }

    function showDashboardOnly() {
        // Sidebar's "Dashboard" button: hide all 3 sections at once,
        // leaving only the untagged header/status-button area of
        // .card visible. No tab shows as "active" in this state.
        TABS.forEach(t => {
            panelsFor(t).forEach(el => { el.style.display = "none"; });
        });

        allNavButtons().forEach(btn => btn.classList.remove("active"));
    }

    // ===========================================
    // TEAM CHAT POPUP (Sidebar mode only)
    // ===========================================
    // Reparents the existing #teamChatGridItem (chat list + its own
    // header + the already-floating #chatWindow nested inside it) into
    // the popup shell on open, and puts it back exactly where it came
    // from on close. Pure DOM move — chat.js looks its elements up by
    // ID, so it doesn't know or care who the parent is, and nothing in
    // chat.js needs to change.

    let chatOriginalParent = null;
    let chatOriginalNextSibling = null;

    function isTeamChatPopupOpen() {
        return !document.getElementById("teamChatPopup")?.classList.contains("hidden");
    }

    function openTeamChatPopup() {
        const popup = document.getElementById("teamChatPopup");
        const body = document.getElementById("teamChatPopupBody");
        const gridItem = document.getElementById("teamChatGridItem");
        if (!popup || !body || !gridItem) return;

        chatOriginalParent = gridItem.parentElement;
        chatOriginalNextSibling = gridItem.nextElementSibling;

        body.appendChild(gridItem);
        popup.classList.remove("hidden");

        document.getElementById("dashboardSidebarChatBtn")?.classList.add("active");
    }

    function closeTeamChatPopup() {
        const popup = document.getElementById("teamChatPopup");
        const gridItem = document.getElementById("teamChatGridItem");

        if (gridItem && chatOriginalParent) {
            chatOriginalParent.insertBefore(gridItem, chatOriginalNextSibling);
        }
        chatOriginalParent = null;
        chatOriginalNextSibling = null;

        popup?.classList.add("hidden");

        document.getElementById("dashboardSidebarChatBtn")?.classList.remove("active");
    }

    function toggleTeamChatPopup() {
        if (isTeamChatPopupOpen()) {
            closeTeamChatPopup();
        } else {
            openTeamChatPopup();
        }
    }

    // Generic drag-by-header, same shape as chat.js's own drag code for
    // #chatWindow (mousedown on header -> track offset -> reposition
    // via left/top on mousemove -> release on mouseup). Kept separate
    // and small rather than touching chat.js's private implementation.
    function makeDraggable(popupEl, headerEl) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        headerEl.addEventListener("mousedown", (e) => {
            if (e.target.closest("button")) return; // don't drag from the close button
            dragging = true;
            popupEl.classList.add("dragging");

            const rect = popupEl.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            // Switch from right/bottom-anchored to left/top-positioned
            // so it can be dragged freely, same trick chat.js uses.
            popupEl.style.left = `${rect.left}px`;
            popupEl.style.top = `${rect.top}px`;
            popupEl.style.right = "auto";
            popupEl.style.bottom = "auto";
        });

        document.addEventListener("mousemove", (e) => {
            if (!dragging) return;

            const maxLeft = window.innerWidth - popupEl.offsetWidth;
            const maxTop = window.innerHeight - popupEl.offsetHeight;

            const left = Math.min(Math.max(0, e.clientX - offsetX), Math.max(0, maxLeft));
            const top = Math.min(Math.max(0, e.clientY - offsetY), Math.max(0, maxTop));

            popupEl.style.left = `${left}px`;
            popupEl.style.top = `${top}px`;
        });

        document.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            popupEl.classList.remove("dragging");
        });
    }

    function setActiveTab(tab) {
        if (TABS.indexOf(tab) === -1) tab = "workspace";

        try { localStorage.setItem(ACTIVE_TAB_KEY, tab); } catch (e) {}

        TABS.forEach(t => {
            const show = t === tab;
            panelsFor(t).forEach(el => {
                el.style.display = show ? "" : "none";
            });
        });

        allNavButtons().forEach(btn => {
            btn.classList.toggle("active", btn.dataset.dashboardTab === tab);
        });
    }

    function getSavedTab() {
        let saved = "workspace";
        try { saved = localStorage.getItem(ACTIVE_TAB_KEY) || "workspace"; } catch (e) {}
        return saved;
    }

    function clearPanelOverrides() {
        TABS.forEach(t => {
            panelsFor(t).forEach(el => { el.style.display = ""; });
        });
    }

    // Sidebar's Admin button proxies #adminPanelAccessBtn — same
    // element auth.js's applyAdminPanelButtonVisibility() already
    // gates by permission, so we just mirror its current hidden
    // state instead of re-implementing the permission check.
    function syncSidebarAdminVisibility() {
        const source = document.getElementById("adminPanelAccessBtn");
        const sidebarAdminBtn = document.getElementById("dashboardSidebarAdminBtn");
        if (!source || !sidebarAdminBtn) return;
        sidebarAdminBtn.classList.toggle("hidden", source.classList.contains("hidden"));
    }

    function enableTabsMode() {
        document.getElementById("dashboardTabsNav")?.classList.remove("hidden");
        document.getElementById("dashboardSidebarNav")?.classList.add("hidden");
        document.getElementById("dashboardSidebarArea")?.classList.remove("sidebarModeActive");
        closeTeamChatPopup(); // sidebar-only feature — don't leave it orphaned

        setActiveTab(getSavedTab());
    }

    function enableSidebarMode() {
        document.getElementById("dashboardSidebarNav")?.classList.remove("hidden");
        document.getElementById("dashboardTabsNav")?.classList.add("hidden");
        document.getElementById("dashboardSidebarArea")?.classList.add("sidebarModeActive");

        syncSidebarAdminVisibility();
        setActiveTab(getSavedTab());
    }

    function disableAllLayoutModes() {
        document.getElementById("dashboardTabsNav")?.classList.add("hidden");
        document.getElementById("dashboardSidebarNav")?.classList.add("hidden");
        document.getElementById("dashboardSidebarArea")?.classList.remove("sidebarModeActive");
        closeTeamChatPopup(); // sidebar-only feature — don't leave it orphaned

        // Classic mode: clear any inline display this module may have
        // set, so every panel renders exactly as it did before this
        // feature existed. Nothing else about Classic mode changes.
        clearPanelOverrides();
    }

    // Public API — called by settings.js on startup and whenever the
    // Dashboard Layout setting changes.
    window.applyDashboardLayout = function (mode) {
        if (mode === "tabs") {
            enableTabsMode();
        } else if (mode === "sidebar") {
            enableSidebarMode();
        } else {
            // "classic" or anything unrecognized.
            disableAllLayoutModes();
        }
    };

    function bindNav() {
        allNavButtons().forEach(btn => {
            btn.addEventListener("click", () => setActiveTab(btn.dataset.dashboardTab));
        });

        document.getElementById("dashboardSidebarHomeBtn")
            ?.addEventListener("click", showDashboardOnly);

        document.getElementById("dashboardSidebarSettingsBtn")
            ?.addEventListener("click", () => document.getElementById("topBarSettingsBtn")?.click());

        document.getElementById("dashboardSidebarAdminBtn")
            ?.addEventListener("click", () => document.getElementById("adminPanelAccessBtn")?.click());

        document.getElementById("dashboardSidebarChatBtn")
            ?.addEventListener("click", toggleTeamChatPopup);

        document.getElementById("teamChatPopupCloseBtn")
            ?.addEventListener("click", closeTeamChatPopup);

        const popup = document.getElementById("teamChatPopup");
        const popupHeader = document.getElementById("teamChatPopupHeader");
        if (popup && popupHeader) makeDraggable(popup, popupHeader);
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", bindNav);
    } else {
        bindNav();
    }

})();
