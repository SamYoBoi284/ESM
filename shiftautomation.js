// ===========================================
// RelayDesk — SHIFT-END GRACE AUTOMATION
// ===========================================
// Handles what happens when the shift countdown hits 00:00:00 and the
// employee hasn't clocked out. Flow (matches Sam's spec exactly):
//
//   Shift ends (timer hits 0)
//     -> Notification #1
//     -> 5 min -> Notification #2
//     -> 5 min -> Notification #3
//     -> Auto Break (retroactively re-labels the last ~10 minutes of
//        unattended "Work" time as "Break" time, so the employee isn't
//        penalized as if they'd kept working unattended)
//     -> 5 min -> Auto Off Duty (a full timer reset, like any other Off
//        Duty — so the reclassified 10 min washes out to zero anyway)
//
// At any point before Auto Off Duty, clicking "I'm still here" on the
// notification cancels the whole sequence, puts the employee back On
// Duty, and gives back whatever had been converted into Break (so
// working overtime is never penalized). Taking any other manual status
// action during the grace period counts as the same proof-of-presence
// and cancels/reverts it too (see the hook in status.js).

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    const NOTIFY_INTERVAL_MS = 5 * 60 * 1000;         // 5 minutes
    const AUTO_BREAK_AT_MS = 2 * NOTIFY_INTERVAL_MS;  // 10 min in: after notification #3
    const AUTO_OFFDUTY_AT_MS = AUTO_BREAK_AT_MS + NOTIFY_INTERVAL_MS; // 15 min in

    RelayDesk.shiftGrace = {
        active: false,
        graceStartedAt: null,
        convertedMs: 0,
        timeouts: []
    };

    function clearGraceTimeouts() {
        RelayDesk.shiftGrace.timeouts.forEach(id => clearTimeout(id));
        RelayDesk.shiftGrace.timeouts = [];
    }

    function removeGraceToast() {
        document.getElementById("shiftGraceToast")?.remove();
    }

    // Cancels the pending auto Break/Off-Duty sequence and reverses
    // whatever Work time had been provisionally reclassified as Break.
    // Called both by the "I'm still here" button and, generically, by
    // status.js whenever the employee takes any manual status action
    // while the grace period is running.
    window.cancelShiftGrace = function () {
        const grace = RelayDesk.shiftGrace;
        if (!grace.active) return;

        clearGraceTimeouts();

        if (grace.convertedMs > 0) {
            RelayDesk.timers.break = Math.max(0, RelayDesk.timers.break - grace.convertedMs);
            RelayDesk.timers.work += grace.convertedMs;
            grace.convertedMs = 0;
        }

        grace.active = false;
        grace.graceStartedAt = null;

        removeGraceToast();
    };

    // "I'm still here" — explicit resume action from the notification.
    function resumeOnDuty() {
        window.cancelShiftGrace();
        window.changeUserStatus("On Duty");

        if (typeof logAudit === "function") {
            logAudit(
                RelayDesk.currentUser,
                "SHIFT_GRACE_RESUMED",
                "Employee confirmed still present; resumed On Duty"
            );
        }
    }

    // A single persistent actionable toast, replaced in place at each
    // interval rather than stacking three separate un-actionable ones.
    function showGraceToast(message) {
        removeGraceToast();

        const container = document.getElementById("toastContainer");
        if (!container) return;

        const toast = document.createElement("div");
        toast.id = "shiftGraceToast";
        toast.className = "toast toast-warn shiftGraceToast";

        const text = document.createElement("span");
        text.textContent = message;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "shiftGraceResumeBtn";
        btn.textContent = "I'm still here";
        btn.onclick = resumeOnDuty;

        toast.appendChild(text);
        toast.appendChild(btn);
        container.appendChild(toast);

        void toast.offsetHeight;
        toast.classList.add("toastShow");
    }

    function fireNotification(message) {
        showGraceToast(message);

        if (typeof window.NotificationManager === "object") {
            // The manager's own toast is skipped (toast: false) since
            // showGraceToast() above already rendered an actionable one
            // for this same message — the desktop notification + sound
            // still fire normally.
            window.NotificationManager.notify(message, "warning", {
                category: "alerts",
                toast: false
            });
        }
    }

    function autoSwitchToBreak() {
        const grace = RelayDesk.shiftGrace;
        if (!grace.active) return;

        // Let the normal status pipeline log the unattended stretch into
        // Work first, exactly like any other switch, then retroactively
        // move that same stretch over into Break.
        window.changeUserStatus("Break", { isAutomationStep: true });

        const elapsed = Date.now() - grace.graceStartedAt;
        const convert = Math.min(elapsed, RelayDesk.timers.work);

        RelayDesk.timers.work = Math.max(0, RelayDesk.timers.work - convert);
        RelayDesk.timers.break += convert;
        grace.convertedMs = convert;

        // Keep Firestore in sync with the corrected split right away
        // rather than waiting on the next status change to save it.
        if (typeof db !== "undefined" && RelayDesk.currentUser) {
            db.collection("users").doc(RelayDesk.currentUser).set({
                work: RelayDesk.timers.work,
                breakT: RelayDesk.timers.break
            }, { merge: true }).catch(() => {});
        }

        if (typeof logAudit === "function") {
            logAudit(
                RelayDesk.currentUser,
                "AUTO_BREAK_SHIFT_END",
                `Converted ~${Math.round(convert / 60000)} min Work -> Break (shift ended, unattended)`
            );
        }

        fireNotification("🟡 Your shift ended 10 minutes ago — you've been automatically switched to Break.");
    }

    function autoSwitchToOffDuty() {
        const grace = RelayDesk.shiftGrace;
        if (!grace.active) return;

        // Off Duty already resets every timer to zero, so whatever had
        // been reclassified into Break a moment ago washes out anyway —
        // no separate "convert back to zero" step is needed here.
        window.changeUserStatus("Off Duty", { isAutomationStep: true, auto: true });

        if (typeof logAudit === "function") {
            logAudit(
                RelayDesk.currentUser,
                "AUTO_OFFDUTY_SHIFT_END",
                "Automatically set Off Duty — 15 min unattended after shift end"
            );
        }

        if (typeof window.NotificationManager === "object") {
            window.NotificationManager.notify(
                "🔴 You've been automatically set Off Duty — your shift ended 15 minutes ago.",
                "warning",
                { category: "alerts" }
            );
        }

        grace.active = false;
        grace.graceStartedAt = null;
        grace.convertedMs = 0;
        removeGraceToast();
    }

    // Entry point — called once from workspace.js the instant the shift
    // countdown reaches 00:00:00.
    window.beginShiftEndGrace = function () {

        // Only meaningful if the employee is still (unattended) On Duty.
        // If they'd already put themselves on Break/Away before the
        // shift ended, nothing unfair is accumulating against them, so
        // there's nothing here to auto-correct.
        if (RelayDesk.currentStatus !== "On Duty") return;
        if (RelayDesk.shiftGrace.active) return;

        const grace = RelayDesk.shiftGrace;
        grace.active = true;
        grace.graceStartedAt = Date.now();
        grace.convertedMs = 0;

        fireNotification("⏳ Your shift has ended. Still working? Click below to stay On Duty.");

        grace.timeouts.push(setTimeout(() => {
            if (!grace.active) return;
            fireNotification("⏳ Your shift ended 5 minutes ago. Still working?");
        }, NOTIFY_INTERVAL_MS));

        grace.timeouts.push(setTimeout(() => {
            if (!grace.active) return;
            fireNotification("⏳ Your shift ended 10 minutes ago. Still working?");
            autoSwitchToBreak();
        }, AUTO_BREAK_AT_MS));

        grace.timeouts.push(setTimeout(autoSwitchToOffDuty, AUTO_OFFDUTY_AT_MS));
    };

})();
