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

        // APPEARANCE — 24-Hour Time (per top-bar clock, per-user/local)
        use24HourDamascus: false,
        use24HourUSA: false,

        // APPEARANCE — Dashboard Layout ("classic" and "tabs" are both
        // live, wired up via dashboardlayout.js; "sidebar" isn't built
        // yet and isn't selectable in the UI). Local-only, same as the
        // rest of Appearance, not Firestore-synced.
        dashboardLayout: "classic",

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

        // EMPLOYEE ACTIVITY DETECTION (automatic idle status management)
        // enableIdleDetection is now a company-wide, admin-controlled
        // setting synced from Firestore (system/idleDetectionConfig) —
        // see watchIdleDetectionConfig() below. This default is only
        // used until the first snapshot arrives.
        enableIdleDetection: true,
        idleWarningMinutes: 5,
        // idleBreakMinutes is derived automatically (idleWarningMinutes + 1)
        // and no longer independently user-configurable — kept in storage
        // only for backward compatibility with anything reading it directly.
        idleBreakMinutes: 6,
        idleOffDutyMinutes: 15,
        requireOnDutyConfirmation: true,

        // UPDATES
        autoCheckForUpdates: true,
        autoDownloadUpdates: true,
        // Native OS "ESM Update Ready" notification (shown when ESM is
        // unfocused and an update finishes downloading). Off = that
        // desktop popup is suppressed; the in-app "Restart Now / Remind
        // Me Later" toast still shows once the window is focused either
        // way.
        updateDesktopNotifications: true
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

            case "use24HourDamascus":
            case "use24HourUSA":
                // Takes effect within the same second — no need to wait for
                // the next tick of the top-bar clock's own 1s interval.
                window.refreshClockDisplay?.();
                break;

            case "dashboardLayout":
                // Tabbed mode is implemented (dashboardlayout.js); Sidebar
                // isn't yet — applyDashboardLayout() falls back to Classic
                // safely for any value it doesn't recognize.
                window.applyDashboardLayout?.(value);
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

            // LOAD MANAGEMENT (Phase 5) — highlighting/auto-collapse still
            // affect Booked Loads directly, so those re-render it right away.
            case "highlightRecentlyEditedLoads":
            case "highlightNewlyBookedLoads":
            case "autoCollapseCompletedLoads":
                window.renderBookedLoads?.();
                break;

            // Default sorting / remembered sort & filters now apply to the
            // Load History toolbar (relocated there from Booked Loads), so
            // these refresh Load History's results if the modal is open.
            case "defaultLoadSorting":
                window.refreshLoadHistoryToolbar?.();
                break;

            case "rememberLastLoadSort":
                // Turning this off should snap back to the Settings default
                // immediately, not linger on whatever was last picked in the
                // Load History toolbar.
                if (!value) window.clearRememberedLoadHistorySort?.();
                window.refreshLoadHistoryToolbar?.();
                break;

            case "rememberLastLoadFilters":
                if (!value) window.clearRememberedLoadHistoryFilters?.();
                window.refreshLoadHistoryToolbar?.();
                break;

            // EMPLOYEE ACTIVITY DETECTION — all take effect immediately,
            // no restart needed (activitydetection.js reads settings live
            // on each poll tick; only the on/off switch needs an explicit
            // start/stop call).
            case "enableIdleDetection":
                // Company-wide + admin-only: if the person flipping this is
                // an admin, push it to Firestore for every employee. Non-
                // admins can't reach this path anyway (checkbox disabled).
                if (window.hasAdminAccess && window.hasAdminAccess()) {
                    pushIdleDetectionConfigToFirestore(value);
                }
                window.ActivityDetection?.onSettingsChanged(key, value);
                break;

            case "idleWarningMinutes": {
                // "Idle before automatic Break" is derived (warning + 1
                // minute), not independently configurable — recompute and
                // refresh its read-only display any time warning changes.
                const derivedBreak = Number(value) + 1;
                if (currentSettings.idleBreakMinutes !== derivedBreak) {
                    currentSettings.idleBreakMinutes = derivedBreak;
                    saveSettings();
                }
                updateIdleBreakComputedDisplay(derivedBreak);
                window.ActivityDetection?.onSettingsChanged(key, value);
                break;
            }

            case "idleOffDutyMinutes":
            case "requireOnDutyConfirmation":
                window.ActivityDetection?.onSettingsChanged(key, value);
                break;

            case "autoDownloadUpdates":
                pushAutoDownloadPref();
                break;

            case "updateDesktopNotifications":
                pushUpdateDesktopNotificationsPref();
                break;

            default:
                break;
        }
    }

    // ===========================================
    // EMPLOYEE ACTIVITY DETECTION — COMPANY-WIDE MASTER TOGGLE
    // ===========================================
    // "Enable automatic idle detection" is no longer a local per-computer
    // preference for the master on/off switch — it's mandatory and
    // controlled only by an admin, applying to every employee. Stored in
    // Firestore at system/idleDetectionConfig, mirroring the existing
    // open-access "system" collection pattern already used elsewhere
    // (system/statsReset, monthlystats' GitHub backup config) — this app
    // has no Firebase Auth layer, so admin-only enforcement here is
    // client-side gating (hasAdminAccess), consistent with the rest of
    // the app's existing security model.

    function updateIdleBreakComputedDisplay(minutes) {
        const el = document.getElementById("idleBreakComputedDisplay");
        if (el) el.textContent = `${minutes} minutes (automatic — idle warning time + 1 minute)`;
    }

    async function pushIdleDetectionConfigToFirestore(enabled) {
        if (typeof db === "undefined") return;
        try {
            await db.collection("system").doc("idleDetectionConfig").set({
                enabled: !!enabled,
                updatedBy: window.RelayDesk?.currentUser || null,
                updatedAt: Date.now()
            }, { merge: true });

            if (typeof logAudit === "function") {
                await logAudit(
                    window.RelayDesk?.currentUser,
                    "IDLE_DETECTION_CONFIG_CHANGED",
                    enabled ? "Enabled for all employees" : "Disabled for all employees"
                );
            }
        } catch (err) {
            console.error("Failed to update company-wide idle detection config:", err);
        }
    }

    let idleDetectionConfigUnsub = null;

    function watchIdleDetectionConfig() {
        if (typeof db === "undefined" || idleDetectionConfigUnsub) return;

        idleDetectionConfigUnsub = db.collection("system").doc("idleDetectionConfig")
            .onSnapshot(doc => {
                const data = doc.data();
                if (!data) return; // no admin config yet — local default stands

                const enabled = data.enabled !== false;

                if (currentSettings.enableIdleDetection !== enabled) {
                    currentSettings.enableIdleDetection = enabled;
                    saveSettings();

                    const el = document.querySelector('[data-setting="enableIdleDetection"]');
                    if (el) el.checked = enabled;

                    window.ActivityDetection?.onSettingsChanged("enableIdleDetection", enabled);
                }
            }, err => console.warn("idleDetectionConfig listener error:", err));
    }

    // Employees: checkbox is locked, reflects whatever the admin set.
    // Admins: checkbox stays live/editable (its normal bindInputs() change
    // handler already routes through applySetting -> pushIdleDetectionConfigToFirestore
    // above), applying company-wide instead of just locally.
    function applyIdleDetectionGating() {
        const checkbox = document.getElementById("enableIdleDetectionCheckbox");
        const note = document.getElementById("idleDetectionManagedNote");
        if (!checkbox) return;

        const isAdmin = !!(window.hasAdminAccess && window.hasAdminAccess());

        checkbox.disabled = !isAdmin;
        note?.classList.toggle("hidden", isAdmin);
    }

    function pushCloseBehavior() {
        if (!isElectron()) return;
        window.electronAPI.setCloseBehavior({
            minimizeToTray: !!currentSettings.minimizeToTray,
            confirmBeforeCloseWhileOnDuty: !!currentSettings.confirmBeforeCloseWhileOnDuty
        });
    }

    // Settings feature: About > Updates > "Automatically download updates
    // in the background". Toggles electron-updater's autoDownload flag
    // live — off means an available update just sits there until the
    // user hits "Download Update" themselves.
    function pushAutoDownloadPref() {
        if (!isElectron()) return;
        window.electronAPI.setAutoDownloadUpdates?.(!!currentSettings.autoDownloadUpdates);
    }

    // Settings feature: About > Updates > "Show desktop notifications for
    // updates". Toggles the native "ESM Update Ready" OS notification
    // live — off just means an unfocused ESM stays quiet when a download
    // finishes; the in-app toast is unaffected.
    function pushUpdateDesktopNotificationsPref() {
        if (!isElectron()) return;
        window.electronAPI.setUpdateDesktopNotifications?.(!!currentSettings.updateDesktopNotifications);
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
    //
    // Phase 6: Esc also backs out of the Admin Panel / User Guide / Admin
    // Guide screens (same target each of those already returns to via its
    // own Back button), for non-A000 users only — A000 has no Dashboard to
    // land on, so its Escape handling stops at the pre-existing modal/Dev
    // Panel/Settings cases above. Skipped entirely while focus is in an
    // input or textarea (search boxes, the Report Formatter's template/
    // notes fields, etc.) so it never hijacks normal text editing or loses
    // unsaved report text.

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
            const devScreen = document.getElementById("devPanelScreen");
            if (devScreen && !devScreen.classList.contains("hidden")) {
                document.getElementById("devPanelBackBtn")?.click();
                return;
            }
            if (!document.getElementById("settingsScreen")?.classList.contains("hidden")) {
                closeSettingsScreen();
                return;
            }

            // Phase 6 — general "back to previous/last screen" navigation.
            // A000 is excluded per spec (no Dashboard to return to); every
            // other case below reuses the screen's own existing Back
            // control/close function rather than a new nav mechanism.
            if (window.RelayDesk?.currentUser === "A000") return;

            // Don't hijack Esc while typing — includes the Guide search
            // boxes and the Report Formatter's template/department-notes
            // textareas, none of which should lose focus/content because
            // of a stray Escape press.
            const typingInField = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
            if (typingInField) return;

            const adminScreenEl = document.getElementById("adminScreen");
            if (adminScreenEl && !adminScreenEl.classList.contains("hidden")) {
                document.getElementById("backToDashboardBtn")?.click();
                return;
            }

            const userGuideEl = document.getElementById("userGuideScreen");
            if (userGuideEl && !userGuideEl.classList.contains("hidden")) {
                window.closeUserGuide?.();
                return;
            }

            const adminGuideEl = document.getElementById("adminGuideScreen");
            if (adminGuideEl && !adminGuideEl.classList.contains("hidden")) {
                window.closeAdminGuide?.();
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

                if (tab.dataset.section === "shift") {
                    applyIdleDetectionGating();
                }
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

    window.I18N?.register("settings", {
        en: {
            cacheCleared: "🧹 Local cache cleared",
            settingsReset: "↩️ Settings reset to defaults"
        },
        ar: {
            cacheCleared: "🧹 تم مسح ذاكرة التخزين المؤقت المحلية",
            settingsReset: "↩️ تمت إعادة تعيين الإعدادات إلى الافتراضي"
        }
    });

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

                const cacheClearedMsg = window.I18N?.t("settings.cacheCleared") ?? "🧹 Local cache cleared";
                window.NotificationManager?.notify(cacheClearedMsg, "success", { category: "system", desktop: false })
                    ?? window.showToast?.(cacheClearedMsg, "info");
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

            const settingsResetMsg = window.I18N?.t("settings.settingsReset") ?? "↩️ Settings reset to defaults";
            window.NotificationManager?.notify(settingsResetMsg, "info", { category: "system", desktop: false })
                ?? window.showToast?.(settingsResetMsg, "info");
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
    // UPDATES (electron-updater, publishing off GitHub Releases —
    // see electron-builder.yml's "publish" block / latest.yml)
    // ===========================================
    //
    // Phase 1 update UX rework:
    //   - Settings > About now shows installed/available version, a
    //     friendly status badge, and download speed/size — not just a
    //     single line of text.
    //   - Every autoUpdater state (checking / available / downloading /
    //     downloaded / not-available / error) gets its own friendly
    //     message instead of a raw technical string.
    //   - The old native "restart to update?" dialog (previously fired
    //     from main.js) is replaced by an in-app, non-blocking toast with
    //     "Restart Now" / "Remind Me Later" buttons, reusing the same
    //     #toastContainer pattern as shiftautomation.js's grace toast.
    //     "Remind Me Later" just hides the toast and re-shows it after a
    //     delay — ESM keeps running normally the whole time.
    //   - Release-notes metadata (releaseNotes / releaseName / releaseDate)
    //     is now forwarded by main.js on "available"/"downloaded" events
    //     and stashed on RelayDesk.updateMeta below. Nothing renders it
    //     yet — that's a later phase — this just keeps the bridge ready.

    const UPDATE_REMIND_LATER_MS = 30 * 60 * 1000; // 30 minutes, same cadence as before

    // Phase 3 polish: every updater state gets one clear, friendly line.
    // Errors always reassure the user that ESM itself is unaffected and
    // still safe to keep using — the update just didn't go through.
    const FRIENDLY_UPDATE_MESSAGES = {
        idle: "You're running the latest version.",
        checking: "Checking for updates…",
        available: (v) => `ESM ${v ? `v${v} ` : ""}is available — downloading in the background.`,
        availableManual: (v) => `ESM ${v ? `v${v} ` : ""}is available.`,
        downloading: (v) => `Downloading update ${v ? `v${v}` : ""}…`,
        downloaded: (v) => `ESM ${v ? `v${v} ` : ""}is ready to install.`,
        notAvailable: "You're running the latest version.",
        error: "Update failed — ESM is still safe to use. You can try again anytime."
    };

    // Not persisted — just the most recent metadata for whatever update
    // is currently available/downloaded, kept for a future "What's New"
    // screen (release-notes bridge prep).
    window.RelayDesk.updateMeta = null;

    // ===========================================
    // PHASE 2 — release notes, native notification follow-through,
    // post-update welcome screen, and update history.
    // ===========================================
    //
    // Three small localStorage keys, same pattern (direct localStorage,
    // try/catch, JSON.stringify) as everything else in this file:
    //   - PENDING_UPDATE_KEY: the release metadata for whatever update
    //     was last *downloaded*, written the moment it finishes so it
    //     survives the restart into the new version. That's what powers
    //     the post-update welcome screen on the very next launch.
    //   - WELCOME_DISMISSED_KEY: version strings that have already had
    //     their welcome screen shown, so it only ever appears once.
    //   - UPDATE_HISTORY_KEY: every version this computer has launched,
    //     for the Update History list in Settings > About.
    // Normalizes version strings before comparing them (trims whitespace,
    // strips an optional leading "v") so a stray "v4.1.0" vs "4.1.0"
    // mismatch between the updater payload and app.getVersion() can never
    // silently break the pending/dismissed version comparisons below.
    function normalizeVersion(v) {
        return String(v || "").trim().replace(/^v/i, "");
    }

    const PENDING_UPDATE_KEY = "esm_pending_update_release";
    const WELCOME_DISMISSED_KEY = "esm_update_welcome_dismissed_versions";
    const UPDATE_HISTORY_KEY = "esm_update_history";
    const UPDATE_HISTORY_MAX_ENTRIES = 20;

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    // Safe-subset Markdown → HTML for GitHub release-note bodies.
    // Everything is escaped first, so any Markdown/HTML in the source
    // can only ever produce the specific tags this function itself
    // writes — never arbitrary injected markup. Covers the handful of
    // constructs that actually show up in ESM's own release notes:
    // #/##/### headers, -/* bullet lists, **bold**, *italic*/_italic_,
    // blank-line paragraph breaks, and bare http(s) links.
    function releaseNotesToHtml(raw) {
        const safe = escapeHtml(raw || "").trim();
        if (!safe) return "";

        const lines = safe.split("\n");
        const htmlParts = [];
        let listBuffer = [];

        const flushList = () => {
            if (!listBuffer.length) return;
            htmlParts.push(`<ul>${listBuffer.map(li => `<li>${li}</li>`).join("")}</ul>`);
            listBuffer = [];
        };

        const inline = (text) => text
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
            .replace(/_(.+?)_/g, "<em>$1</em>")
            .replace(/(https?:\/\/[^\s<]+)/g, "<a href=\"$1\" target=\"_blank\" rel=\"noopener\">$1</a>");

        lines.forEach((line) => {
            const trimmed = line.trim();

            if (!trimmed) {
                flushList();
                return;
            }

            const headerMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
            if (headerMatch) {
                flushList();
                const level = Math.min(headerMatch[1].length + 3, 6); // ## -> h5-ish weight, never bigger than the modal title
                htmlParts.push(`<h${level}>${inline(headerMatch[2])}</h${level}>`);
                return;
            }

            const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
            if (bulletMatch) {
                listBuffer.push(inline(bulletMatch[1]));
                return;
            }

            flushList();
            htmlParts.push(`<p>${inline(trimmed)}</p>`);
        });

        flushList();
        return htmlParts.join("");
    }

    function releaseNotesFallbackHtml() {
        return `<p class="settingsHint">No release notes were provided for this update.</p>`;
    }

    function formatBytes(bytes) {
        if (!bytes) return "0 MB";
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatSpeed(bytesPerSecond) {
        if (!bytesPerSecond) return "";
        return `${formatBytes(bytesPerSecond)}/s`;
    }

    // ---- Pending update metadata (survives the restart into the new version) --

    function savePendingUpdate(meta) {
        try {
            localStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify(meta));
        } catch (err) {
            console.warn("Could not persist pending update metadata:", err);
        }
    }

    function readPendingUpdate() {
        try {
            const raw = localStorage.getItem(PENDING_UPDATE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    function clearPendingUpdate() {
        try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch (err) {}
    }

    // ---- Welcome-screen dismissal (per version, so it only shows once) --------

    function getDismissedWelcomeVersions() {
        try {
            const raw = localStorage.getItem(WELCOME_DISMISSED_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (err) {
            return [];
        }
    }

    function markWelcomeDismissed(version) {
        if (!version) return;
        const normalized = normalizeVersion(version);
        const list = getDismissedWelcomeVersions();
        if (!list.map(normalizeVersion).includes(normalized)) list.push(version);
        // Keep this from growing forever across years of updates.
        while (list.length > UPDATE_HISTORY_MAX_ENTRIES) list.shift();
        try {
            localStorage.setItem(WELCOME_DISMISSED_KEY, JSON.stringify(list));
        } catch (err) {
            console.warn("Could not persist welcome-dismissed versions:", err);
        }
    }

    // ---- Update history (Settings > About) -------------------------------------

    function getUpdateHistory() {
        try {
            const raw = localStorage.getItem(UPDATE_HISTORY_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (err) {
            return [];
        }
    }

    function saveUpdateHistory(history) {
        try {
            localStorage.setItem(UPDATE_HISTORY_KEY, JSON.stringify(history));
        } catch (err) {
            console.warn("Could not persist update history:", err);
        }
    }

    // Records the version this launch is running as a new history entry
    // the first time we ever see it on this computer. Runs on every
    // startup but only ever writes once per version — cheap no-op on
    // every other launch of the same version.
    function recordVersionHistory(currentVersion) {
        if (!currentVersion) return;

        const history = getUpdateHistory();
        if (history.some(entry => entry.version === currentVersion)) return;

        const pending = readPendingUpdate();
        const releaseDate = (pending && pending.version === currentVersion) ? (pending.releaseDate || null) : null;

        history.push({
            version: currentVersion,
            releaseDate,
            firstSeenAt: Date.now()
        });

        while (history.length > UPDATE_HISTORY_MAX_ENTRIES) history.shift();
        saveUpdateHistory(history);
    }

    function formatHistoryDate(entry) {
        if (entry.releaseDate) {
            const d = new Date(entry.releaseDate);
            if (!isNaN(d.getTime())) return d.toLocaleDateString();
        }
        if (entry.firstSeenAt) {
            return new Date(entry.firstSeenAt).toLocaleDateString();
        }
        return "—";
    }

    function renderUpdateHistory(currentVersion) {
        const list = document.getElementById("updateHistoryList");
        if (!list) return;

        const history = [...getUpdateHistory()].reverse(); // most recent first

        if (!history.length) {
            list.innerHTML = `<div class="workspaceEmpty">No update history recorded yet.</div>`;
            return;
        }

        list.innerHTML = history.map(entry => `
            <div class="devPanelListItem">
                <div class="devPanelListItemHeader">
                    <strong>v${escapeHtml(entry.version || "")}</strong>
                    ${entry.version === currentVersion ? `<span class="updateHistoryCurrentBadge">Current</span>` : ""}
                </div>
                <div class="devPanelListItemBody">${escapeHtml(formatHistoryDate(entry))}</div>
            </div>
        `).join("");
    }

    // ---- In-app "Restart Now / Remind Me Later" toast ----------------

    let updateRemindTimer = null;

    function removeUpdateReadyToast() {
        document.getElementById("updateReadyToast")?.remove();
    }

    function showUpdateReadyToast(version) {
        // Don't stack a second one if it's already showing (e.g. the
        // event fires again for any reason).
        removeUpdateReadyToast();

        if (updateRemindTimer) {
            clearTimeout(updateRemindTimer);
            updateRemindTimer = null;
        }

        const container = document.getElementById("toastContainer");
        if (!container) return;

        const toast = document.createElement("div");
        toast.id = "updateReadyToast";
        toast.className = "toast toast-info updateReadyToast";

        const title = document.createElement("div");
        title.className = "updateReadyToastTitle";
        title.textContent = version
            ? `ESM v${version} is ready to install`
            : "An update is ready to install";
        toast.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.textContent = "Restart ESM to finish updating. Your work stays safe either way.";
        toast.appendChild(subtitle);

        const buttonRow = document.createElement("div");
        buttonRow.className = "updateReadyToastButtons";

        const restartBtn = document.createElement("button");
        restartBtn.type = "button";
        restartBtn.className = "updateReadyBtnPrimary";
        restartBtn.textContent = "Restart Now";
        restartBtn.onclick = () => {
            window.electronAPI.quitAndInstall();
        };

        const laterBtn = document.createElement("button");
        laterBtn.type = "button";
        laterBtn.className = "updateReadyBtnSecondary";
        laterBtn.textContent = "Remind Me Later";
        laterBtn.onclick = () => {
            removeUpdateReadyToast();
            // ESM keeps running normally — just ask again after a while
            // rather than losing the prompt entirely.
            updateRemindTimer = setTimeout(() => showUpdateReadyToast(version), UPDATE_REMIND_LATER_MS);
        };

        buttonRow.appendChild(restartBtn);
        buttonRow.appendChild(laterBtn);
        toast.appendChild(buttonRow);

        container.appendChild(toast);

        void toast.offsetHeight;
        toast.classList.add("toastShow");
    }

    // ---- "ESM vX.X.X Available" toast + What's New modal (Phase 2) ----

    // Guards against re-showing the same announcement if "available"
    // fires again for a version we've already told the user about
    // (e.g. they click "Check Now" again while it's still available).
    let lastAnnouncedAvailableVersion = null;

    // Set once getAppInfo() resolves in initUpdatesSection() below;
    // shared by the welcome-modal dismiss handler and history renderer
    // so neither has to scrape it back out of the DOM.
    let installedVersion = null;

    function excerptText(html, maxLen = 160) {
        const div = document.createElement("div");
        div.innerHTML = html;
        const text = (div.textContent || "").trim().replace(/\s+/g, " ");
        if (text.length <= maxLen) return text;
        return `${text.slice(0, maxLen).trim()}…`;
    }

    function removeUpdateAvailableToast() {
        document.getElementById("updateAvailableToast")?.remove();
    }

    function showUpdateAvailableToast(meta) {
        if (!meta || !meta.version) return;
        if (lastAnnouncedAvailableVersion === meta.version) return;
        lastAnnouncedAvailableVersion = meta.version;

        removeUpdateAvailableToast();

        const container = document.getElementById("toastContainer");
        if (!container) return;

        const notesHtml = meta.releaseNotes ? releaseNotesToHtml(meta.releaseNotes) : "";

        const toast = document.createElement("div");
        toast.id = "updateAvailableToast";
        toast.className = "toast toast-info updateAvailableToast";

        const title = document.createElement("div");
        title.className = "updateAvailableToastTitle";
        title.textContent = `ESM v${meta.version} Available`;
        toast.appendChild(title);

        const excerpt = document.createElement("div");
        excerpt.className = "updateAvailableToastExcerpt";
        excerpt.textContent = notesHtml
            ? `What's new: ${excerptText(notesHtml)}`
            : "What's new: no release notes were provided for this update.";
        toast.appendChild(excerpt);

        const buttonRow = document.createElement("div");
        buttonRow.className = "updateAvailableToastButtons";

        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "updateReadyBtnPrimary";
        viewBtn.textContent = "What's New";
        viewBtn.onclick = () => {
            removeUpdateAvailableToast();
            window.openUpdateAvailableNotesModal();
        };

        const dismissBtn = document.createElement("button");
        dismissBtn.type = "button";
        dismissBtn.className = "updateReadyBtnSecondary";
        dismissBtn.textContent = "Dismiss";
        dismissBtn.onclick = removeUpdateAvailableToast;

        buttonRow.appendChild(viewBtn);
        buttonRow.appendChild(dismissBtn);
        toast.appendChild(buttonRow);

        container.appendChild(toast);

        void toast.offsetHeight;
        toast.classList.add("toastShow");
    }

    function renderUpdateAvailableNotesModal(meta) {
        const titleEl = document.getElementById("updateAvailableNotesTitle");
        const bodyEl = document.getElementById("updateAvailableNotesBody");
        if (!bodyEl) return;

        if (titleEl) {
            titleEl.textContent = meta?.version
                ? `📋 What's New in v${meta.version}`
                : "📋 What's New";
        }

        bodyEl.innerHTML = meta?.releaseNotes
            ? releaseNotesToHtml(meta.releaseNotes)
            : releaseNotesFallbackHtml();
    }

    window.openUpdateAvailableNotesModal = function () {
        const overlay = document.getElementById("updateAvailableNotesModal");
        if (!overlay) return;
        renderUpdateAvailableNotesModal(window.RelayDesk.updateMeta);
        overlay.classList.remove("hidden");
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden", "false");
    };

    window.closeUpdateAvailableNotesModal = function () {
        const overlay = document.getElementById("updateAvailableNotesModal");
        if (!overlay) return;
        overlay.classList.add("hidden");
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
    };

    // Toggles the "What's New" button in the Updates status card
    // whenever we have release notes worth showing (either for an
    // available or already-downloaded update).
    function setWhatsNewButtonVisible(visible) {
        document.getElementById("viewUpdateWhatsNewBtn")?.classList.toggle("hidden", !visible);
    }

    // ---- Post-update welcome screen (Phase 2) --------------------------

    function renderUpdateWelcomeModal(pending) {
        const bodyEl = document.getElementById("updateWelcomeBody");
        if (!bodyEl) return;

        const heading = pending?.version
            ? `<h4>Welcome to ESM v${escapeHtml(pending.version)}</h4>`
            : "<h4>Welcome to the latest version of ESM</h4>";

        const notesHtml = pending?.releaseNotes
            ? releaseNotesToHtml(pending.releaseNotes)
            : `<p class="settingsHint">No release notes were recorded for this update.</p>`;

        bodyEl.innerHTML = heading + notesHtml;
    }

    window.closeUpdateWelcomeModal = function () {
        const overlay = document.getElementById("updateWelcomeModal");
        if (!overlay) return;
        overlay.classList.add("hidden");
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");

        if (installedVersion) markWelcomeDismissed(installedVersion);
        clearPendingUpdate();
    };

    function showUpdateWelcomeModal(pending) {
        const overlay = document.getElementById("updateWelcomeModal");
        if (!overlay) return;
        renderUpdateWelcomeModal(pending);
        overlay.classList.remove("hidden");
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden", "false");
    }

    // Only shows the welcome screen when we have concrete evidence this
    // exact version was just installed by the auto-updater (a matching
    // PENDING_UPDATE_KEY entry) — that naturally excludes a brand-new
    // install (nothing pending yet) and keeps this from firing off of a
    // manual/dev version bump that didn't go through the updater.
    function checkPostUpdateWelcome(currentVersion) {
        if (!currentVersion) return;

        const normalizedCurrent = normalizeVersion(currentVersion);

        const dismissed = getDismissedWelcomeVersions().map(normalizeVersion);
        if (dismissed.includes(normalizedCurrent)) return;

        const pending = readPendingUpdate();
        if (!pending || normalizeVersion(pending.version) !== normalizedCurrent) return;

        showUpdateWelcomeModal(pending);
    }

    // ---- Settings > About > Updates status card -----------------------

    function initUpdatesSection() {
        const checkBtn = document.getElementById("checkForUpdatesBtn");
        const downloadBtn = document.getElementById("downloadUpdateBtn");
        const installBtn = document.getElementById("installUpdateBtn");
        const retryBtn = document.getElementById("retryUpdateBtn");
        const progressRow = document.getElementById("updateProgressRow");
        const progressBar = document.getElementById("updateProgressBar");
        const progressPercentEl = document.getElementById("updateProgressPercent");
        const progressSizeEl = document.getElementById("updateProgressSize");
        const progressSpeedEl = document.getElementById("updateProgressSpeed");
        const resultEl = document.getElementById("updateCheckResult");
        const installedVersionEl = document.getElementById("updateInstalledVersion");
        const availableVersionRow = document.getElementById("updateAvailableVersionRow");
        const availableVersionEl = document.getElementById("updateAvailableVersion");
        const stateBadgeEl = document.getElementById("updateStateBadge");
        // Legacy element, kept in the DOM (hidden) for backward
        // compatibility with anything still reading it directly.
        const legacyCurrentVersionEl = document.getElementById("settingsCurrentVersion");

        if (!isElectron()) {
            // Web build — there's no installer to update, so the section
            // just explains that instead of pretending to check.
            if (checkBtn) checkBtn.disabled = true;
            if (resultEl) resultEl.textContent = "Updates are only available in the desktop app.";
            if (stateBadgeEl) {
                stateBadgeEl.textContent = "Desktop app only";
                stateBadgeEl.className = "updateStateBadge updateState-idle";
            }
            return;
        }

        // Show the installed version immediately from getAppInfo(), so
        // it's correct even before any update-status event has fired.
        window.electronAPI.getAppInfo?.().then((info) => {
            if (installedVersionEl) installedVersionEl.textContent = info?.version ? `v${info.version}` : "—";
            if (legacyCurrentVersionEl) legacyCurrentVersionEl.textContent = info?.version || "—";

            // Phase 2: Update History + post-update welcome screen. Both
            // are keyed off the actual installed version, not whatever
            // the updater last reported, so they're correct even if
            // Settings is opened without any update-status event firing.
            installedVersion = info?.version || null;
            if (installedVersion) {
                recordVersionHistory(installedVersion);
                // Was previously swallowed by a bare `.catch(() => {})` on this
                // whole chain, so any error here (or upstream) silently killed
                // the What's New modal with no trace. Now isolated in its own
                // try/catch so a failure here can never block the version
                // history render below, and is at least visible in devtools.
                try {
                    checkPostUpdateWelcome(installedVersion);
                } catch (err) {
                    console.warn("Post-update welcome check failed:", err);
                }
            }
            renderUpdateHistory(installedVersion);
        }).catch((err) => {
            console.warn("Could not read app info for updates section:", err);
        });

        const setButtons = ({ checking = false, showDownload = false, showInstall = false, showRetry = false } = {}) => {
            if (checkBtn) checkBtn.disabled = checking;
            downloadBtn?.classList.toggle("hidden", !showDownload);
            if (downloadBtn && showDownload) downloadBtn.disabled = false;
            installBtn?.classList.toggle("hidden", !showInstall);
            retryBtn?.classList.toggle("hidden", !showRetry);
        };

        const setBadge = (state, text) => {
            if (!stateBadgeEl) return;
            stateBadgeEl.textContent = text;
            stateBadgeEl.className = `updateStateBadge updateState-${state}`;
        };

        const setAvailableVersion = (version) => {
            if (!availableVersionRow || !availableVersionEl) return;
            if (version) {
                availableVersionEl.textContent = `v${version}`;
                availableVersionRow.classList.remove("hidden");
            } else {
                availableVersionRow.classList.add("hidden");
            }
        };

        window.electronAPI.onUpdateStatus?.((payload = {}) => {
            // Keep the installed-version row accurate even if the panel
            // was rendered before the first status event arrived.
            if (payload.currentVersion && installedVersionEl) {
                installedVersionEl.textContent = `v${payload.currentVersion}`;
            }

            switch (payload.status) {
                case "checking":
                    if (resultEl) resultEl.textContent = FRIENDLY_UPDATE_MESSAGES.checking;
                    setBadge("checking", "Checking…");
                    setButtons({ checking: true });
                    progressRow?.classList.add("hidden");
                    break;

                case "available":
                    window.RelayDesk.updateMeta = {
                        version: payload.version,
                        releaseNotes: payload.releaseNotes || null,
                        releaseName: payload.releaseName || null,
                        releaseDate: payload.releaseDate || null
                    };
                    setAvailableVersion(payload.version);
                    // With auto-download on, "available" is immediately
                    // followed by "downloading" — message reflects that
                    // instead of implying the user needs to do anything.
                    if (resultEl) {
                        resultEl.textContent = currentSettings.autoDownloadUpdates
                            ? FRIENDLY_UPDATE_MESSAGES.available(payload.version)
                            : FRIENDLY_UPDATE_MESSAGES.availableManual(payload.version);
                    }
                    setBadge("available", "Update available");
                    setButtons({ showDownload: !currentSettings.autoDownloadUpdates });

                    // Phase 2: "ESM vX.X.X Available" toast + What's New button.
                    showUpdateAvailableToast(window.RelayDesk.updateMeta);
                    setWhatsNewButtonVisible(true);
                    break;

                case "not-available":
                    if (resultEl) resultEl.textContent = FRIENDLY_UPDATE_MESSAGES.notAvailable;
                    setAvailableVersion(null);
                    setBadge("idle", "Up to date");
                    setButtons();
                    progressRow?.classList.add("hidden");
                    setWhatsNewButtonVisible(false);
                    break;

                case "downloading": {
                    const pct = Math.round(payload.percent || 0);
                    if (resultEl) resultEl.textContent = FRIENDLY_UPDATE_MESSAGES.downloading(payload.version);
                    if (progressBar) progressBar.value = payload.percent || 0;
                    if (progressPercentEl) progressPercentEl.textContent = `${pct}%`;
                    if (progressSizeEl) progressSizeEl.textContent = `${formatBytes(payload.transferred)} / ${formatBytes(payload.total)}`;
                    if (progressSpeedEl) progressSpeedEl.textContent = formatSpeed(payload.bytesPerSecond);
                    progressRow?.classList.remove("hidden");
                    setBadge("downloading", "Downloading…");
                    setButtons();
                    break;
                }

                case "downloaded":
                    window.RelayDesk.updateMeta = {
                        version: payload.version,
                        releaseNotes: payload.releaseNotes || null,
                        releaseName: payload.releaseName || null,
                        releaseDate: payload.releaseDate || null
                    };
                    if (resultEl) resultEl.textContent = FRIENDLY_UPDATE_MESSAGES.downloaded(payload.version);
                    setAvailableVersion(payload.version);
                    progressRow?.classList.add("hidden");
                    setBadge("downloaded", "Ready to install");
                    setButtons({ showInstall: true });
                    setWhatsNewButtonVisible(true);

                    // Phase 2: persist this update's metadata so the
                    // post-update welcome screen has something to show
                    // on the very next launch (after the restart).
                    savePendingUpdate(window.RelayDesk.updateMeta);

                    // In-app restart prompt (replaces the old native dialog).
                    showUpdateReadyToast(payload.version);

                    // The native "ESM Update Ready" OS notification is
                    // now owned entirely by main.js (Phase 2) — it fires
                    // there whenever the window isn't focused, so there's
                    // exactly one place deciding whether to interrupt
                    // the user instead of two independent checks.
                    break;

                case "error":
                    // Cleanup safety: never leave ESM looking "stuck updating" —
                    // the badge/message always resolve to a clear failed state
                    // with a way forward, and the app itself keeps running
                    // normally the whole time.
                    if (resultEl) resultEl.textContent = FRIENDLY_UPDATE_MESSAGES.error;
                    setAvailableVersion(null);
                    setBadge("error", "Update failed");
                    setButtons({ showRetry: true });
                    progressRow?.classList.add("hidden");
                    setWhatsNewButtonVisible(false);
                    break;

                default:
                    break;
            }
        });

        checkBtn?.addEventListener("click", () => {
            window.electronAPI.checkForUpdates();
        });

        downloadBtn?.addEventListener("click", () => {
            downloadBtn.disabled = true;
            window.electronAPI.downloadUpdate();
        });

        installBtn?.addEventListener("click", () => {
            window.electronAPI.quitAndInstall();
        });

        // Phase 3: "Retry" only ever appears after a failed check/download/
        // install — main.js decides which of those to redo based on what
        // actually failed, so this button always does the right thing.
        retryBtn?.addEventListener("click", () => {
            if (retryBtn) retryBtn.disabled = true;
            window.electronAPI.retryUpdate?.().finally(() => {
                if (retryBtn) retryBtn.disabled = false;
            });
        });

        document.getElementById("viewUpdateWhatsNewBtn")?.addEventListener("click", () => {
            window.openUpdateAvailableNotesModal();
        });

        // Phase 2: clicking the native "ESM Update Ready" OS notification
        // brings ESM to the foreground (handled in main.js) and tells us
        // to bring the in-app Restart Now / Remind Me Later toast back
        // to the front too, in case it was dismissed/"Remind Me Later"d.
        window.electronAPI.onUpdateNotificationClicked?.((payload = {}) => {
            showUpdateReadyToast(payload.version || window.RelayDesk.updateMeta?.version);
        });

        // General > "Automatically check for updates" — polls every 15s
        // while the setting is on, instead of just once at startup. Main.js
        // already guards against overlapping checks (isCheckInProgress), so
        // a tick landing mid-check/download is a safe no-op there. Manual
        // "Check Now" clicks still work regardless of this setting/timer.
        let autoUpdateCheckTimer = null;

        function startAutoUpdateCheckPolling() {
            if (autoUpdateCheckTimer) return; // already running
            window.electronAPI.checkForUpdates();
            autoUpdateCheckTimer = setInterval(() => {
                window.electronAPI.checkForUpdates();
            }, 15000);
        }

        function stopAutoUpdateCheckPolling() {
            if (autoUpdateCheckTimer) {
                clearInterval(autoUpdateCheckTimer);
                autoUpdateCheckTimer = null;
            }
        }

        if (currentSettings.autoCheckForUpdates) {
            startAutoUpdateCheckPolling();
        }
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
        window.applyDashboardLayout?.(currentSettings.dashboardLayout);
        pushCloseBehavior();
        pushAutoDownloadPref();
        pushUpdateDesktopNotificationsPref();
        if (isElectron()) {
            window.electronAPI.setLoginItemSettings(currentSettings.launchAtStartup);
        }

        updateIdleBreakComputedDisplay(currentSettings.idleWarningMinutes + 1);
        applyIdleDetectionGating();

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
        closeSettingsScreen,
        // Called once after login (app.js) once RelayDesk.currentUser and
        // `db` are ready, to start the company-wide idle detection sync
        // and re-check admin gating now that the role is known.
        initIdleDetectionSync() {
            watchIdleDetectionConfig();
            applyIdleDetectionGating();
        }
    };

})();
