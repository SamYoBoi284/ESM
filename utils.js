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
    // Settings feature: Appearance > 24-Hour Time > USA Clock. Locale
    // stays whatever the browser default is (unchanged from before) —
    // only hour12 is forced one way or the other.
    const use24h = window.ESMSettings?.get("use24HourUSA") === true;
    return new Date().toLocaleTimeString(undefined, { hour12: !use24h });
}

function getCurrentDate() {
    return new Date().toDateString();
}

// Damascus, Syria runs on a fixed UTC+3 offset (no DST since 2022).
// Using the IANA timezone (instead of a hardcoded +3) means this stays
// correct automatically even if that ever changes.
function getDamascusTime() {
    // Settings feature: Appearance > 24-Hour Time > Damascus Clock.
    const use24h = window.ESMSettings?.get("use24HourDamascus") === true;
    return new Date().toLocaleTimeString("en-US", {
        timeZone: "Asia/Damascus",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: !use24h
    });
}

// Formats an arbitrary timestamp (e.g. a stored lastChange value) in
// Damascus time, rather than the current moment. Used anywhere we need
// to show "when something happened" in SY time, not "what time is it now".
function formatDamascusTime(ms) {
    if (!ms) return "--";

    const use24h = window.ESMSettings?.get("use24HourDamascus") === true;
    return new Date(ms).toLocaleTimeString("en-US", {
        timeZone: "Asia/Damascus",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: !use24h
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

    // Exposed so settings.js can force an immediate refresh the moment
    // someone flips a 24-Hour Time toggle, instead of waiting up to 1s
    // for the next tick.
    window.refreshClockDisplay = update;

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

    const target = $(screenId);
    if (!target) {
        console.error(`❌ Screen not found: ${screenId}`);
        return;
    }

    const current = Array.from(screens).find(screen => !screen.classList.contains("hidden"));
    const special = ["adminScreen", "devPanelScreen"].includes(screenId) &&
        current && current !== target && current.id !== "loginScreen";

    if (!special) {
        screens.forEach(screen => screen.classList.add("hidden"));
        target.classList.remove("hidden");
        return;
    }

    screens.forEach(screen => {
        if (screen !== current && screen !== target) screen.classList.add("hidden");
    });
    current.classList.remove("hidden");
    target.classList.remove("hidden");
    current.classList.add("screenTransitionUpOut");
    target.classList.add("screenTransitionUpIn");

    setTimeout(() => {
        current.classList.add("hidden");
        current.classList.remove("screenTransitionUpOut");
        target.classList.remove("screenTransitionUpIn");
    }, 380);
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


// ===========================================
// COLLAPSIBLE PANEL HEADERS (accordion-style)
// ===========================================
// Generic helper for the "header stays put, body collapses" pattern
// used by the Workspace section, STS Team list, and the End-of-Shift
// Report Formatter. Each panel's collapsed/expanded state is
// remembered per-browser (localStorage) so it sticks across reloads.

window.bindPanelCollapseToggle = function (btnId, bodyId, storageKey) {

    const btn = document.getElementById(btnId);
    const body = document.getElementById(bodyId);

    if (!btn || !body) return;

    const applyState = (collapsed) => {
        body.classList.toggle("panelCollapseBody-collapsed", collapsed);
        btn.classList.toggle("collapsed", collapsed);
        btn.setAttribute("aria-expanded", String(!collapsed));
        btn.textContent = collapsed ? "▸" : "▾";
    };

    let collapsed = false;
    try {
        collapsed = localStorage.getItem(storageKey) === "1";
    } catch (e) {}

    applyState(collapsed);

    btn.addEventListener("click", () => {
        collapsed = !collapsed;
        applyState(collapsed);

        try {
            localStorage.setItem(storageKey, collapsed ? "1" : "0");
        } catch (e) {}
    });
};

// Binds the two static (already-in-HTML) collapsible panels. The
// Report Formatter panel is built dynamically by workspace.js, so it
// binds its own toggle from inside reportFormatter.bindEvents() once
// its DOM actually exists.
window.initPanelCollapseToggles = function () {
    window.bindPanelCollapseToggle("workspaceSectionToggleBtn", "workspaceSectionBody", "relaydesk_collapse_workspace");
    window.bindPanelCollapseToggle("stsTeamToggleBtn", "colleaguesBox", "relaydesk_collapse_stsTeam");
};

// Global modal open/close animation. The current focused control is used as
// the origin when a modal opens (e.g. Add Load expands from its button).
(function () {
    function isModal(el) {
        return el instanceof HTMLElement && el.matches(".modalOverlay, .modal");
    }
    function setOrigin(el) {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || active === el) return;
        const r = active.getBoundingClientRect();
        if (r.width && r.height) {
            el.style.setProperty("--modal-origin-x", (r.left + r.width / 2) + "px");
            el.style.setProperty("--modal-origin-y", (r.top + r.height / 2) + "px");
        }
    }
    function openAnim(el) {
        if (el.dataset.modalAnimating === "true") return;
        el.dataset.modalAnimating = "true";
        setOrigin(el);
        el.classList.add("modalOpening");
        setTimeout(() => {
            el.classList.remove("modalOpening");
            el.dataset.modalAnimating = "done";
            setTimeout(() => delete el.dataset.modalAnimating, 0);
        }, 280);
    }
    function closeAnim(el) {
        if (el.dataset.modalAnimating === "true") return;
        el.dataset.modalAnimating = "true";
        el.classList.remove("hidden");
        el.classList.add("modalClosing");
        setTimeout(() => {
            el.classList.remove("modalClosing");
            el.classList.add("hidden");
            el.dataset.modalAnimating = "done";
            setTimeout(() => delete el.dataset.modalAnimating, 0);
        }, 280);
    }
    document.addEventListener("DOMContentLoaded", () => {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                if (m.type !== "attributes" || m.attributeName !== "class") return;
                const el = m.target;
                if (!isModal(el) || el.dataset.modalAnimating === "true") return;
                if (el.classList.contains("hidden")) closeAnim(el);
                else openAnim(el);
            });
        });
        observer.observe(document.body, {subtree:true,attributes:true,attributeFilter:["class"]});
    });
})();
