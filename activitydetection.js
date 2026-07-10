// ===========================================
// RelayDesk / ESM
// activitydetection.js
// EMPLOYEE ACTIVITY DETECTION (AUTOMATIC IDLE STATUS MANAGEMENT)
// ===========================================
// Watches for real user activity (mouse, keyboard, scroll, general
// window focus) while the employee is On Duty. If no activity is seen
// for the configured warning threshold, a heads-up notification is
// shown; if idleness continues past the configured Break threshold the
// employee is automatically switched On Duty -> Break (reusing the
// normal changeUserStatus() pipeline, exactly like a manual change,
// just flagged as automation). If they stay idle further, an additional
// configurable timer, counted from the moment auto-Break fires, auto-
// switches Break -> Off Duty. Any real activity
// while auto-Break is active prompts the employee to confirm before
// returning to On Duty (unless that confirmation is disabled in
// Settings). Any genuine manual status change anywhere in the app
// cancels the whole sequence (see the hook in status.js).
//
// This replaces the old shift-end grace automation (shiftautomation.js,
// now removed) — that only fired once the 9hr shift timer hit zero;
// this is a general-purpose idle watcher that runs the entire time the
// employee is On Duty.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    window.I18N?.register("activity", {
        en: {
            idleWarning: "No activity has been detected for a while. You will automatically be switched to Break in {minutes} minutes unless activity resumes.",
            autoBreak: "🟡 You've been automatically switched to Break due to inactivity.",
            autoOffDuty: "🔴 You've been automatically switched to Off Duty after an extended period of inactivity.",
            returnPrompt: "Activity detected. Would you like to return to On Duty?",
            returnBtn: "Return to On Duty",
            stayBtn: "Stay on Break"
        },
        ar: {
            idleWarning: "لم يتم رصد أي نشاط لفترة. سيتم تحويلك تلقائيًا إلى استراحة خلال {minutes} دقيقة ما لم يُستأنف النشاط.",
            autoBreak: "🟡 تم تحويلك تلقائيًا إلى استراحة بسبب عدم النشاط.",
            autoOffDuty: "🔴 تم تحويلك تلقائيًا إلى خارج الدوام بعد فترة طويلة من عدم النشاط.",
            returnPrompt: "تم رصد نشاط. هل ترغب بالعودة إلى وضع الدوام؟",
            returnBtn: "العودة إلى الدوام",
            stayBtn: "البقاء في الاستراحة"
        }
    });

    const state = {
        lastActivityAt: Date.now(),
        warningShown: false,
        autoBreakActive: false,
        // Timestamp auto-Break actually fired — "Idle before automatic Off
        // Duty" is anchored to this, not to when idleness began. See
        // scheduleAutoOffDuty() below.
        autoBreakFiredAt: null,
        offDutyTimer: null,
        pollInterval: null,
        listenersBound: false,
        returnDialogOpen: false
    };

    function minutesToMs(m) {
        return Math.max(1, Number(m) || 0) * 60 * 1000;
    }

    function getConfig() {
        const S = window.ESMSettings;

        const warningMinutes = S ? (Number(S.get("idleWarningMinutes")) || 5) : 5;
        // "Idle before automatic Break" is derived — always warning + 1
        // minute, no longer an independent setting.
        const breakMinutes = warningMinutes + 1;
        // "Idle before automatic Off Duty" is counted FROM WHEN AUTO-BREAK
        // FIRES (state.autoBreakFiredAt in scheduleAutoOffDuty() below),
        // not from when idleness first began — so this is just the raw
        // 15/20-minute buffer, unmodified by the warning time.
        const offDutyExtraMinutes = S ? (Number(S.get("idleOffDutyMinutes")) || 15) : 15;

        return {
            enabled: S ? S.get("enableIdleDetection") !== false : true,
            warningMs: minutesToMs(warningMinutes),
            breakMs: minutesToMs(breakMinutes),
            offDutyExtraMs: minutesToMs(offDutyExtraMinutes),
            requireConfirm: S ? S.get("requireOnDutyConfirmation") !== false : true
        };
    }

    // ===========================================
    // ACTIVITY TRACKING
    // ===========================================

    const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart"];
    let lastMarkTs = 0;

    function markActivity() {
        const now = Date.now();
        state.lastActivityAt = now;

        // Throttle the "reactive" side-effects (dismissing the warning /
        // offering to return) to once a second — the timestamp above is
        // always kept fresh (cheap), only the DOM work below is throttled.
        if (now - lastMarkTs < 1000) return;
        lastMarkTs = now;

        if (state.warningShown) dismissWarning();
        if (state.autoBreakActive) offerReturnToOnDuty();
    }

    function bindActivityListeners() {
        if (state.listenersBound) return;
        ACTIVITY_EVENTS.forEach(evt => {
            document.addEventListener(evt, markActivity, { passive: true, capture: true });
        });
        window.addEventListener("focus", markActivity);
        state.listenersBound = true;
    }

    function unbindActivityListeners() {
        if (!state.listenersBound) return;
        ACTIVITY_EVENTS.forEach(evt => {
            document.removeEventListener(evt, markActivity, { capture: true });
        });
        window.removeEventListener("focus", markActivity);
        state.listenersBound = false;
    }

    // ===========================================
    // OS-WIDE IDLE (ELECTRON powerMonitor BRIDGE)
    // ===========================================
    // DOM listeners above only see input while the ESM window itself has
    // focus. In Electron, electron/main.js exposes powerMonitor's
    // system-wide idle time (mouse/keyboard anywhere on the machine),
    // so an employee who's minimized/tabbed away but still actively
    // working in another window is correctly NOT treated as idle, and
    // one who really has stepped away is caught even if ESM never had
    // focus during that time. Falls back to DOM-only tracking in a
    // plain browser tab, where this bridge doesn't exist.

    function hasSystemIdleBridge() {
        return typeof window.electronAPI?.getSystemIdleTime === "function";
    }

    async function refreshFromSystemIdle() {
        if (!hasSystemIdleBridge()) return;

        let idleSeconds;
        try {
            idleSeconds = await window.electronAPI.getSystemIdleTime();
        } catch (e) {
            return;
        }

        const idleMs = Math.max(0, Number(idleSeconds) || 0) * 1000;
        const inferredLastActivity = Date.now() - idleMs;

        // Only ever move the known "last activity" time FORWARD (more
        // recent). The OS poll has coarser timing than our own DOM
        // listeners, so this just picks up activity DOM events missed
        // (e.g. window unfocused) without ever overriding something more
        // recent we already know about.
        if (inferredLastActivity > state.lastActivityAt) {
            const wasWarningShown = state.warningShown;
            const wasAutoBreakActive = state.autoBreakActive;

            state.lastActivityAt = inferredLastActivity;

            if (wasWarningShown) dismissWarning();
            if (wasAutoBreakActive) offerReturnToOnDuty();
        }
    }

    // ===========================================
    // IDLE WARNING TOAST
    // ===========================================

    function removeWarningToast() {
        document.getElementById("idleWarningToast")?.remove();
    }

    function dismissWarning() {
        state.warningShown = false;
        removeWarningToast();
    }

    function showWarningToast(message) {
        removeWarningToast();
        const container = document.getElementById("toastContainer");
        if (!container) return;

        const toast = document.createElement("div");
        toast.id = "idleWarningToast";
        toast.className = "toast toast-warn shiftGraceToast";

        const text = document.createElement("span");
        text.textContent = message;
        toast.appendChild(text);

        container.appendChild(toast);
        void toast.offsetHeight;
        toast.classList.add("toastShow");
    }

    function fireIdleWarning(cfg) {
        state.warningShown = true;

        const graceMinutes = Math.max(1, Math.round((cfg.breakMs - cfg.warningMs) / 60000));
        const msg = window.I18N
            ? window.I18N.t("activity.idleWarning", { minutes: graceMinutes })
            : `No activity has been detected for a while. You will automatically be switched to Break in ${graceMinutes} minutes unless activity resumes.`;

        showWarningToast(msg);

        if (typeof window.NotificationManager === "object") {
            window.NotificationManager.notify(msg, "warning", { category: "away", toast: false });
        }
    }

    // ===========================================
    // AUTO BREAK / AUTO OFF DUTY
    // ===========================================

    function autoSwitchToBreak() {
        if (state.autoBreakActive) return;
        if (RelayDesk.currentStatus !== "On Duty") return;

        state.autoBreakActive = true;
        state.autoBreakFiredAt = Date.now();
        dismissWarning();

        // The employee has actually been idle since state.lastActivityAt —
        // that stretch shouldn't count as Work time, it should count as
        // Break time instead. changeUserStatus() splits the diff using
        // this credit rather than crediting the whole thing to Work.
        const idleDurationMs = Date.now() - state.lastActivityAt;

        // Reuses the normal status pipeline — recorded internally exactly
        // like any other status change, just flagged as automation so it
        // (a) doesn't cancel its own sequence and (b) gets tagged with
        // autoIdleStatus for Admin Panel visibility.
        window.changeUserStatus("Break", { isAutomationStep: true, isIdleAuto: true, idleCreditMs: idleDurationMs });

        if (typeof logAudit === "function") {
            logAudit(RelayDesk.currentUser, "AUTO_BREAK_IDLE", "Automatic Idle Detection");
        }

        if (typeof window.NotificationManager === "object") {
            window.NotificationManager.notify(
                window.I18N ? window.I18N.t("activity.autoBreak") : "🟡 You've been automatically switched to Break due to inactivity.",
                "warning",
                { category: "away" }
            );
        }

        scheduleAutoOffDuty();
    }

    function scheduleAutoOffDuty() {
        clearTimeout(state.offDutyTimer);
        state.offDutyTimer = null;

        const cfg = getConfig();
        if (!cfg.offDutyExtraMs || !state.autoBreakFiredAt) return;

        // Idle before auto Off Duty is measured from when auto-Break
        // fired (state.autoBreakFiredAt), not from when idleness first
        // began — so schedule only the REMAINING time needed to reach
        // that buffer, computed fresh (works both on initial call from
        // autoSwitchToBreak() and on a settings-change reschedule).
        const sinceAutoBreak = Date.now() - state.autoBreakFiredAt;
        const remainingMs = Math.max(0, cfg.offDutyExtraMs - sinceAutoBreak);

        state.offDutyTimer = setTimeout(() => {
            if (!state.autoBreakActive) return;
            autoSwitchToOffDuty();
        }, remainingMs);
    }

    function autoSwitchToOffDuty() {
        window.changeUserStatus("Off Duty", { isAutomationStep: true, isIdleAuto: true });

        if (typeof logAudit === "function") {
            logAudit(RelayDesk.currentUser, "AUTO_OFFDUTY_IDLE", "Automatic Idle Detection");
        }

        if (typeof window.NotificationManager === "object") {
            window.NotificationManager.notify(
                window.I18N ? window.I18N.t("activity.autoOffDuty") : "🔴 You've been automatically switched to Off Duty after an extended period of inactivity.",
                "warning",
                { category: "away" }
            );
        }

        resetIdleState();
    }

    function resetIdleState() {
        state.autoBreakActive = false;
        state.autoBreakFiredAt = null;
        clearTimeout(state.offDutyTimer);
        state.offDutyTimer = null;
        removeReturnDialog();
        dismissWarning();
    }

    // ===========================================
    // "RETURN TO ON DUTY?" CONFIRMATION
    // ===========================================

    function removeReturnDialog() {
        document.getElementById("idleReturnOverlay")?.remove();
        state.returnDialogOpen = false;
    }

    function offerReturnToOnDuty() {
        if (!state.autoBreakActive) return;

        const cfg = getConfig();

        if (!cfg.requireConfirm) {
            resumeOnDutyFromIdle();
            return;
        }

        if (state.returnDialogOpen) return;
        state.returnDialogOpen = true;

        const overlay = document.createElement("div");
        overlay.className = "modalOverlay";
        overlay.id = "idleReturnOverlay";

        const box = document.createElement("div");
        box.className = "modalBox";

        const msg = document.createElement("p");
        msg.textContent = window.I18N ? window.I18N.t("activity.returnPrompt") : "Activity detected. Would you like to return to On Duty?";
        box.appendChild(msg);

        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.gap = "10px";
        btnRow.style.marginTop = "14px";

        const returnBtn = document.createElement("button");
        returnBtn.className = "shiftGraceResumeBtn";
        returnBtn.textContent = window.I18N ? window.I18N.t("activity.returnBtn") : "Return to On Duty";
        returnBtn.onclick = () => {
            removeReturnDialog();
            resumeOnDutyFromIdle();
        };

        const stayBtn = document.createElement("button");
        stayBtn.textContent = window.I18N ? window.I18N.t("activity.stayBtn") : "Stay on Break";
        stayBtn.onclick = () => {
            removeReturnDialog();
            // Employee explicitly chose to remain — stop tracking this
            // idle-auto sequence (they're on Break like any other Break
            // now); a fresh On Duty click starts idle detection over.
            resetIdleState();
        };

        btnRow.appendChild(returnBtn);
        btnRow.appendChild(stayBtn);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    function resumeOnDutyFromIdle() {
        resetIdleState();
        window.changeUserStatus("On Duty");

        if (typeof logAudit === "function") {
            logAudit(RelayDesk.currentUser, "IDLE_RETURN_ON_DUTY", "Employee confirmed presence; resumed On Duty");
        }
    }

    // ===========================================
    // MAIN POLL LOOP
    // ===========================================

    async function tick() {
        const cfg = getConfig();
        if (!cfg.enabled) return;

        await refreshFromSystemIdle();

        // Once auto-switched to Break, "waiting for activity to come
        // back" is handled instantly by markActivity() -> offerReturnToOnDuty(),
        // not by this poll.
        if (state.autoBreakActive) return;

        if (RelayDesk.currentStatus !== "On Duty") {
            if (state.warningShown) dismissWarning();
            return;
        }

        const idleFor = Date.now() - state.lastActivityAt;

        if (idleFor >= cfg.breakMs) {
            autoSwitchToBreak();
        } else if (idleFor >= cfg.warningMs && !state.warningShown) {
            fireIdleWarning(cfg);
        }
    }

    // ===========================================
    // INIT / SETTINGS HOOK
    // ===========================================

    function applyEnabledState() {
        const cfg = getConfig();
        if (cfg.enabled) {
            bindActivityListeners();
            if (!state.pollInterval) {
                state.pollInterval = setInterval(tick, 5000);
            }
        } else {
            unbindActivityListeners();
            clearInterval(state.pollInterval);
            state.pollInterval = null;
            resetIdleState();
        }
    }

    window.initializeActivityDetection = function () {
        state.lastActivityAt = Date.now();
        applyEnabledState();
    };

    window.ActivityDetection = {
        onSettingsChanged(key) {
            if (key === "enableIdleDetection") {
                applyEnabledState();
            }
            if ((key === "idleOffDutyMinutes" || key === "idleWarningMinutes") && state.autoBreakActive) {
                scheduleAutoOffDuty();
            }
        },

        // Called by status.js whenever a genuine manual status change
        // happens anywhere — proof of presence, cancels the sequence.
        cancelIdleAuto() {
            if (state.autoBreakActive) {
                resetIdleState();
            } else if (state.warningShown) {
                dismissWarning();
            }
            state.lastActivityAt = Date.now();
        }
    };

})();
