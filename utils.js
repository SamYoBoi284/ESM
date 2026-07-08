// ===========================================
// RelayDesk V5
// utils.js
// CORE SAFE UTILITY SYSTEM (UPGRADED)
// ===========================================


// ===========================================
// SAFE DOM ACCESS
// ===========================================

function $(id) {
    const el = document.getElementById(id);

    if (!el) {
        console.warn(`⚠️ Missing element: ${id}`);
    }

    return el;
}


// ===========================================
// FORMAT TIME (SAFE)
// ===========================================

function formatTime(ms) {

    if (!ms || ms < 0) ms = 0;

    let seconds = Math.floor(ms / 1000);
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = seconds % 60;

    return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
}


// ===========================================
// CURRENT TIME / DATE
// ===========================================

function getCurrentTime() {
    return new Date().toLocaleTimeString();
}

function getCurrentDate() {
    return new Date().toDateString();
}

// Damascus, Syria runs on a fixed UTC+3 offset (no DST since 2022).
// Using the IANA timezone (instead of a hardcoded +3) means this stays
// correct automatically even if that ever changes.
function getDamascusTime() {
    return new Date().toLocaleTimeString("en-US", {
        timeZone: "Asia/Damascus",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}

// Formats an arbitrary timestamp (e.g. a stored lastChange value) in
// Damascus time, rather than the current moment. Used anywhere we need
// to show "when something happened" in SY time, not "what time is it now".
function formatDamascusTime(ms) {
    if (!ms) return "--";

    return new Date(ms).toLocaleTimeString("en-US", {
        timeZone: "Asia/Damascus",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });
}


// ===========================================
// AUTO CLOCK START (SAFE INIT)
// ===========================================

let clockIntervalStarted = false;

function startClock() {

    if (clockIntervalStarted) return;
    clockIntervalStarted = true;

    function update() {

        const clock = $("clock");
        const date = $("date");
        const damascusClock = $("damascusClock");

        if (clock) clock.textContent = `🇺🇸 ${getCurrentTime()}`;
        if (date) date.textContent = getCurrentDate();
        if (damascusClock) damascusClock.textContent = `🇸🇾 ${getDamascusTime()}`;
    }

    update();
    setInterval(update, 1000);
}


// ===========================================
// CONNECTION STATUS (SAFE + AUTO RESET)
// ===========================================

function setConnectionStatus(state = "connected") {

    const indicator = $("connectionStatus");
    if (!indicator) return;

    indicator.className = "";

    switch (state) {

        case "connected":
            indicator.classList.add("connected");
            indicator.textContent = "🟢 Connected";
        break;

        case "reconnecting":
            indicator.classList.add("reconnecting");
            indicator.textContent = "🟡 Reconnecting...";
        break;

        case "offline":
            indicator.classList.add("disconnected");
            indicator.textContent = "🔴 Offline";
        break;

        default:
            indicator.classList.add("reconnecting");
            indicator.textContent = "🟡 Unknown";
        break;
    }
}


// ===========================================
// SAFE MESSAGE DISPLAY
// ===========================================

function showMessage(message = "", color = "white") {

    const msg = $("loginMsg");

    if (!msg) return;

    msg.textContent = message;
    msg.style.color = color;
}


// ===========================================
// SCREEN SWITCHER (HARD SAFE V5)
// ===========================================

function showScreen(screenId) {

    const screens = document.querySelectorAll(".screen");

    if (!screens.length) {
        console.error("❌ No screens found");
        return;
    }

    screens.forEach(screen => {
        screen.classList.add("hidden");
    });

    const target = $(screenId);

    if (!target) {
        console.error(`❌ Screen not found: ${screenId}`);
        return;
    }

    target.classList.remove("hidden");
}


// ===========================================
// CONFIRM WRAPPER
// ===========================================

function ask(question) {
    return confirm(question);
}


// ===========================================
// TOAST NOTIFICATIONS (non-blocking heads-up)
// ===========================================

window.showToast = function (message, type = "info", duration = 6000) {

    let container = document.getElementById("toastContainer");

    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // force reflow so the CSS transition actually plays
    void toast.offsetHeight;
    toast.classList.add("toastShow");

    setTimeout(() => {
        toast.classList.remove("toastShow");
        setTimeout(() => toast.remove(), 350);
    }, duration);
};