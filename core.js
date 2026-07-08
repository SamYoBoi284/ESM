// ===========================================
// RelayDesk V5
// core.js
// Global System Controller (FIXED)
// ===========================================

window.RelayDesk = {

    currentUser: null,

    currentStatus: "Off Duty",

    currentData: {},

    timers: {
        work: 0,
        break: 0,
        away: 0
    },

    lastSwitchTime: Date.now(),

    unsubscribe: null,

    connected: true,

    UI: {}
};


// ===========================================
// INIT CORE
// ===========================================

function initCore() {

    console.log("🧠 Core initialized");

    RelayDesk.UI = {
        loginScreen: document.getElementById("loginScreen"),
        dashboard: document.getElementById("dashboardScreen"),
        adminScreen: document.getElementById("adminScreen"),
        statusText: document.getElementById("statusText"),
        workTimer: document.getElementById("workTimer"),
        breakTimer: document.getElementById("breakTimer"),
        awayTimer: document.getElementById("awayTimer"),
        colleaguesBox: document.getElementById("colleaguesBox"),
        adminList: document.getElementById("adminList"),
        connectionStatus: document.getElementById("connectionStatus"),
        lastChange: document.getElementById("lastChange"),
        userLabel: document.getElementById("userLabel"),
        statusText: document.getElementById("statusText"),
    };

}


// ===========================================
// INIT AUTH BRIDGE
// ===========================================

function initAuth() {

    console.log("🔐 Auth system initialized");

    if (typeof login === "function") {

        document.getElementById("loginBtn").onclick = login;

    }

}


// ===========================================
// INIT ADMIN BRIDGE
// ===========================================

function initAdmin() {

    console.log("🛠 Admin system ready");

    if (RelayDesk.currentUser === "A000") {

        showScreen("adminScreen");

    }

}


// ===========================================
// SCREEN SWITCH
// ===========================================

function showScreen(id) {

    ["loginScreen", "dashboardScreen", "adminScreen"].forEach(s => {

        const el = document.getElementById(s);

        if (el) el.classList.add("hidden");

    });

    const target = document.getElementById(id);

    if (target) target.classList.remove("hidden");

}

window.getTodayShiftId = function (userId = RelayDesk.currentUser) {

    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    return `shift_${yyyy}-${mm}-${dd}_${userId}`;
};