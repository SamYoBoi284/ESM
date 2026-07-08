function updateTimersDisplay(timers) {

    if (!timers) return; // 🔥 CRITICAL FIX

    const work = document.getElementById("workTimer");
    const brk = document.getElementById("breakTimer");
    const away = document.getElementById("awayTimer");

    if (!work || !brk || !away) return;

    work.textContent = formatTime(timers.work || 0);
    brk.textContent = formatTime(timers.break || 0);
    away.textContent = formatTime(timers.away || 0);
}

window.updateTimersDisplay = updateTimersDisplay;

setInterval(() => {

    if (!RelayDesk.currentUser) return;

    const now = Date.now();

    let w = RelayDesk.timers.work;
    let b = RelayDesk.timers.break;
    let a = RelayDesk.timers.away;

    if (RelayDesk.currentStatus === "On Duty") {
        w += now - RelayDesk.lastSwitchTime;
    }

    if (RelayDesk.currentStatus === "Break") {
        b += now - RelayDesk.lastSwitchTime;
    }

    if (RelayDesk.currentStatus === "Away") {
        a += now - RelayDesk.lastSwitchTime;
    }

    if (RelayDesk.UI.workTimer)
        RelayDesk.UI.workTimer.innerText = formatTime(w);

    if (RelayDesk.UI.breakTimer)
        RelayDesk.UI.breakTimer.innerText = formatTime(b);

    if (RelayDesk.UI.awayTimer)
        RelayDesk.UI.awayTimer.innerText = formatTime(a);

    // ======================
    // PHASE 5: TOP-BAR MINI TIMERS (Work/Break left of "Connected",
    // Away/Overtime right of it) — shown when the "Today's Timers"
    // dropdown is collapsed. Overtime mini value is filled in below,
    // after overtimeMs is computed.
    // ======================

    const miniWork = document.getElementById("miniWorkTimer");
    const miniBreak = document.getElementById("miniBreakTimer");
    const miniAway = document.getElementById("miniAwayTimer");

    if (miniWork) miniWork.textContent = formatTime(w);
    if (miniBreak) miniBreak.textContent = formatTime(b);
    if (miniAway) miniAway.textContent = formatTime(a);

    // ======================
    // OVERTIME TIMER (counts up once the scheduled 9hr shift end has
    // passed, keeps counting until End Shift is pressed)
    // ======================

    const overtimeEl = RelayDesk.UI.overtimeTimer || document.getElementById("overtimeTimer");

    if (overtimeEl) {
        // On a normal scheduled day, overtimeBaseline == shiftEndTime
        // (9hrs after clock-in) — overtime only counts up past that.
        // On a configured weekly off day, overtimeBaseline is set to
        // the clock-in moment itself in status.js, so the ENTIRE shift
        // counts as overtime from minute 0 (see status.js On Duty init).
        const overtimeMs = (RelayDesk.overtimeBaseline && !RelayDesk.shiftEnded)
            ? Math.max(0, now - RelayDesk.overtimeBaseline)
            : 0;
        overtimeEl.innerText = formatTime(overtimeMs);

        const miniOvertime = document.getElementById("miniOvertimeTimer");
        if (miniOvertime) miniOvertime.textContent = formatTime(overtimeMs);
    }

    // ======================
    // BREAK-TOO-LONG ALERT (employee-facing, fires once per break)
    // ======================

    if (RelayDesk.currentStatus === "Break") {

        const breakLimitMs = (window.BREAK_ALERT_MINUTES || 30) * 60 * 1000;
        const breakElapsed = now - (RelayDesk.lastSwitchTime || now);

        // Settings feature: "Break reminder" (Shift settings)
        const breakReminderOn = window.ESMSettings?.get("breakReminder") !== false;

        if (breakReminderOn && breakElapsed > breakLimitMs && !RelayDesk._breakAlertShown) {
            RelayDesk._breakAlertShown = true;

            if (typeof window.NotificationManager === "object") {
                window.NotificationManager.notify(
                    `☕ You've been on break over ${window.BREAK_ALERT_MINUTES || 30} minutes`,
                    "warning",
                    { category: "alerts" }
                );
            } else if (typeof window.showToast === "function") {
                window.showToast(
                    `☕ You've been on break over ${window.BREAK_ALERT_MINUTES || 30} minutes`,
                    "warn"
                );
            }
        }
    }

    // ======================
    // EXTENDED AWAY ALERT (employee-facing, fires once per Away stretch)
    // Settings feature: "Extended Away reminder" (Shift settings).
    // Mirrors the break alert above; 45 minutes matches the existing
    // admin-facing "extended away" threshold described in the guides.
    // ======================

    if (RelayDesk.currentStatus === "Away") {

        const awayLimitMs = (window.AWAY_ALERT_MINUTES || 45) * 60 * 1000;
        const awayElapsed = now - (RelayDesk.lastSwitchTime || now);

        const awayReminderOn = window.ESMSettings?.get("extendedAwayReminder") !== false;

        if (awayReminderOn && awayElapsed > awayLimitMs && !RelayDesk._awayAlertShown) {
            RelayDesk._awayAlertShown = true;

            if (typeof window.NotificationManager === "object") {
                window.NotificationManager.notify(
                    `🚶 You've been Away over ${window.AWAY_ALERT_MINUTES || 45} minutes`,
                    "warning",
                    { category: "alerts" }
                );
            } else if (typeof window.showToast === "function") {
                window.showToast(
                    `🚶 You've been Away over ${window.AWAY_ALERT_MINUTES || 45} minutes`,
                    "warn"
                );
            }
        }
    }

    updatePerformanceCard(w, b, a);

}, 1000);

function updatePerformanceCard(work, breakT, away) {

    const total = work + breakT + away;

    if (total <= 0) return;

    const workPct = Math.round((work / total) * 100);
    const breakPct = Math.round((breakT / total) * 100);
    const awayPct = Math.round((away / total) * 100);

    document.getElementById("workPercent").innerText = workPct + "%";
    document.getElementById("breakPercent").innerText = breakPct + "%";
    document.getElementById("awayPercent").innerText = awayPct + "%";

    let score = 100;

    score -= breakPct * 0.3;
    score -= awayPct * 0.7;

    score = Math.max(0, Math.round(score));

    document.getElementById("performanceValue").innerText =
        score + " / 100";

    document.getElementById("performanceFill").style.width =
        score + "%";

    const grade = document.getElementById("performanceGrade");

    if (score >= 95) grade.innerText = "🟢 Outstanding";
    else if (score >= 85) grade.innerText = "🟢 Excellent";
    else if (score >= 75) grade.innerText = "🟡 Good";
    else if (score >= 60) grade.innerText = "🟠 Fair";
    else grade.innerText = "🔴 Needs Improvement";

    // =========================
    // LOAD LOGIC (ROLE SAFE + LIVE FIXED)
    // =========================

    const loadsEl = document.getElementById("performanceLoads");
    if (!loadsEl) return;

    const role = RelayDesk.currentUserRole || "";

    // SAFETY EMPLOYEE (blocked)
    if (role === "Safety Employee") {

        loadsEl.innerText = "📦 Loads This Month: N/A (Safety Role)";
        return;
    }

    // DISPATCH + MIXED ROLES
    const loads = Array.isArray(RelayDesk.bookedLoads)
        ? RelayDesk.bookedLoads.length
        : 0;

    loadsEl.innerText = `📦 Loads Booked This Month: ${loads}`;
}


// =========================
// LIVE FIRESTORE LISTENER (RUN ONCE)
// =========================

// =========================
// PHASE 5: TODAY'S TIMERS DROPDOWN TOGGLE
// Button next to Load History shows/hides the full Work/Break/Away/
// Overtime grid. While collapsed (default), the mini Work/Break +
// Away/Overtime readouts stay visible in the top bar instead.
// =========================

window.initTodaysTimersToggle = function () {

    const toggleBtn = document.getElementById("todaysTimersToggleBtn");
    const dropdown = document.getElementById("todaysTimersDropdown");
    const dragHandle = document.getElementById("todaysTimersDragHandle");
    const miniLeft = document.getElementById("miniTimersLeft");
    const miniRight = document.getElementById("miniTimersRight");

    if (!toggleBtn || !dropdown) return;

    toggleBtn.onclick = () => {

        const isOpen = !dropdown.classList.contains("hidden");

        if (isOpen) {
            dropdown.classList.add("hidden");
            miniLeft?.classList.remove("hidden");
            miniRight?.classList.remove("hidden");
        } else {
            dropdown.classList.remove("hidden");
            miniLeft?.classList.add("hidden");
            miniRight?.classList.add("hidden");
        }
    };

    // ======================
    // DRAG AND DROP (grab the "Today's Timers" header to move the panel)
    // ======================

    if (dragHandle) {

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        dragHandle.addEventListener("mousedown", (e) => {

            dragging = true;
            dropdown.classList.add("dragging");

            // Switch to fixed positioning anchored to the viewport the first
            // time a drag starts, so it can be moved anywhere on screen
            // instead of staying constrained to its centered starting spot.
            const rect = dropdown.getBoundingClientRect();
            dropdown.style.position = "fixed";
            dropdown.style.left = rect.left + "px";
            dropdown.style.top = rect.top + "px";
            dropdown.style.transform = "none";

            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {

            if (!dragging) return;

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            // keep it on-screen
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dropdown.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - dropdown.offsetHeight));

            dropdown.style.left = newLeft + "px";
            dropdown.style.top = newTop + "px";
        });

        document.addEventListener("mouseup", () => {

            if (!dragging) return;

            dragging = false;
            dropdown.classList.remove("dragging");
            document.body.style.userSelect = "";
        });
    }

    console.log("🕐 Today's Timers dropdown ready");
};


window.startLoadsListener = function () {

    if (!RelayDesk.currentUser) return;

    // prevent duplicate listeners
    if (RelayDesk._loadsListenerActive) return;
    RelayDesk._loadsListenerActive = true;

    db.collection("users")
        .doc(RelayDesk.currentUser)
        .onSnapshot(doc => {

            const data = doc.data() || {};

            RelayDesk.bookedLoads = data.bookedLoads || [];

            // keep the workspace card list + report formatter preview
            // in sync with the server, not just this tab's own edits
            window.renderBookedLoads?.();

            console.log("📦 LIVE loads update:", RelayDesk.bookedLoads.length);
        });
};