// ===========================================
// RelayDesk V5
// app.js (BOOTSTRAP FIX)
// ===========================================

function getModalCloseHandler(overlay) {
    const explicitName = overlay?.dataset?.modalCloseHandler;
    if (explicitName && typeof window[explicitName] === "function") {
        return window[explicitName];
    }

    if (!overlay?.id) return null;

    const derivedName = "close" + overlay.id.charAt(0).toUpperCase() + overlay.id.slice(1);
    if (typeof window[derivedName] === "function") {
        return window[derivedName];
    }

    return null;
}

function hideModalOverlay(overlay) {
    const closeHandler = getModalCloseHandler(overlay);

    if (closeHandler) {
        closeHandler();
    } else {
        const dismissButton = overlay.querySelector(
            "button[id*='Close'], button[id*='Cancel'], button[class*='close'], button[class*='cancel'], [data-dismiss='modal']"
        );

        if (dismissButton && !dismissButton.disabled) {
            dismissButton.click();
        }
    }

    overlay.classList.add("hidden");
    overlay.style.display = "none";
    overlay.dispatchEvent(new CustomEvent("modal:close", { bubbles: true }));
}

function attachModalBackdropHandler(overlay) {
    let backdropPressed = false;

    overlay.addEventListener("mousedown", (e) => {
        if (e.button !== 0) {
            backdropPressed = false;
            return;
        }

        backdropPressed = e.target === overlay;
    });

    overlay.addEventListener("mouseup", (e) => {
        if (e.button !== 0) {
            backdropPressed = false;
            return;
        }

        if (backdropPressed && e.target === overlay) {
            hideModalOverlay(overlay);
        }

        backdropPressed = false;
    });

    overlay.addEventListener("mouseleave", () => {
        backdropPressed = false;
    });
}

async function openAboutEsmModal() {
    const overlay = document.getElementById("aboutEsmModal");
    if (!overlay) return;

    overlay.classList.remove("hidden");
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");

    // Keep the version text in sync with the real app version instead of
    // a hardcoded string. Falls back to the last-known static text if
    // electronAPI isn't available (e.g. running in a plain browser tab).
    try {
        if (window.electronAPI?.getAppInfo) {
            const info = await window.electronAPI.getAppInfo();
            const versionText = `Release Version ${info.version || "1.1.5"}`;

            const label = document.getElementById("aboutEsmVersionLabel");
            const footer = document.getElementById("aboutEsmVersionFooter");

            if (label) label.textContent = versionText;
            if (footer) footer.textContent = versionText;
        }
    } catch (err) {
        console.warn("Could not read app version for About modal:", err);
    }
}

function closeAboutEsmModal() {
    const overlay = document.getElementById("aboutEsmModal");
    if (!overlay) return;

    overlay.classList.add("hidden");
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
}

function toggleAboutEsmModal() {
    const overlay = document.getElementById("aboutEsmModal");
    if (!overlay) return;

    if (overlay.classList.contains("hidden")) {
        openAboutEsmModal();
    } else {
        closeAboutEsmModal();
    }
}

function initAboutEsmCredit() {
    document.querySelectorAll(".esmCreditLink").forEach(link => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            toggleAboutEsmModal();
        });
    });
}

window.openAboutEsmModal = openAboutEsmModal;
window.closeAboutEsmModal = closeAboutEsmModal;
window.toggleAboutEsmModal = toggleAboutEsmModal;

window.addEventListener("DOMContentLoaded", async () => {

    console.log("RelayDesk V5 Booting...");

    initCore();
    initFirebase();

    initAuth();

    startClock();
    setConnectionStatus("connected");

    // ===========================================
    // MODAL SAFETY NET
    // Clicking the dark backdrop (not the box itself) always closes
    // a modal, and forces inline display:none directly — this can't
    // get stuck even if a stylesheet fails to load/update correctly.
    // ===========================================

    document.querySelectorAll(".modalOverlay").forEach(overlay => {
        attachModalBackdropHandler(overlay);
    });

    initAboutEsmCredit();

    // Starts the appConfig/main Firestore listener so Version/Credits/
    // Release Notes are live everywhere (including the login screen's
    // About link) regardless of login state — same reasoning as
    // initAboutEsmCredit() just above.
    window.initDevPanel?.();

    // Starts the Firestore-backed, fully configurable Shift
    // Management system's live "shifts" collection listener (see
    // shiftmanagement.js / SHIFT_MANAGEMENT_CONTEXT_TRACKER.md),
    // populating window.SHIFTS / window.SHIFTS_LIST as soon as
    // possible — dashboards/countdowns/lateness calculations
    // (status.js) resolve an employee's shift from this. The old
    // hardcoded initShiftConfig() engine has been retired (Step 6).
    window.initShiftManagement?.();

    console.log("RelayDesk Ready (waiting login)");
});


// ===========================================
// CORE BOOTSTRAP (THIS IS WHAT YOU WERE MISSING)
// ===========================================

function initCore() {

    if (!window.RelayDesk) {

        window.RelayDesk = {};
    }

    window.RelayDesk.UI = {
    statusText: document.getElementById("statusText"),
    workTimer: document.getElementById("workTimer"),
    breakTimer: document.getElementById("breakTimer"),
    awayTimer: document.getElementById("awayTimer"),
    overtimeTimer: document.getElementById("overtimeTimer"),
    connectionStatus: document.getElementById("connectionStatus"),
    colleaguesBox: document.getElementById("colleaguesBox"),
    lastChange: document.getElementById("lastChange")
};

    Object.assign(window.RelayDesk, {

        currentUser: null,
        currentData: null,

        currentStatus: "Off Duty",

        lastSwitchTime: Date.now(),

        timers: { work: 0, break: 0, away: 0 },

        unsubscribe: null,

        shiftEnded: false,

        initialized: true

    });

    console.log("🧠 Core initialized");
}

// ===========================================
// WORKSPACE BOOTSTRAP FIX (ONLINE SAFE)
// ===========================================

function bootWorkspace() {

    // wait until user exists (Firebase async safe)
    if (!window.RelayDesk || !RelayDesk.currentUser) {
        setTimeout(bootWorkspace, 300);
        return;
    }

    // prevent double init
    if (RelayDesk.workspace && RelayDesk.workspace.initialized) {
        return;
    }

    console.log("🧠 Booting Workspace for:", RelayDesk.currentUser);

    // 1. initialize workspace system (your module)
    if (window.RelayDesk.workspace?.init) {
        RelayDesk.workspace.init();
    }

    // 2. load workspace data (notes, loads, etc.)
    if (window.RelayDesk.workspace?.load) {
        RelayDesk.workspace.load();
    }

    // 3. start shift system (IMPORTANT FIX)
    if (window.initializeWorkspace) {
        initializeWorkspace();
    }

    // 4. booked loads system (THIS is what you were missing)
    if (window.initializeBookedLoads) {
        initializeBookedLoads();
    }

    // 5. team chat
    if (window.initializeChat) {
        initializeChat();
    }

    // 5b. Load History (search/edit modal + owner notifications) —
    // previously self-initialized via its own DOMContentLoaded listener
    // in loadhistory.js; moved here to boot alongside the rest of the
    // workspace, consistent with everything else in this list.
    if (window.initializeLoadHistory) {
        initializeLoadHistory();
    }

    // 6. personal shift history ("My Past Shifts")
    if (window.initializeMyHistory) {
        initializeMyHistory();
    }

    // 6c. personal activity timeline ("My Activity") — reads auditLogs,
    // doesn't touch/replace audit.js's admin feed.
    if (window.initializeActivityTimeline) {
        initializeActivityTimeline();
    }

    // 6d. Notification Center — persistent general notification history,
    // additive to notificationmanager.js's toast pipeline.
    if (window.initializeNotificationCenter) {
        initializeNotificationCenter();
    }

    // 6e. Employee Profiles (Phase 2) — view-only, opened on demand from
    // colleagues.js / admin.js via window.openEmployeeProfile(id).
    if (window.initializeEmployeeProfiles) {
        initializeEmployeeProfiles();
    }

    // 7. overtime request button
    if (window.initializeOvertime) {
        initializeOvertime();
    }

    // 8. late/away dispute reporting
    if (window.initializeDisputes) {
        initializeDisputes();
    }

    // 8b. feedback / feature request system
    if (window.initializeFeedback) {
        initializeFeedback();
    }

    // 9. company-wide Monthly Statistics (live panel + lazy monthly
    // archive check) — every logged-in employee gets this, not just admins
    if (window.initializeMonthlyStats) {
        initializeMonthlyStats();
    }

    // 9b. Violations Log — lazy monthly archive check + pre-month-end
    // auto-export (admin/dev only, gated inside the function itself)
    if (window.initializeViolationsLog) {
        initializeViolationsLog();
    }

    // 10. Employee Activity Detection (automatic idle status management)
    if (window.initializeActivityDetection) {
        initializeActivityDetection();
    }

    console.log("🟢 Workspace fully active");
}

bindStatusButtons();
initializePresence();
initTodaysTimersToggle();
initMonthlyStatsToggle?.();
window.initPanelCollapseToggles?.();