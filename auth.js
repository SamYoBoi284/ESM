// ===========================================
// RelayDesk V5 AUTH SYSTEM (BOOT FIX)
// ===========================================

// ===========================================
// SHIFT RESOLUTION (new Shift Management system)
// ===========================================
//
// STEP 5 — LOGIN-TIME RESOLUTION. Resolves + caches the logged-in
// employee's shift on RelayDesk.currentUserShift as soon as it's
// known, instead of every dashboard/countdown consumer resolving it
// themselves on every render. Called once from startSession() right
// after login, and re-called on every `shiftsChanged` event (fired by
// shiftmanagement.js whenever any `shifts` doc changes) — this single
// listener covers both "my shift's own config changed" (renamed,
// retimed, retimezoned, enabled/disabled) and "I was moved to/off a
// shift", since assignment lives on the shift doc's
// `assignedEmployees`, not on my own `users/{id}` doc, so a reassign
// never fires my user-doc onSnapshot. Also covers the (unlikely but
// possible) race where `window.SHIFTS_LIST` hadn't finished its first
// load yet at the exact moment of login — the next `shiftsChanged`
// fire (which happens as soon as that first load lands) re-resolves.
function resolveCurrentUserShift() {

    if (!RelayDesk.currentUser || RelayDesk.currentUser === "A000") {
        RelayDesk.currentUserShift = null;
        return;
    }

    RelayDesk.currentUserShift = window.getEmployeeAssignedShift?.(RelayDesk.currentUser) || null;

    // Dashboard/countdown UI (Step 5, next portions) can listen for
    // this instead of polling, mirroring the shiftMgmt admin-panel
    // pattern already used in admin.js.
    document.dispatchEvent(new CustomEvent("currentUserShiftResolved", {
        detail: { shift: RelayDesk.currentUserShift }
    }));
}

document.addEventListener("shiftsChanged", resolveCurrentUserShift);

function initAuth() {

    console.log("🔐 Auth system initialized");

    const loginBtn = document.getElementById("loginBtn");

    if (!loginBtn) {
        console.error("❌ loginBtn missing");
        return;
    }

    loginBtn.onclick = login;

    // ===== LOGIN CHANGES (Phase 9) =====
    // "Forgot PIN?" — employee-initiated PIN Reset Request. Replaces
    // the old flow where an Admin just picked a new PIN and told the
    // employee what it was.
    const forgotPinBtn = document.getElementById("forgotPinBtn");
    if (forgotPinBtn) {
        forgotPinBtn.onclick = requestPinReset;
    }

    // permission-elevated employees (not A000) can hop into the Admin
    // Panel and back without logging out
    const backBtn = document.getElementById("backToDashboardBtn");
    if (backBtn) {
        backBtn.onclick = () => {
            if (RelayDesk.currentUser === "A000") return; // A000 has no dashboard to return to
            showScreen("dashboardScreen");
            backBtn.classList.add("hidden");
        };
    }

    // resume an existing session (if any) instead of showing the login
    // screen — the user stays signed in across refreshes until they
    // press Logout
    restoreSession();
}

const SESSION_KEY = "relaydesk_session_user";


// ===========================================
// SESSION PERSISTENCE (STAY LOGGED IN)
// ===========================================

function saveSession(code) {
    // Settings feature: General > "Remember Login". When disabled, never
    // persist a session — every launch starts back at the login screen.
    if (window.ESMSettings?.get("rememberLogin") === false) return;

    try {
        localStorage.setItem(SESSION_KEY, code);
    } catch (e) {
        console.warn("Could not persist session:", e);
    }
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
}

// Exposed so settings.js can clear an already-remembered login the moment
// the toggle is switched off, without needing to know the storage key.
window.clearRememberedLogin = clearSession;

// Only the Logout button should ever call this — it clears the saved
// session AND reloads, dropping back to the login screen.
window.relayLogout = function () {
    clearSession();
    location.reload();
};

// Settings feature: General > "Remember Login". If the toggle is off when
// the app is actually closing (not just minimized/hidden to tray — see
// main.js's close handling), make sure no session gets left behind even
// if it was saved during an earlier session while the toggle was on.
window.addEventListener("beforeunload", () => {
    if (window.ESMSettings?.get("rememberLogin") === false) {
        clearSession();
    }
});

async function restoreSession() {

    // Settings feature: General > "Remember Login". Disabled means never
    // auto-restore, and purge any stale saved session while we're at it.
    if (window.ESMSettings?.get("rememberLogin") === false) {
        clearSession();
        return;
    }

    let savedCode;

    try {
        savedCode = localStorage.getItem(SESSION_KEY);
    } catch (e) {
        savedCode = null;
    }

    if (!savedCode) return;

    try {

        const doc = await db.collection("users").doc(savedCode).get();

        if (!doc.exists) {
            clearSession();
            return;
        }

        console.log("🔁 Resuming session for", savedCode);

        currentUser = savedCode;
        RelayDesk.currentUser = savedCode;
        RelayDesk.shiftEnded = false;

        startSession();

        if (savedCode !== "A000") {
            bootWorkspace();
            if (window.startLoadsListener) startLoadsListener();
            updateTimersDisplay(RelayDesk.timers);
        }

    } catch (err) {
        console.error("Session restore failed:", err);
    }
}

// ===========================================
// LOGIN HANDLER
// ===========================================

async function login() {

    const code = $("codeInput")?.value?.trim().toUpperCase();
    const pin = $("pinInput")?.value?.trim();

    if (!code) {
        showMessage("Enter code", "#ffb347");
        return;
    }

    const ref = db.collection("users").doc(code);
    const doc = await ref.get();

    // ===== LOGIN CHANGES (Phase 9) =====
    // Employee self-signup is removed — an unrecognized code no longer
    // silently creates an account. Only A000 (or a user A000 has
    // promoted to Owner) can create employee accounts now, via the
    // Admin Panel's "Add Employee" form (see canCreateEmployeeAccounts
    // in permissions.js).
    //
    // A000 itself is exempted from this as a fresh-install safety net:
    // if its doc is somehow missing, it bootstraps itself as Owner so
    // the app is never left with no way in. Every real deployment
    // already has this doc, so in practice this branch doesn't fire.
    if (!doc.exists) {

        if (code !== "A000") {
            showMessage("Account not found. Ask an Admin to create your employee account.", "#ff6464");
            return;
        }

        await ref.set({
            pin: null,
            status: "Off Duty",
            work: 0,
            breakT: 0,
            away: 0,
            lastSwitchTime: Date.now(),
            lastChange: Date.now(),
            adminStatus: "Not Authorized",
            role: "Not Set",
            // ===== PERMISSION SYSTEM =====
            permissionLevel: "Owner",
            permissions: {}
        });
    }

    const user = (await ref.get()).data();

    RelayDesk.currentUserRole = "Not Set";

    // FIRST TIME PIN SET
    // (also covers a PIN Reset Request: the Admin blanks the PIN, and
    // the employee lands back in this same branch to set a new one —
    // pinWasReset just changes which message is shown while they do)
    //
    // NOTE: this checks specifically for null/undefined, NOT just
    // falsy — an intentionally-blank PIN/password is stored as the
    // empty string "" (see the pin-set branch below and the wrong-PIN
    // check further down), so it must NOT fall into this "never set
    // up yet" branch or the employee would be stuck re-setting it
    // forever.
    if (user.pin === null || user.pin === undefined) {

        // ===== FIRST LOGIN WIZARD (Phase 10) =====
        // A genuinely brand-new account (never had a PIN, never had
        // one reset) gets the full Welcome -> Theme -> Language ->
        // Notifications -> Set PIN -> Done wizard instead of the plain
        // inline PIN prompt below. A PIN reset (pinWasReset === true)
        // is an existing employee and stays on the simple prompt.
        if (!user.pinWasReset) {
            window.startFirstLoginWizard?.(code);
            return;
        }

        // Any PIN/password is accepted now, any length — a 4-digit PIN,
        // a longer password, whatever the employee prefers. Leaving it
        // blank is also allowed on purpose: it's saved as "" (an
        // intentionally-empty PIN), and future logins for this account
        // skip the PIN/password check entirely (see the wrong-PIN
        // check below).
        await ref.update({
            pin,
            pinWasReset: false,
            pinResetRequested: false,
            pinResetRequestedAt: null
        });

        // Confirms the reset actually took effect. A small inline message
        // isn't reliable here — the screen switches to the dashboard right
        // after this — so a blocking popup is used instead, and it's shown
        // BEFORE that switch so it's guaranteed to be seen.
        alert(
            pin
                ? "🔒 Your PIN/Password was reset by an admin. What you just entered has been saved as your new PIN/Password."
                : "🔒 Your PIN/Password was reset by an admin and left blank. You can log in with just your employee code from now on — enter a new PIN/Password on the login screen anytime you want to set one."
        );

        currentUser = code;
        RelayDesk.currentUser = code;
        RelayDesk.currentUserRole = null;
        RelayDesk.shiftEnded = false;

        saveSession(code);

        await startSession();
        try {
            await window.NotificationManager?.requestPermission();
        } catch (err) {
            console.warn("Notification permission setup failed:", err);
        }

        // This point is only reached for a PIN Reset (pinWasReset was
        // true) — a brand-new account never gets here, it's routed to
        // the First Login Wizard above instead. An existing employee
        // resetting their PIN just lands straight on their normal
        // dashboard, same as any other successful login.
        return;
    }

    // WRONG PIN/PASSWORD
    // (skipped entirely for accounts with an intentionally-blank PIN —
    // user.pin === "" — those log in with just their employee code)
    if (user.pin !== "" && pin !== user.pin) {
        showMessage("Wrong PIN/Password", "#ff6464");
        return;
    }

    // SUCCESS LOGIN
    currentUser = code;
    RelayDesk.currentUser = code;

    saveSession(code);

    await startSession();
    bootWorkspace();
    startLoadsListener();
    updateTimersDisplay(RelayDesk.timers);

    try {
        await window.NotificationManager?.requestPermission();
    } catch (err) {
        console.warn("Notification permission setup failed:", err);
    }
}


// ===========================================
// PIN RESET REQUEST (Phase 9)
// ===========================================
// Employee-initiated — there's no PIN to check pre-login, so this
// just flags the request on the employee's own doc. It shows up as a
// badge on their card in the Admin Panel; the Admin then blanks the
// PIN (resetUserPin in admin.js), and the employee sets a new one
// themselves the next time they log in (see the !user.pin branch in
// login() above).
async function requestPinReset() {

    const code = $("codeInput")?.value?.trim().toUpperCase();

    if (!code) {
        showMessage("Enter your code first", "#ffb347");
        return;
    }

    const ref = db.collection("users").doc(code);
    const doc = await ref.get();

    if (!doc.exists) {
        showMessage("Account not found. Ask an Admin to create your employee account.", "#ff6464");
        return;
    }

    await ref.update({
        pinResetRequested: true,
        pinResetRequestedAt: Date.now()
    });

    showMessage("PIN reset requested. An Admin will reset it shortly.", "#8fd3ff");
}


// ===========================================
// ADMIN PANEL ACCESS BUTTON
// ===========================================
// Pulled out into its own function so it can be called (a) as early
// as possible in startSession — before anything riskier gets a
// chance to throw and skip it — and (b) again from the live user-doc
// listener whenever an admin changes this user's permissions while
// they're already logged in.

function applyAdminPanelButtonVisibility() {

    const adminPanelBtn = document.getElementById("adminPanelAccessBtn");
    if (!adminPanelBtn) return;

    const allowed =
        RelayDesk.currentUser === "A000" ||
        !!RelayDesk.currentUserPermissions?.canAccessAdminPanel;

    if (allowed) {

        adminPanelBtn.classList.remove("hidden");

        adminPanelBtn.onclick = () => {
            showScreen("adminScreen");
            initializeAdmin();
            initAuditSystem();

            const backBtn = document.getElementById("backToDashboardBtn");
            if (backBtn) backBtn.classList.remove("hidden");
        };

    } else {
        adminPanelBtn.classList.add("hidden");
    }
}


// ===========================================
// SESSION START
// ===========================================

async function startSession() {

    console.log("✅ Session start:", window.RelayDesk.currentUser);

    showMessage("");

    if (window.RelayDesk.currentUser === "A000") {
        RelayDesk.currentUserPermissions = window.getUserPermissions({}, "A000");
        showScreen("adminScreen");
        initializeAdmin();
        initAuditSystem();
        return;
    }

    const doc = await db.collection("users").doc(RelayDesk.currentUser).get();
    const data = doc.exists ? doc.data() : {};

    // ===== PERMISSION SYSTEM =====
    // resolve this user's effective permissions (level preset +
    // any individual overrides an admin has granted them)
    RelayDesk.currentUserPermissions = window.getUserPermissions(data, RelayDesk.currentUser);
    RelayDesk.currentUserData = data;

    // STEP 5 — resolve+cache this employee's shift right away, so the
    // dashboard/countdown code that runs later in this same function
    // (and everything after) can read RelayDesk.currentUserShift
    // synchronously instead of waiting on a Firestore round-trip.
    resolveCurrentUserShift();

    // ===== ADMIN PANEL ACCESS BUTTON =====
    // Applied FIRST, right after permissions are known — deliberately
    // ahead of updateStatusDisplay/updateTimersDisplay/showScreen and
    // any other DOM/data-dependent calls below. This function used to
    // do this toggle last; if anything earlier in startSession threw
    // (a missing element, an unexpected data shape, etc.) the whole
    // async function stopped and this code — sitting at the bottom —
    // would silently never run, leaving an authorized user's Admin
    // Panel button stuck hidden with no error shown anywhere. Doing it
    // up front means a permitted user always sees the button even if
    // something else on the dashboard has a problem.
    applyAdminPanelButtonVisibility();

    // Developer Panel access — plain allow-list check (see devpanel.js),
    // deliberately independent of the permissions system since it's not
    // a work-permission. Same "do it early" reasoning as above.
    window.applyDevPanelButtonVisibility?.();

    // ======================
    // LIVE USER STATE SYNC
    // ======================

    db.collection("users")
        .doc(RelayDesk.currentUser)
        .onSnapshot(doc => {

            const u = doc.data();
            if (!u) return;

            RelayDesk.currentUserData = u;

            // keep permissions (and the admin button) in sync if an
            // admin changes this user's access while they're already
            // logged in, instead of requiring a re-login/refresh
            RelayDesk.currentUserPermissions = window.getUserPermissions(u, RelayDesk.currentUser);
            applyAdminPanelButtonVisibility();
        });

    RelayDesk.currentUserRole = data.role || "Not Set";

    RelayDesk.currentStatus = data.status || "Off Duty";
    RelayDesk.lastSwitchTime = data.lastSwitchTime || Date.now();

    RelayDesk.timers = {
        work: data.work || 0,
        break: data.breakT || 0,
        away: data.away || 0
    };

    RelayDesk.shiftStart = data.shiftStart || null;
    RelayDesk.shiftEndTime = data.shiftEndTime || null;
    RelayDesk.shiftEnded = false;

    // The rest of session start touches a bunch of other subsystems
    // (timers UI, screen switching, welcome label). None of that
    // should be able to take down the parts of startSession that
    // already ran above (permissions + admin button), so it's wrapped
    // defensively — a failure here logs instead of aborting silently.
    try {

        updateStatusDisplay(RelayDesk.currentStatus);
        updateTimersDisplay(RelayDesk.timers);

        showScreen("dashboardScreen");

    } catch (err) {
        console.error("startSession: dashboard display setup failed:", err);
    }

    try {
        const userLabel = document.getElementById("userLabel");
        if (userLabel) {
            userLabel.textContent = "Welcome Back, " + window.RelayDesk.currentUser;
        }
    } catch (err) {
        console.error("startSession: userLabel update failed:", err);
    }

    bindStatusButtons();
    initializePresence();
    bootWorkspace();
}


