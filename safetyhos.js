// ===========================================
// ESM Safety Dashboard — Driver HOS
// ===========================================
// Live per-driver HOS countdowns. This is an additive layer over the
// existing Safety Dashboard data; existing PTI/load/BOL/trailer/truck
// fields remain untouched.
//
// HOS model:
//   Shift = 14:00 default
//   DR    = 11:00 default
//   Break = 08:00 default
//
// "Confirm HOS" is the explicit start/confirmation point. The timestamp
// is stored with the driver entry so two drivers confirmed at different
// times keep independent timers. DR and Break only consume while their
// matching duty status is active; Shift is the continuous work-window
// timer after confirmation.

(function () {
    const DEFAULTS = {
        shiftMinutes: 14 * 60,
        driveMinutes: 11 * 60,
        breakMinutes: 8 * 60
    };

    let tickHandle = null;

    function normalizeMinutes(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return fallback;
        return Math.min(Math.round(n), 24 * 60);
    }

    function parseTime(value, fallback) {
        const text = String(value || "").trim();
        if (/^\d{1,2}:\d{2}$/.test(text)) {
            const [h, m] = text.split(":").map(Number);
            if (h >= 0 && h <= 24 && m >= 0 && m < 60 && !(h === 24 && m !== 0)) {
                return h * 60 + m;
            }
        }
        return fallback;
    }

    function formatTime(totalSeconds) {
        const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [h, m, s].map((v, i) => i === 0 ? String(v).padStart(2, "0") : String(v).padStart(2, "0")).join(":");
    }

    function minutesToInput(minutes) {
        const safe = Math.max(0, Math.round(Number(minutes) || 0));
        return String(Math.floor(safe / 60)).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0");
    }

    function defaultHOS() {
        return {
            status: "OFF",
            shiftRemaining: DEFAULTS.shiftMinutes * 60 * 1000,
            driveRemaining: DEFAULTS.driveMinutes * 60 * 1000,
            breakRemaining: DEFAULTS.breakMinutes * 60 * 1000,
            confirmedAt: 0,
            statusChangedAt: 0,
            updatedAt: 0,
            updatedBy: ""
        };
    }

    function normalize(raw) {
        const h = { ...defaultHOS(), ...(raw || {}) };
        h.status = ["OFF", "ON", "DR", "SB"].includes(h.status) ? h.status : "OFF";
        h.shiftRemaining = Math.max(0, Number(h.shiftRemaining) || DEFAULTS.shiftMinutes * 60000);
        h.driveRemaining = Math.max(0, Number(h.driveRemaining) || DEFAULTS.driveMinutes * 60000);
        h.breakRemaining = Math.max(0, Number(h.breakRemaining) || DEFAULTS.breakMinutes * 60000);
        h.confirmedAt = Number(h.confirmedAt) || 0;
        h.statusChangedAt = Number(h.statusChangedAt) || h.confirmedAt || 0;
        return h;
    }

    function calculate(raw, now = Date.now()) {
        const h = normalize(raw);
        if (!h.confirmedAt) return h;

        const sinceConfirm = Math.max(0, now - h.confirmedAt);
        h.shiftRemaining = Math.max(0, h.shiftRemaining - (sinceConfirm - Math.max(0, Number(raw?.shiftElapsedBeforeConfirm) || 0)));

        const sinceStatus = Math.max(0, now - (h.statusChangedAt || h.confirmedAt));
        if (h.status === "DR") {
            h.driveRemaining = Math.max(0, h.driveRemaining - sinceStatus);
        } else if (h.status === "SB") {
            h.breakRemaining = Math.max(0, h.breakRemaining - sinceStatus);
        }

        return h;
    }

    function calculateStored(raw, now = Date.now()) {
        const h = normalize(raw);
        if (!h.confirmedAt) return h;

        // Stored remaining values represent the last status transition.
        // Only the active status gets elapsed time subtracted.
        const elapsed = Math.max(0, now - (h.statusChangedAt || h.confirmedAt));

        // Shift is continuous from confirmation.
        const shiftElapsed = Math.max(0, now - h.confirmedAt);
        h.shiftRemaining = Math.max(0, h.shiftRemaining - (shiftElapsed - Math.max(0, Number(raw?.shiftElapsedAtSave) || 0)));

        if (h.status === "DR") {
            h.driveRemaining = Math.max(0, h.driveRemaining - elapsed);
        } else if (h.status === "SB") {
            h.breakRemaining = Math.max(0, h.breakRemaining - elapsed);
        }

        return h;
    }

    function statusLabel(status) {
        return ({
            OFF: "OFF",
            ON: "ON",
            DR: "DRIVING",
            SB: "SLEEPER / BREAK"
        })[status] || status;
    }

    function statusClass(status) {
        return String(status || "OFF").toLowerCase();
    }

    function urgency(ms) {
        if (ms <= 0) return "hosExpired";
        if (ms <= 60 * 60 * 1000) return "hosAttention";
        return "";
    }

    function renderSummary(container, raw) {
        if (!container) return;
        const h = calculateStored(raw);
        const confirmed = !!h.confirmedAt;

        container.innerHTML =
            '<div class="safetyHosStatusRow">' +
                '<span class="safetyHosStatus safetyHosStatus-' + statusClass(h.status) + '">' +
                    (confirmed ? escapeHtml(statusLabel(h.status)) : "NOT CONFIRMED") +
                '</span>' +
                '<button type="button" class="smallButton safetyHosEditBtn">⏱ HOS</button>' +
            '</div>' +
            '<div class="safetyHosTimers">' +
                '<div class="safetyHosTimer ' + urgency(h.shiftRemaining) + '"><span>Shift</span><strong>' + formatTime(h.shiftRemaining / 1000) + '</strong></div>' +
                '<div class="safetyHosTimer ' + urgency(h.driveRemaining) + '"><span>DR</span><strong>' + formatTime(h.driveRemaining / 1000) + '</strong></div>' +
                '<div class="safetyHosTimer ' + urgency(h.breakRemaining) + '"><span>Break</span><strong>' + formatTime(h.breakRemaining / 1000) + '</strong></div>' +
            '</div>' +
            '<div class="safetyHosMeta">' +
                (confirmed ? "Confirmed " + new Date(h.confirmedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Enter HOS values and confirm to start") +
            '</div>';
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function ensureModal() {
        if (document.getElementById("safetyHosModal")) return;

        document.body.insertAdjacentHTML("beforeend",
            '<div id="safetyHosModal" class="modal hidden">' +
                '<div class="modalBox safetyHosModalBox">' +
                    '<div class="safetyHosModalHeader">' +
                        '<div><h3 id="safetyHosModalTitle">Driver HOS</h3><p id="safetyHosModalSubtitle" class="subtitle">Set and confirm the driver\'s HOS timers.</p></div>' +
                        '<button type="button" class="modalCloseX" id="safetyHosCloseBtn">✕</button>' +
                    '</div>' +
                    '<div class="safetyHosStatusPicker">' +
                        '<label>Duty Status<select id="safetyHosStatus">' +
                            '<option value="OFF">OFF</option>' +
                            '<option value="ON">ON DUTY</option>' +
                            '<option value="DR">DRIVING</option>' +
                            '<option value="SB">SLEEPER / BREAK</option>' +
                        '</select></label>' +
                    '</div>' +
                    '<div class="safetyHosInputGrid">' +
                        '<label>Shift Remaining<input id="safetyHosShift" type="text" inputmode="numeric" placeholder="14:00"></label>' +
                        '<label>Driving Remaining<input id="safetyHosDrive" type="text" inputmode="numeric" placeholder="11:00"></label>' +
                        '<label>Break Remaining<input id="safetyHosBreak" type="text" inputmode="numeric" placeholder="08:00"></label>' +
                    '</div>' +
                    '<div class="safetyHosModalNote">Confirming starts a fresh timestamp for this driver. Drivers confirmed at different times keep independent countdowns.</div>' +
                    '<div class="safetyHosModalActions">' +
                        '<button type="button" class="smallButton" id="safetyHosCancelBtn">Cancel</button>' +
                        '<button type="button" id="safetyHosConfirmBtn">✓ Confirm HOS</button>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );

        document.getElementById("safetyHosCloseBtn")?.addEventListener("click", close);
        document.getElementById("safetyHosCancelBtn")?.addEventListener("click", close);
        document.getElementById("safetyHosModal")?.addEventListener("click", e => {
            if (e.target.id === "safetyHosModal") close();
        });
    }

    let active = null;

    function open(key, driver, raw, onConfirm) {
        if (!window.hasPermission?.("canManageEmployees") &&
            !String(window.RelayDesk?.currentUserData?.role || "").toLowerCase().includes("safety")) {
            alert("You don't have permission to manage Driver HOS.");
            return;
        }

        ensureModal();
        active = { key, driver, raw: normalize(raw), onConfirm };

        const h = calculateStored(active.raw);
        document.getElementById("safetyHosModalTitle").textContent = "⏱ HOS — " + driver;
        document.getElementById("safetyHosModalSubtitle").textContent = "Confirm the driver's current HOS values. Confirmation starts the timer.";
        const shiftInput = document.getElementById("safetyHosShift");
        const driveInput = document.getElementById("safetyHosDrive");
        const breakInput = document.getElementById("safetyHosBreak");

        document.getElementById("safetyHosStatus").value = h.status;
        shiftInput.value = minutesToInput(h.shiftRemaining / 60000);
        driveInput.value = minutesToInput(h.driveRemaining / 60000);
        breakInput.value = minutesToInput(h.breakRemaining / 60000);

        // Keep HOS editing independent from PTI. The HOS editor is always
        // available from the driver card, whether PTI is checked or not.
        [shiftInput, driveInput, breakInput].forEach(input => {
            input.classList.remove("safetyHosFieldShift", "safetyHosFieldDrive", "safetyHosFieldBreak", "safetyHosFieldUnconfirmed");
        });

        if (h.confirmedAt) {
            shiftInput.classList.add("safetyHosFieldShift");
            driveInput.classList.add("safetyHosFieldDrive");
            breakInput.classList.add("safetyHosFieldBreak");
        } else {
            [shiftInput, driveInput, breakInput].forEach(input => input.classList.add("safetyHosFieldUnconfirmed"));
        }

        document.getElementById("safetyHosModal").classList.remove("hidden");
        document.getElementById("safetyHosShift")?.focus();
    }

    function close() {
        active = null;
        document.getElementById("safetyHosModal")?.classList.add("hidden");
    }

    async function confirm() {
        if (!active) return;

        const shift = parseTime(document.getElementById("safetyHosShift")?.value, DEFAULTS.shiftMinutes);
        const drive = parseTime(document.getElementById("safetyHosDrive")?.value, DEFAULTS.driveMinutes);
        const brk = parseTime(document.getElementById("safetyHosBreak")?.value, DEFAULTS.breakMinutes);
        const status = document.getElementById("safetyHosStatus")?.value || "OFF";
        const now = Date.now();

        const patch = {
            status,
            shiftRemaining: shift * 60000,
            driveRemaining: drive * 60000,
            breakRemaining: brk * 60000,
            confirmedAt: now,
            statusChangedAt: now,
            updatedAt: now,
            updatedBy: window.RelayDesk?.currentUser || ""
        };

        try {
            await active.onConfirm(patch);
            close();
        } catch (err) {
            console.error("HOS confirmation failed:", err);
            alert(err?.message || "Failed to save HOS.");
        }
    }

    async function bindConfirm() {
        ensureModal();
        const btn = document.getElementById("safetyHosConfirmBtn");
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = "true";
            btn.addEventListener("click", confirm);
        }
    }

    function startTicker() {
        if (tickHandle) return;
        tickHandle = setInterval(() => {
            document.querySelectorAll(".safetyDriverCard").forEach(card => {
                const key = card.dataset.safetyKey;
                const raw = window.__SAFETY_ENTRIES__?.[key];
                if (!raw) return;
                renderSummary(card.querySelector(".safetyHos"), raw);
            });
        }, 1000);
    }

    window.SafetyHOS = {
        defaults: () => ({ ...DEFAULTS }),
        normalize,
        calculate: calculateStored,
        renderSummary,
        open,
        bind: bindConfirm,
        startTicker
    };

    document.addEventListener("DOMContentLoaded", () => {
        bindConfirm();
        startTicker();
    });
})();
