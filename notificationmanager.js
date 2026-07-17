// ===========================================
// RelayDesk V5
// notificationmanager.js
// CENTRALIZED NOTIFICATION SYSTEM
// ===========================================
// This manager is the single entry point for all notification traffic.
// It preserves the existing toast UI while adding a future-ready bridge
// for browser desktop notifications and sound playback without changing
// the rest of the application architecture.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    class NotificationManager {

        constructor() {
            this.permissionState = "default";
            this.permissionRequested = false;
            this.toastContainerId = "toastContainer";
            this.defaultCategory = "system";
            this.defaultPriority = "info";
            this.iconPath = "favicon2.png";
            this.permissionStorageKey = "esm_notification_permission_requested";
            this.badgeStorageKey = "esm_badge_counts";
            this.environment = this.detectEnvironment();

            // Phase 4: per-category Desktop / Sound / Badge setting keys.
            // Categories without a dedicated Settings row (offday, admin's
            // sibling "system") fall back to the master switches only.
            this.categorySettingMap = {
                chat: { desktop: "notifChatDesktop", sound: "notifChatSound", badge: "notifChatBadge" },
                load: { desktop: "notifLoadDesktop", sound: "notifLoadSound", badge: "notifLoadBadge" },
                announcements: { desktop: "notifAnnouncementsDesktop", sound: "notifAnnouncementsSound", badge: "notifAnnouncementsBadge" },
                overtime: { desktop: "notifOvertimeDesktop", sound: "notifOvertimeSound", badge: "notifOvertimeBadge" },
                away: { desktop: "notifAwayDesktop", sound: "notifAwaySound", badge: "notifAwayBadge" },
                alerts: { desktop: "notifShiftDesktop", sound: "notifShiftSound", badge: "notifShiftBadge" },
                admin: { desktop: "notifAdminDesktop", sound: "notifAdminSound", badge: "notifAdminBadge" }
            };

            this.badgeCounts = this.loadBadgeCounts();
        }

        // Ensure the toast container exists so the legacy toast UI remains
        // available even if no other module has created it yet.
        init() {
            this.ensureToastContainer();
            this.syncPermissionState();
            this.restorePermissionRequestState();
            this.bindBadgeClearOnClick();
            // Badge DOM elements may not exist yet (workspace not rendered
            // until after login), so render once now and once more shortly
            // after — cheap, and avoids needing a MutationObserver.
            this.renderAllBadges();
            setTimeout(() => this.renderAllBadges(), 500);
            return this;
        }

        // Detect whether the current runtime is a browser tab or Electron.
        detectEnvironment() {
            if (typeof window !== "undefined" && window?.electronAPI?.isElectron) {
                return "electron";
            }
            return "browser";
        }

        // Read the browser Notification permission state and keep the
        // manager's internal state aligned with the host environment.
        syncPermissionState() {
            if (this.environment === "electron") {
                this.permissionState = "granted";
                return this.permissionState;
            }

            if (typeof window.Notification === "undefined") {
                this.permissionState = "unsupported";
                return this.permissionState;
            }

            this.permissionState = window.Notification.permission;
            return this.permissionState;
        }

        // Restore the one-time permission request flag from storage so the
        // browser prompt is not shown repeatedly after a login or refresh.
        restorePermissionRequestState() {
            try {
                this.permissionRequested = localStorage.getItem(this.permissionStorageKey) === "1";
            } catch (err) {
                this.permissionRequested = false;
            }

            return this.permissionRequested;
        }

        // Persist the fact that a permission request has already been made so
        // later logins or page reloads do not prompt again.
        markPermissionRequested() {
            this.permissionRequested = true;

            try {
                localStorage.setItem(this.permissionStorageKey, "1");
            } catch (err) {
                console.warn("Could not persist notification permission state:", err);
            }

            return this.permissionRequested;
        }

        // Ask for browser notification permission once, and never prompt again
        // after the first attempt. If the API is unavailable or denied, the
        // manager still preserves the notification by falling back to toast.
        async requestPermission() {
            this.syncPermissionState();

            if (this.permissionRequested || this.permissionState === "granted" || this.permissionState === "denied") {
                return this.permissionState;
            }

            this.markPermissionRequested();

            if (typeof window.Notification === "undefined") {
                this.permissionState = "unsupported";
                return this.permissionState;
            }

            try {
                this.permissionState = await window.Notification.requestPermission();
            } catch (err) {
                console.warn("Notification permission request failed:", err);
                this.permissionState = "denied";
            }

            return this.permissionState;
        }

        // Send a notification through the centralized pipeline. The manager
        // will show a toast, attempt a desktop browser notification when
        // permission allows it, and play a matching sound when available.
        async notify(message, priority = "info", options = {}) {
            const finalMessage = message || "";
            if (!finalMessage) return null;

            const finalPriority = this.normalizePriority(priority);
            const finalCategory = this.normalizeCategory(options.category || this.defaultCategory);
            const duration = options.duration || 6000;
            const shouldToast = options.toast !== false;
            const shouldDesktop = options.desktop !== false;
            const shouldBadge = options.badge !== false;

            let desktopShown = false;

            if (shouldToast) {
                this.showToast(finalMessage, this.mapPriorityToToastType(finalPriority), duration);
            }

            if (shouldDesktop) {
                desktopShown = this.showDesktopNotification({
                    title: options.title || "ESM",
                    message: finalMessage,
                    icon: options.icon || this.iconPath,
                    category: finalCategory,
                    priority: finalPriority,
                    timestamp: options.timestamp || Date.now(),
                    tag: options.tag || `${finalCategory}-${Date.now()}`
                });
            }

            this.playSound(finalCategory, finalPriority);

            if (shouldBadge) {
                this.bumpBadge(finalCategory);
            }

            // Phase 1: Notification Center — persistent history. Additive
            // only; does not alter or gate anything above. Guarded so this
            // still works fine if notificationcenter.js hasn't loaded yet.
            if (options.center !== false) {
                window.NotificationCenter?.log({
                    message: finalMessage,
                    category: finalCategory,
                    priority: finalPriority,
                    timestamp: options.timestamp || Date.now()
                });
            }

            return {
                message: finalMessage,
                category: finalCategory,
                priority: finalPriority,
                toastShown: shouldToast,
                desktopShown
            };
        }

        // Create the legacy toast container if it does not already exist.
        ensureToastContainer() {
            let container = document.getElementById(this.toastContainerId);

            if (!container) {
                container = document.createElement("div");
                container.id = this.toastContainerId;
                document.body.appendChild(container);
            }

            return container;
        }

        // Render a toast using the existing visual styles so the current UI
        // remains unchanged while the new manager owns the dispatch logic.
        showToast(message, type = "info", duration = 6000) {
            const container = this.ensureToastContainer();
            const toast = document.createElement("div");
            toast.className = `toast toast-${type}`;
            toast.textContent = message;

            container.appendChild(toast);

            void toast.offsetHeight;
            toast.classList.add("toastShow");

            setTimeout(() => {
                toast.classList.remove("toastShow");
                setTimeout(() => toast.remove(), 350);
            }, duration);

            return toast;
        }

        // Attempt a browser notification when the API is available and the
        // user has granted permission. If permission is denied or blocked,
        // the method simply returns false and the toast remains the fallback.
        showDesktopNotification(options = {}) {
            // Settings feature: Notifications > "Windows desktop notifications" (master)
            if (window.ESMSettings && window.ESMSettings.get("enableDesktopNotifications") === false) {
                return false;
            }

            // Settings feature: Notifications > per-category Desktop toggle
            const categoryKeys = this.categorySettingMap[this.normalizeCategory(options.category)];
            if (window.ESMSettings && categoryKeys && window.ESMSettings.get(categoryKeys.desktop) === false) {
                return false;
            }

            this.syncPermissionState();

            if (this.environment === "electron") {
                try {
                    if (window.electronAPI?.notify) {
                        window.electronAPI.notify({
                            title: options.title || "ESM",
                            message: options.message || "",
                            icon: options.icon || this.iconPath
                        });
                        return true;
                    }
                } catch (err) {
                    console.warn("Electron notification failed:", err);
                    return false;
                }
            }

            if (typeof window.Notification === "undefined") {
                return false;
            }

            if (this.permissionState !== "granted") {
                return false;
            }

            try {
                const notification = new window.Notification(options.title || "ESM", {
                    body: options.message || "",
                    icon: options.icon || this.iconPath,
                    tag: options.tag || "esm-notification",
                    timestamp: options.timestamp || Date.now()
                });

                notification.onclick = () => {
                    if (typeof window.focus === "function") {
                        window.focus();
                    }
                    if (window.electronAPI?.focusApp) {
                        window.electronAPI.focusApp();
                    }
                    if (notification?.close) {
                        notification.close();
                    }
                };

                return true;
            } catch (err) {
                console.warn("Desktop notification failed:", err);
                return false;
            }
        }

        // Play a sound based on the notification category. The sound files are
        // expected later under assets/sounds/ and this method intentionally
        // does not create any placeholder audio assets.
        playSound(category = this.defaultCategory, priority = this.defaultPriority) {
            if (typeof window.Audio === "undefined") {
                return false;
            }

            // Settings feature: Notifications > "Notification sounds" (master)
            // plus the per-category sound toggles.
            if (window.ESMSettings) {
                if (window.ESMSettings.get("enableNotificationSounds") === false) {
                    return false;
                }

                const categoryKeys = this.categorySettingMap[this.normalizeCategory(category)];
                if (categoryKeys && window.ESMSettings.get(categoryKeys.sound) === false) {
                    return false;
                }
            }

            try {
                const soundFile = this.getSoundFileForCategory(category);
                const audio = new window.Audio(soundFile);
                audio.volume = 0.8;
                audio.play().catch(() => {});
                return true;
            } catch (err) {
                return false;
            }
        }

        // Normalize category values so the manager can work with the
        // documented categories and fall back safely for unknown inputs.
        normalizeCategory(category) {
            const value = (category || this.defaultCategory).toString().toLowerCase();

            const supported = ["load", "overtime", "offday", "alerts", "away", "announcements", "admin", "chat", "system"];
            return supported.includes(value) ? value : this.defaultCategory;
        }

        // Normalize priority values so legacy calls like "warn" and "success"
        // are mapped to the supported priority set without breaking callers.
        normalizePriority(priority) {
            const value = (priority || this.defaultPriority).toString().toLowerCase();

            const mapping = {
                warn: "warning",
                warning: "warning",
                success: "success",
                info: "info",
                critical: "critical",
                error: "critical"
            };

            return mapping[value] || value || this.defaultPriority;
        }

        // Resolve the future sound asset path for the given category.
        // The project will later place files such as load.mp3 and alert.mp3
        // in assets/sounds/, and this helper keeps the runtime logic ready.
        getSoundFileForCategory(category) {
            const normalized = this.normalizeCategory(category);
            // NOTE: these previously pointed at assets/sounds/*, a folder that
            // doesn't exist in this project — every category sound was
            // silently failing. Fixed to point at the real files in assets/.
            const fileMap = {
                load: "assets/load.mp3",
                overtime: "assets/overtime.mp3",
                offday: "assets/offday.mp3",
                alerts: "assets/shift_warning_ping.mp3",
                away: "assets/shift_warning_ping.mp3",
                announcements: "assets/announcement_ping.mp3",
                admin: "assets/alert.mp3",
                chat: "assets/chat_ping.mp3",
                system: "assets/system.mp3"
            };

            return fileMap[normalized] || "assets/system.mp3";
        }

        // ===========================================
        // PHASE 4: BADGE SYSTEM
        // ===========================================
        // Per-category unread counters, persisted so a badge survives a
        // reload until the user actually views that category. Gated by
        // Settings > Notifications > <category> > Badge.

        loadBadgeCounts() {
            try {
                const raw = localStorage.getItem(this.badgeStorageKey);
                return raw ? JSON.parse(raw) : {};
            } catch (err) {
                return {};
            }
        }

        saveBadgeCounts() {
            try {
                localStorage.setItem(this.badgeStorageKey, JSON.stringify(this.badgeCounts));
            } catch (err) {
                console.warn("Could not persist badge counts:", err);
            }
        }

        badgeEnabledForCategory(category) {
            const categoryKeys = this.categorySettingMap[this.normalizeCategory(category)];
            if (!categoryKeys) return false;
            if (!window.ESMSettings) return true;
            return window.ESMSettings.get(categoryKeys.badge) !== false;
        }

        bumpBadge(category) {
            const normalized = this.normalizeCategory(category);
            if (!this.badgeEnabledForCategory(normalized)) return;

            this.badgeCounts[normalized] = (this.badgeCounts[normalized] || 0) + 1;
            this.saveBadgeCounts();
            this.renderBadge(normalized);
        }

        clearBadge(category) {
            const normalized = this.normalizeCategory(category);
            if (!this.badgeCounts[normalized]) return;

            this.badgeCounts[normalized] = 0;
            this.saveBadgeCounts();
            this.renderBadge(normalized);
        }

        getBadgeCount(category) {
            return this.badgeCounts[this.normalizeCategory(category)] || 0;
        }

        // Update every [data-badge-category="X"] element in the DOM for one
        // category. Elements not currently on screen are simply skipped.
        renderBadge(category) {
            const count = this.getBadgeCount(category);
            document.querySelectorAll(`[data-badge-display="${category}"]`).forEach(el => {
                el.textContent = count > 99 ? "99+" : String(count);
                el.classList.toggle("hidden", count <= 0);
            });
        }

        renderAllBadges() {
            Object.keys(this.categorySettingMap).forEach(category => this.renderBadge(category));
        }

        // Clicking a badge (or its labeled panel header) is a reasonable
        // proxy for "the user has now seen this category" — clear it there
        // as a sane default, in addition to any explicit clearBadge() calls
        // made by the owning module (e.g. chat.js clears "chat" on open).
        bindBadgeClearOnClick() {
            document.addEventListener("click", (e) => {
                const el = e.target.closest("[data-badge-category]");
                if (el) this.clearBadge(el.dataset.badgeCategory);
            });
        }

        // Convert the internal priority into the same toast style class that
        // the existing UI already understands.
        mapPriorityToToastType(priority) {
            switch (priority) {
                case "warning":
                case "critical":
                    return "warn";
                case "success":
                case "info":
                default:
                    return "info";
            }
        }
    }

    const notificationManager = new NotificationManager();
    notificationManager.init();

    window.NotificationManager = notificationManager;

    // Legacy compatibility wrapper. Existing modules can continue using
    // showToast() while the new manager becomes the single implementation.
    window.showToast = function (message, type = "info", duration = 6000) {
        return window.NotificationManager?.notify(message, type, {
            duration,
            toast: true,
            desktop: false,
            category: "system"
        });
    };

    window.notify = function (message, priority = "info", options = {}) {
        return window.NotificationManager?.notify(message, priority, options);
    };

})();
