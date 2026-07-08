// ===========================================
// RelayDesk / ESM
// settings.js
// SETTINGS SYSTEM — persistence, UI wiring, appearance/zoom,
// keyboard shortcuts, and integration hooks for other modules.
// ===========================================
//
// Everything here is local-only (per computer), stored in localStorage,
// matching the pattern already used by notificationmanager.js and
// userguide.js. Other modules (chat.js, workspace.js, notificationmanager.js)
// read live values through the small public API exposed at the bottom
// (window.ESMSettings.get(key)) rather than reaching into localStorage
// themselves.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    const STORAGE_KEY = "esm_settings";
    const ZOOM_STEPS = [60, 65, 70, 75, 80, 85, 90, 100, 110, 125, 150];

    const DEFAULT_SETTINGS = {
        // GENERAL
        launchAtStartup: false,
        minimizeToTray: true,
        confirmBeforeCloseWhileOnDuty: false,
        rememberLogin: true,

        // APPEARANCE
        theme: "dark",
        accentColor: "blue",
        uiScale: 100,
        supportCtrlMouseWheel: true,
        supportCtrlPlusMinusZero: true,
        saveZoomLevel: true,

        // NOTIFICATIONS — master switches
        enableDesktopNotifications: true,
        enableNotificationSounds: true,

        // NOTIFICATIONS — per-category Desktop / Sound / Badge (Phase 4)
        notifChatDesktop: true,
        notifChatSound: true,
        notifChatBadge: true,

        notifAnnouncementsDesktop: true,
        notifAnnouncementsSound: true,
        notifAnnouncementsBadge: true,

        notifLoadDesktop: true,
        notifLoadSound: true,
        notifLoadBadge: true,

        notifOvertimeDesktop: true,
        notifOvertimeSound: true,
        notifOvertimeBadge: true,

        notifAwayDesktop: true,
        notifAwaySound: true,
        notifAwayBadge: false,

        notifShiftDesktop: true,
        notifShiftSound: true,
        notifShiftBadge: false,

        notifAdminDesktop: true,
        notifAdminSound: true,
        notifAdminBadge: true,

        // CHAT
        enterToSendMessages: true,
        ctrlEnterToSend: false,
        autoScrollChat: true,
        showUnreadPreview: true,
        muteChatWhileOpen: true,

        // LOAD MANAGEMENT
        confirmBeforeDeletingLoads: true,
        highlightRecentlyEditedLoads: true,
        highlightNewlyBookedLoads: true,
        autoCollapseCompletedLoads: true,
        defaultLoadSorting: "Newest",
        rememberLastLoadSort: true,
        rememberLastLoadFilters: true,

        // SHIFT
        shiftReminderTiming: 0,
        extendedAwayReminder: true,
        breakReminder: true,

        // UPDATES (placeholder — not yet connected to a real update provider)
        autoCheckForUpdates: true
    };

    let currentSettings = { ...DEFAULT_SETTINGS };

    // ===========================================
    // PERSISTENCE
    // ===========================================

    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            currentSettings = raw
                ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
                : { ...DEFAULT_SETTINGS };
        } catch (err) {
            console.warn("Could not read stored settings, using defaults:", err);
            currentSettings = { ...DEFAULT_SETTINGS };
        }
        return currentSettings;
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
        } catch (err) {
            console.warn("Could not persist settings:", err);
        }
    }

    function getSetting(key) {
        return currentSettings[key];
    }

    function setSetting(key, value, { skipApply = false } = {}) {
        currentSettings[key] = value;
        saveSettings();
        if (!skipApply) applySetting(key, value);
        return value;
    }

    // ===========================================
    // ELECTRON BRIDGE HELPERS
    // ===========================================

    function isElectron() {
        return !!window.electronAPI?.isElectron;
    }

    // ===========================================
    // APPLY SIDE EFFECTS
    // ===========================================
    // Called whenever a setting changes (from the UI, a shortcut, or on
    // startup) so the change takes effect immediately without a restart.

    function applySetting(key, value) {
        switch (key) {

            case "theme":
                applyTheme(value);
                break;

            case "accentColor":
                document.documentElement.dataset.accent = value;
                break;

            case "uiScale":
                applyZoom(value);
                break;

            case "launchAtStartup":
                if (isElectron()) {
                    window.electronAPI.setLoginItemSettings(value);
                }
                break;

            case "minimizeToTray":
            case "confirmBeforeCloseWhileOnDuty":
                pushCloseBehavior();
                break;

            case "rememberLogin":
                // Settings feature: General > "Remember Login". Belt-and-
                // suspenders: auth.js already refuses to save/restore a
                // session while this is off, but if one was already saved
                // from an earlier launch, purge it right away too instead
                // of waiting for the next close/logout.
                if (!value) {
                    window.clearRememberedLogin?.();
                }
                break;

            // LOAD MANAGEMENT (Phase 5) — all of these affect how
            // renderBookedLoads() draws the list, so re-render immediately
            // rather than waiting for the next add/edit/delete.
            case "highlightRecentlyEditedLoads":
            case "highlightNewlyBookedLoads":
            case "autoCollapseCompletedLoads":
            case "defaultLoadSorting":
                window.renderBookedLoads?.();
                break;

            case "rememberLastLoadSort":
                // Turning this off should snap back to the Settings default
                // immediately, not linger on whatever was last picked in the
                // workspace toolbar.
                if (!value) window.clearRememberedLoadSort?.();
                window.renderBookedLoads?.();
                break;

            case "rememberLastLoadFilters":
                if (!value) window.clearRememberedLoadFilters?.();
                window.renderBookedLoads?.();
                break;

            default:
                break;
        }
    }

    function pushCloseBehavior() {
        if (!isElectron()) return;
        window.electronAPI.setCloseBehavior({
            minimizeToTray: !!currentSettings.minimizeToTray,
            confirmBeforeCloseWhileOnDuty: !!currentSettings.confirmBeforeCloseWhileOnDuty
        });
    }

    // ===========================================
    // APPEARANCE / THEME
    // ===========================================
    // "Auto" doesn't follow the OS — per the V1.2 spec it follows the
    // Damascus clock already shown in the top bar: daytime (6am-6pm SY
    // time) = light, nighttime = dark. Re-checked every minute so a
    // long-running session flips automatically at dawn/dusk.

    let autoThemeInterval = null;

    function isDamascusDaytime() {
        const hourStr = new Date().toLocaleString("en-US", {
            timeZone: "Asia/Damascus",
            hour: "2-digit",
            hour12: false
        });
        const hour = parseInt(hourStr, 10);
        return hour >= 6 && hour < 18;
    }

    function applyTheme(mode) {
        const resolved = mode === "auto"
            ? (isDamascusDaytime() ? "light" : "dark")
            : mode;

        document.documentElement.dataset.theme = resolved;

        if (mode === "auto") {
            if (!autoThemeInterval) {
                autoThemeInterval = setInterval(() => applyTheme("auto"), 60000);
            }
        } else if (autoThemeInterval) {
            clearInterval(autoThemeInterval);
            autoThemeInterval = null;
        }
    }

    // ===========================================
    // APPEARANCE / ZOOM
    // ===========================================

    function applyZoom(percentage) {
        const factor = (Number(percentage) || 100) / 100;

        if (isElectron()) {
            window.electronAPI.setZoomFactor(factor);
        } else {
            // Browser fallback (e.g. testing outside Electron) so zoom
            // still visibly works during development. Matches the existing
            // `body { zoom: 100%; }` convention already in style.css.
            document.body.style.zoom = factor;
        }
    }

    function stepZoom(direction) {
        // direction: +1 / -1, snaps to the nearest defined UI Scale step
        const current = Number(currentSettings.uiScale) || 100;
        const idx = ZOOM_STEPS.indexOf(current);
        const nextIdx = idx === -1
            ? ZOOM_STEPS.findIndex(v => v >= current)
            : Math.min(Math.max(idx + direction, 0), ZOOM_STEPS.length - 1);

        const next = ZOOM_STEPS[Math.min(Math.max(nextIdx, 0), ZOOM_STEPS.length - 1)];
        setUiScale(next);
    }

    function resetZoom() {
        setUiScale(100);
    }

    function setUiScale(value) {
        setSetting("uiScale", value);
        const select = document.getElementById("uiScaleSelect");
        if (select) select.value = String(value);
    }

    function bindZoomControls() {

        window.addEventListener("wheel", (e) => {
            if (!currentSettings.supportCtrlMouseWheel) return;
            if (!e.ctrlKey) return;

            e.preventDefault();
            stepZoom(e.deltaY < 0 ? 1 : -1);
        }, { passive: false });

        window.addEventListener("keydown", (e) => {
            if (!currentSettings.supportCtrlPlusMinusZero) return;
            if (!(e.ctrlKey || e.metaKey)) return;

            if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                stepZoom(1);
            } else if (e.key === "-" || e.key === "_") {
                e.preventDefault();
                stepZoom(-1);
            } else if (e.key === "0") {
                e.preventDefault();
                resetZoom();
            }
        });
    }

    // ===========================================
    // KEYBOARD SHORTCUTS
    // ===========================================
    // Ctrl+N -> New Load, Ctrl+H -> Load History, Ctrl+K -> last chat used,
    // Ctrl+, -> Settings, Esc -> close current modal, Ctrl+Shift+M -> Admin Panel
    // All of the above except Esc are reversible: pressing the same
    // shortcut again undoes what it just did (closes the modal/screen it
    // opened, or in Admin Panel's case, returns to the Dashboard).

    function topMostOpenOverlay() {
        return Array.from(document.querySelectorAll(".modalOverlay"))
            .find(m => !m.classList.contains("hidden")) || null;
    }

    function handleGlobalShortcuts(e) {

        const ctrlOrCmd = e.ctrlKey || e.metaKey;

        // Esc always works, even while typing
        if (e.key === "Escape") {
            const overlay = topMostOpenOverlay();
            if (overlay) {
                overlay.classList.add("hidden");
                overlay.style.display = "none";
                return;
            }
            if (!document.getElementById("settingsScreen")?.classList.contains("hidden")) {
                closeSettingsScreen();
                return;
            }
            return;
        }

        if (!ctrlOrCmd) return;

        // Don't hijack Ctrl+N/H/K while the person is typing in a text field,
        // to avoid stepping on normal editing shortcuts.
        const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);

        if (e.shiftKey && e.key.toLowerCase() === "m") {
    e.preventDefault();

    const adminScreen = document.getElementById("adminScreen");
    const isInAdminPanel = adminScreen && !adminScreen.classList.contains("hidden");

    if (isInAdminPanel) {
        // already in the Admin Panel — same shortcut backs out to the dashboard
        const backBtn = document.getElementById("backToDashboardBtn");
        if (backBtn && !backBtn.classList.contains("hidden")) {
            backBtn.click();
        }
    } else {
        // not in the Admin Panel — open it, same as before
        const adminBtn = document.getElementById("adminPanelAccessBtn");
        if (adminBtn && !adminBtn.classList.contains("hidden")) {
            adminBtn.click();
        }
    }

    return;
}

        if (e.shiftKey && e.key.toLowerCase() === "d") {
    e.preventDefault();

    const devScreen = document.getElementById("devPanelScreen");
    const isInDevPanel = devScreen && !devScreen.classList.contains("hidden");

    if (isInDevPanel) {
        // already in the Developer Panel — same shortcut backs out
        document.getElementById("devPanelBackBtn")?.click();
    } else {
        // not in it — open it, but only if this account is actually a
        // developer (button stays hidden otherwise, so nothing happens)
        const devBtn = document.getElementById("devPanelAccessBtn");
        if (devBtn && !devBtn.classList.contains("hidden")) {
            devBtn.click();
        }
    }

    return;
}

        // Ctrl+, is reversible: same shortcut backs out of Settings the
        // same way pressing it opened it, mirroring the Admin Panel toggle.
        if (e.key === ",") {
            e.preventDefault();

            const screen = document.getElementById("settingsScreen");
            const isOpen = screen && !screen.classList.contains("hidden");

            if (isOpen) {
                closeSettingsScreen();
            } else {
                openSettingsScreen();
            }
            return;
        }

        if (typing) return;

        // Ctrl+N is reversible: if the New Load modal is already open,
        // the same shortcut cancels it instead of doing nothing/reopening.
        if (e.key.toLowerCase() === "n") {
            e.preventDefault();

            const modal = document.getElementById("loadModal");
            const isOpen = modal && !modal.classList.contains("hidden");

            if (isOpen) {
                document.getElementById("loadModalCancelBtn")?.click();
            } else {
                document.getElementById("addLoadBtn")?.click();
            }
            return;
        }

        // Ctrl+H is reversible: same shortcut closes Load History if it's
        // already open.
        if (e.key.toLowerCase() === "h") {
            e.preventDefault();

            const modal = document.getElementById("loadHistoryModal");
            const isOpen = modal && !modal.classList.contains("hidden");

            if (isOpen) {
                document.getElementById("loadHistoryCloseBtn")?.click();
            } else {
                document.getElementById("loadHistoryBtn")?.click();
            }
            return;
        }

        // Ctrl+K opens the last chat that was actually open (not a blank
        // "New Chat" picker) and is reversible: pressing it again closes
        // the chat window. If there's no chat to reopen (fresh session,
        // nothing ever opened), it falls back to the New Chat picker.
        // chat.js owns the toggle logic/state; fall back to the raw
        // button click if chat.js hasn't loaded for some reason.
        if (e.key.toLowerCase() === "k") {
            e.preventDefault();

            if (window.toggleChatShortcut) {
                window.toggleChatShortcut();
            } else {
                document.getElementById("newChatBtn")?.click();
            }
            return;
        }
    }

    // ===========================================
    // SETTINGS SCREEN — open/close + tabs
    // (same "screen" show/hide pattern as userguide.js)
    // ===========================================

    function currentVisibleScreenId() {
        const candidates = ["dashboardScreen", "adminScreen", "loginScreen"];
        for (const id of candidates) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains("hidden")) return id;
        }
        return "dashboardScreen";
    }

    function openSettingsScreen() {
        const screen = document.getElementById("settingsScreen");
        if (!screen) return;

        screen.dataset.origin = currentVisibleScreenId();

        document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
        screen.classList.remove("hidden");
        screen.scrollTop = 0;
    }

    function closeSettingsScreen() {
        const screen = document.getElementById("settingsScreen");
        if (!screen) return;

        const origin = screen.dataset.origin || "dashboardScreen";
        screen.classList.add("hidden");

        const target = document.getElementById(origin);
        if (target) {
            target.classList.remove("hidden");
        } else {
            document.getElementById("loginScreen")?.classList.remove("hidden");
        }
    }

    function bindTabs() {
        const tabs = document.querySelectorAll(".settingsTab");
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                tabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                document.querySelectorAll(".settingsSection").forEach(section => {
                    section.classList.add("hidden");
                });

                const target = document.getElementById(`settings-${tab.dataset.section}`);
                if (target) target.classList.remove("hidden");
            });
        });
    }

    function bindOpenClose() {
        document.getElementById("openSettingsBtn")?.addEventListener("click", () => openSettingsScreen());
        document.getElementById("topBarSettingsBtn")?.addEventListener("click", () => openSettingsScreen());
        document.getElementById("settingsBackBtn")?.addEventListener("click", () => closeSettingsScreen());
    }

    // ===========================================
    // INPUT BINDING
    // ===========================================
    // Reads every element with [data-setting] inside the Settings screen,
    // initializes it from stored settings, and saves+applies on change.

    function readInputValue(el) {
        if (el.type === "checkbox") return el.checked;
        if (el.dataset.type === "number") return Number(el.value);
        return el.value;
    }

    function writeInputValue(el, value) {
        if (el.type === "checkbox") {
            el.checked = !!value;
        } else {
            el.value = String(value);
        }
    }

    function bindInputs() {
        document.querySelectorAll("[data-setting]").forEach(el => {
            const key = el.dataset.setting;
            if (!(key in DEFAULT_SETTINGS)) return;

            writeInputValue(el, currentSettings[key]);

            const eventName = (el.tagName === "SELECT" || el.type === "checkbox") ? "change" : "input";
            el.addEventListener(eventName, () => {
                setSetting(key, readInputValue(el));
            });
        });
    }

    // ===========================================
    // GENERAL — clear cache / reset defaults
    // ===========================================

    function bindGeneralActions() {

        document.getElementById("clearCacheBtn")?.addEventListener("click", async () => {

            // A queue with unsynced writes still pending shouldn't be wiped
            // silently — ask first so a flaky connection never quietly
            // loses someone's work.
            const pending = window.RelayDesk?.queue?.pendingCount?.() || 0;
            const confirmMsg = pending > 0
                ? `Clear local cache? You have ${pending} change(s) that haven't synced yet — clearing now will discard them. This won't sign you out or change your settings.`
                : "Clear local cache? This won't sign you out or change your settings.";

            if (!confirm(confirmMsg)) return;

            try {
                sessionStorage.clear();

                // Cached queue data, the one-time notification-permission
                // flag, and the saved report template are all safe to drop —
                // none of it is the remembered login or the settings
                // themselves, and none of it is Firestore data.
                try { localStorage.removeItem("relaydesk_activity_queue_v1"); } catch (e) {}
                try { localStorage.removeItem("esm_notification_permission_requested"); } catch (e) {}
                try { localStorage.removeItem("relaydesk_reportTemplate"); } catch (e) {}

                if (window.RelayDesk?.queue?.items) {
                    window.RelayDesk.queue.items.length = 0;
                }

                // Electron-side temporary storage (HTTP cache) — never
                // touches localStorage/IndexedDB, so Firestore's offline
                // cache and the remembered login are both left alone.
                if (isElectron()) await window.electronAPI.clearCache();

                window.NotificationManager?.notify("🧹 Local cache cleared", "success", { category: "system", desktop: false })
                    ?? window.showToast?.("🧹 Local cache cleared", "info");
            } catch (err) {
                console.warn("Clear cache failed:", err);
                alert("Failed to clear cache.");
            }
        });

        document.getElementById("resetSettingsBtn")?.addEventListener("click", () => {
            if (!confirm("Reset every setting to its default value?")) return;

            currentSettings = { ...DEFAULT_SETTINGS };
            saveSettings();

            document.querySelectorAll("[data-setting]").forEach(el => {
                writeInputValue(el, currentSettings[el.dataset.setting]);
            });

            Object.keys(DEFAULT_SETTINGS).forEach(key => applySetting(key, currentSettings[key]));

            window.NotificationManager?.notify("↩️ Settings reset to defaults", "info", { category: "system", desktop: false })
                ?? window.showToast?.("↩️ Settings reset to defaults", "info");
        });
    }

    // ===========================================
    // ABOUT
    // ===========================================

    async function renderAbout() {
        const versionEl = document.getElementById("settingsVersion");
        const buildDateEl = document.getElementById("settingsBuildDate");
        const electronVersionEl = document.getElementById("settingsElectronVersion");
        const osEl = document.getElementById("settingsOS");
        const appPathEl = document.getElementById("settingsAppPath");
        const userDataPathEl = document.getElementById("settingsUserDataPath");
        const currentUserEl = document.getElementById("settingsCurrentUser");
        const esmVersionEl = document.getElementById("settingsESMVersion");

        const anyElement = versionEl || buildDateEl || electronVersionEl || osEl ||
            appPathEl || userDataPathEl || currentUserEl || esmVersionEl;
        if (!anyElement) return;

        let info = { version: "1.1.0", buildDate: "—" };

        if (isElectron()) {
            try {
                info = await window.electronAPI.getAppInfo();
            } catch (err) {
                console.warn("Could not read app info:", err);
            }
        }

        // NOTE: #settingsVersion is intentionally NOT set here anymore.
        // It's owned by devpanel.js now (Developer Panel > Version),
        // synced live from Firestore so a version bump doesn't need a
        // rebuild. This function still supplies the technical/electron
        // fields below it (build date, electron version, OS, paths).
        if (esmVersionEl) esmVersionEl.textContent = info.version || "1.1.0";
        if (buildDateEl) buildDateEl.textContent = info.buildDate || "—";
        if (electronVersionEl) electronVersionEl.textContent = info.electronVersion || "—";

        if (osEl) {
            const platform = info.platform || (isElectron() ? "—" : navigator.platform);
            const osRelease = info.osRelease ? ` ${info.osRelease}` : "";
            osEl.textContent = platform ? `${platform}${osRelease}` : "—";
        }

        if (appPathEl) appPathEl.textContent = info.appPath || "—";
        if (userDataPathEl) userDataPathEl.textContent = info.userDataPath || "—";
        if (currentUserEl) currentUserEl.textContent = window.RelayDesk?.currentUser || "—";

        const currentVersionEl = document.getElementById("settingsCurrentVersion");
        if (currentVersionEl) currentVersionEl.textContent = info.version || "1.1.0";
    }

    // ===========================================
    // UPDATES (placeholder — no real update provider wired up yet)
    // ===========================================

    function initUpdatesSection() {
        const checkBtn = document.getElementById("checkForUpdatesBtn");
        const resultEl = document.getElementById("updateCheckResult");

        checkBtn?.addEventListener("click", () => {
            if (resultEl) resultEl.textContent = "Checking for updates...";

            // Placeholder only — no update provider (e.g. GitHub Releases)
            // is connected yet. This just simulates a check so the UI isn't
            // dead, per the V1.2 planning doc's "Auto Update Placeholder" spec.
            setTimeout(() => {
                if (resultEl) resultEl.textContent = "No Update Available";
            }, 600);
        });
    }

    // ===========================================
    // ON DUTY STATUS BRIDGE (for confirmBeforeCloseWhileOnDuty)
    // ===========================================
    // Reads RelayDesk.currentStatus directly (set by status.js) rather
    // than sniffing UI text. Polled instead of hooked into
    // changeUserStatus() so this file doesn't need to know about load
    // order between settings.js and status.js.

    let lastReportedOnDuty = null;

    function watchOnDutyStatus() {
        if (!isElectron()) return;

        setInterval(() => {
            const onDuty = window.RelayDesk?.currentStatus === "On Duty";
            if (onDuty === lastReportedOnDuty) return;

            lastReportedOnDuty = onDuty;
            window.electronAPI.setOnDutyStatus(onDuty);
        }, 2000);
    }

    // ===========================================
    // SHIFT REMINDERS
    // ===========================================
    // Uses RelayDesk.shiftStart (set in status.js on clock-in) as the
    // baseline, so "remind me N minutes into my shift" is measured from
    // the actual clock-in time rather than a UI-visibility heuristic.

    let shiftReminderFired = false;
    let lastShiftStartSeen = null;

    function checkShiftReminder() {
        const minutes = Number(currentSettings.shiftReminderTiming) || 0;
        if (!minutes) return;

        const shiftStart = window.RelayDesk?.shiftStart;
        if (!shiftStart) {
            lastShiftStartSeen = null;
            return;
        }

        // A new shift started since we last checked — arm the reminder again
        if (shiftStart !== lastShiftStartSeen) {
            lastShiftStartSeen = shiftStart;
            shiftReminderFired = false;
        }

        if (shiftReminderFired) return;

        if (Date.now() - shiftStart >= minutes * 60 * 1000) {
            shiftReminderFired = true;
            const notify = window.NotificationManager?.notify || window.notify;
            notify?.(`⏰ Shift reminder: you've been On Duty for ${minutes} minutes`, "info", {
                category: "alerts",
                desktop: currentSettings.enableDesktopNotifications
            });
        }
    }

    function bindShiftReminders() {
        setInterval(checkShiftReminder, 30 * 1000);
    }

    // ===========================================
    // INIT
    // ===========================================

    function init() {
        loadSettings();

        bindOpenClose();
        bindTabs();
        bindInputs();
        bindGeneralActions();
        bindZoomControls();
        renderAbout();
        initUpdatesSection();
        watchOnDutyStatus();
        bindShiftReminders();

        // Apply everything once on startup so persisted settings take
        // effect immediately without waiting for a UI interaction.
        applyTheme(currentSettings.theme);
        document.documentElement.dataset.accent = currentSettings.accentColor;
        applyZoom(currentSettings.uiScale);
        pushCloseBehavior();
        if (isElectron()) {
            window.electronAPI.setLoginItemSettings(currentSettings.launchAtStartup);
        }

        window.addEventListener("keydown", handleGlobalShortcuts);
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Public API for other modules (chat.js, workspace.js,
    // notificationmanager.js) to read live settings without touching
    // localStorage directly.
    window.ESMSettings = {
        get: getSetting,
        set: setSetting,
        openSettingsScreen,
        closeSettingsScreen
    };

})();
