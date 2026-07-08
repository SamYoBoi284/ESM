// ===========================================
// RelayDesk / ESM
// firstlogin.js — First Login Wizard (Phase 10)
// ===========================================
//
// Shown once, the very first time a brand-new employee logs in (their
// account was pre-created by A000/Owner with a blank PIN — Phase 9
// removed self-signup). Walks them through:
//   Welcome -> Theme -> Language -> Notification Preferences -> Set PIN -> Done
//
// This is deliberately SEPARATE from the PIN Reset Request path
// (Phase 9's pinWasReset flow) — a PIN reset is an existing employee
// and still just gets the plain "set a new PIN" prompt on the login
// screen, not this wizard. auth.js decides which path to take.
//
// Theme + notification choices are applied live via window.ESMSettings
// (same storage/apply path as the real Settings screen), so by the
// time the wizard finishes those preferences are already in effect.
// Language is a preference only for now — saved on the user's own
// Firestore doc as `preferredLanguage`, not yet applied to anything,
// since the language system itself is Phase 11.

(function () {

    const STEPS = ["welcome", "theme", "language", "notifications", "pin", "done"];
    let stepIndex = 0;
    let wizardCode = null;
    let chosenLanguage = "en";

    function $w(id) {
        return document.getElementById(id);
    }

    function showStep(name) {
        STEPS.forEach(s => {
            const el = $w("wizardStep_" + s);
            if (el) el.classList.toggle("hidden", s !== name);
        });

        const progress = $w("wizardProgress");
        if (progress) {
            const humanIndex = STEPS.indexOf(name) + 1;
            progress.textContent = `Step ${humanIndex} of ${STEPS.length}`;
        }
    }

    function goTo(name) {
        stepIndex = STEPS.indexOf(name);
        showStep(name);
    }

    function next() {
        goTo(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
    }

    // ===========================================
    // STEP: THEME
    // ===========================================

    function bindThemeStep() {
        const buttons = document.querySelectorAll("#wizardStep_theme .wizardThemeOption");
        buttons.forEach(btn => {
            btn.onclick = () => {
                buttons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                window.ESMSettings?.set("theme", btn.dataset.theme);
            };
        });
    }

    // ===========================================
    // STEP: LANGUAGE (placeholder — real i18n is Phase 11)
    // ===========================================

    function bindLanguageStep() {
        const buttons = document.querySelectorAll("#wizardStep_language .wizardLangOption");
        buttons.forEach(btn => {
            btn.onclick = () => {
                buttons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                chosenLanguage = btn.dataset.lang;
            };
        });
    }

    // ===========================================
    // STEP: NOTIFICATIONS
    // ===========================================

    function bindNotificationsStep() {
        const desktopToggle = $w("wizardNotifDesktop");
        const soundToggle = $w("wizardNotifSound");

        if (desktopToggle) {
            desktopToggle.onchange = () => {
                window.ESMSettings?.set("enableDesktopNotifications", desktopToggle.checked);
            };
        }

        if (soundToggle) {
            soundToggle.onchange = () => {
                window.ESMSettings?.set("enableNotificationSounds", soundToggle.checked);
            };
        }
    }

    // ===========================================
    // STEP: SET PIN
    // ===========================================

    function bindPinStep() {
        const pinInput = $w("wizardPinInput");
        const confirmInput = $w("wizardPinConfirmInput");
        const msg = $w("wizardPinMsg");
        const submitBtn = $w("wizardPinSubmitBtn");

        if (!submitBtn) return;

        submitBtn.onclick = async () => {

            const pin = (pinInput?.value || "").trim();
            const confirmPin = (confirmInput?.value || "").trim();

            if (!/^\d{4}$/.test(pin)) {
                if (msg) { msg.textContent = "PIN must be exactly 4 digits."; msg.style.color = "#ff6464"; }
                return;
            }

            if (pin !== confirmPin) {
                if (msg) { msg.textContent = "PINs don't match."; msg.style.color = "#ff6464"; }
                return;
            }

            try {
                await db.collection("users").doc(wizardCode).update({
                    pin,
                    preferredLanguage: chosenLanguage,
                    pinWasReset: false,
                    pinResetRequested: false,
                    pinResetRequestedAt: null
                });
            } catch (err) {
                console.error("First Login Wizard: failed to save PIN:", err);
                if (msg) { msg.textContent = "Something went wrong saving your PIN. Try again."; msg.style.color = "#ff6464"; }
                return;
            }

            if (msg) msg.textContent = "";
            goTo("done");
        };
    }

    // ===========================================
    // STEP: DONE
    // ===========================================

    function bindDoneStep() {
        const finishBtn = $w("wizardFinishBtn");
        if (!finishBtn) return;

        finishBtn.onclick = async () => {

            currentUser = wizardCode;
            RelayDesk.currentUser = wizardCode;
            RelayDesk.currentUserRole = null;
            RelayDesk.shiftEnded = false;

            saveSession(wizardCode);

            await startSession();

            try {
                await window.NotificationManager?.requestPermission();
            } catch (err) {
                console.warn("Notification permission setup failed:", err);
            }

            wizardCode = null;
        };
    }

    // ===========================================
    // NEXT/BACK NAV BUTTONS (Welcome/Theme/Language/Notifications
    // all just have a plain "Continue" — pin + done have their own
    // dedicated buttons bound above since they do real work)
    // ===========================================

    function bindContinueButtons() {
        document.querySelectorAll("#wizardScreen .wizardContinueBtn").forEach(btn => {
            btn.onclick = next;
        });
    }

    // ===========================================
    // ENTRY POINT — called from auth.js login() the moment a
    // brand-new account (blank PIN, never reset) is detected.
    // ===========================================

    window.startFirstLoginWizard = function (code) {

        wizardCode = code;
        chosenLanguage = "en";
        stepIndex = 0;

        bindThemeStep();
        bindLanguageStep();
        bindNotificationsStep();
        bindPinStep();
        bindDoneStep();
        bindContinueButtons();

        // reset any leftover input from a previous wizard run this session
        const pinInput = $w("wizardPinInput");
        const confirmInput = $w("wizardPinConfirmInput");
        const msg = $w("wizardPinMsg");
        if (pinInput) pinInput.value = "";
        if (confirmInput) confirmInput.value = "";
        if (msg) msg.textContent = "";

        showScreen("wizardScreen");
        goTo("welcome");
    };

})();
