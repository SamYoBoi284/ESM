// ===========================================
// RelayDesk
// disputes.js
// "Explain a Delay" — lets an employee send the admin a reason for
// a late clock-in or an extended-away alert (traffic, emergency, etc.)
//
// Also houses "Request Off-Day Change" — the employee-facing side of
// the off-day approval flow (see the OFF-DAY CHANGE REQUESTS block
// below). It lives in this file because it's the same shape as the
// dispute flow above: employee submits something, it sits pending,
// admin approves/denies.
// ===========================================
//
// Stored directly on the user doc so the Alerts panel can show it
// right alongside the relevant alert:
//   users/{code}.lateDispute -> { date, reason, time }
//   users/{code}.awayDispute -> { date, reason, time }
//
// Off-day change requests, by contrast, live in their own top-level
// collection (offDayChangeRequests) rather than a field on the user
// doc — modeled after the existing "overtimeRequests" collection in
// admin-extras.js. weeklyOffDays only actually changes on approval,
// so it needs a real record with its own id, not a single field that
// gets clobbered by the next request.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    // Phase 11, batch 4: toast/alert strings via shared I18N.
    if (window.I18N) {
        window.I18N.register("disputes", {
            en: {
                explanationSent: "📨 Explanation sent to admin",
                explanationSendFailed: "Failed to send explanation.",
                enterReason: "Please enter a reason.",
                offDayRequestSent: "🗓️ Off-day change request sent to admin",
                offDayRequestFailed: "Failed to send request.",
                offDayLoadFailed: "Couldn't load your current off days — try again.",
                offDaySameSchedule: "That's already your current off-day schedule — pick something different."
            },
            ar: {
                explanationSent: "📨 تم إرسال التوضيح إلى المشرف",
                explanationSendFailed: "فشل إرسال التوضيح.",
                enterReason: "يرجى إدخال سبب.",
                offDayRequestSent: "🗓️ تم إرسال طلب تغيير يوم الإجازة إلى المشرف",
                offDayRequestFailed: "فشل إرسال الطلب.",
                offDayLoadFailed: "تعذر تحميل أيام إجازتك الحالية — يرجى المحاولة مرة أخرى.",
                offDaySameSchedule: "هذا هو جدول يوم إجازتك الحالي بالفعل — اختر شيئًا مختلفًا."
            }
        });
    }

    let initialized = false;

    window.initializeDisputes = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeDisputes, 300);
            return;
        }

        if (initialized) return;
        initialized = true;

        const btn = document.getElementById("reportDelayBtn");
        const modal = document.getElementById("delayReportModal");
        const typeSelect = document.getElementById("delayReportType");
        const reasonInput = document.getElementById("delayReportReason");
        const sendBtn = document.getElementById("delayReportSendBtn");
        const cancelBtn = document.getElementById("delayReportCancelBtn");

        if (btn && modal) {

            btn.onclick = () => {
                if (reasonInput) reasonInput.value = "";
                modal.classList.remove("hidden");
                modal.style.display = "flex";
            };

            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    modal.classList.add("hidden");
                    modal.remove();
                };
            }

            if (sendBtn) {
                sendBtn.onclick = async () => {

                    const type = typeSelect?.value || "late";
                    const reason = (reasonInput?.value || "").trim();

                    if (!reason) {
                        alert(window.I18N ? window.I18N.t("disputes.enterReason") : "Please enter a reason.");
                        return;
                    }

                    const field = type === "away" ? "awayDispute"
                        : type === "break" ? "breakDispute"
                        : "lateDispute";
                    const today = new Date().toISOString().split("T")[0];

                    try {

                        await db.collection("users").doc(RelayDesk.currentUser).set({
                            [field]: {
                                date: today,
                                reason,
                                time: Date.now(),
                                status: "pending"
                            }
                        }, { merge: true });

                        if (typeof logAudit === "function") {
                            await logAudit(
                                RelayDesk.currentUser,
                                type === "away" ? "AWAY_DISPUTE"
                                    : type === "break" ? "BREAK_DISPUTE"
                                    : "LATE_DISPUTE",
                                reason
                            );
                        }

                        modal.classList.add("hidden");
                        modal.style.display = "none";

                        if (typeof window.NotificationManager === "object") {
                            window.NotificationManager.notify(window.I18N ? window.I18N.t("disputes.explanationSent") : "📨 Explanation sent to admin", "info", { category: "alerts" });
                        } else if (typeof window.showToast === "function") {
                            window.showToast(window.I18N ? window.I18N.t("disputes.explanationSent") : "📨 Explanation sent to admin", "info");
                        }

                    } catch (err) {
                        console.error("Dispute send failed:", err);
                        alert(window.I18N ? window.I18N.t("disputes.explanationSendFailed") : "Failed to send explanation.");
                    }
                };
            }

            console.log("📨 Dispute reporting module ready");
        }

        bindOffDayRequestUI();
    };

    // ===========================================
    // OFF-DAY CHANGE REQUESTS
    // Employee side: view current off days, pick new ones, optionally
    // explain why, and send it off as "pending". weeklyOffDays itself
    // is untouched until an admin approves it (admin-extras.js).
    // ===========================================

    function bindOffDayRequestUI() {

        const btn = document.getElementById("requestOffDayBtn");
        const modal = document.getElementById("offDayRequestModal");
        const grid = document.getElementById("offDayRequestGrid");
        const reasonInput = document.getElementById("offDayRequestReason");
        const sendBtn = document.getElementById("offDayRequestSendBtn");
        const cancelBtn = document.getElementById("offDayRequestCancelBtn");
        const statusEl = document.getElementById("offDayRequestStatus");

        if (!btn || !modal || !grid) return;

        // keep the button + status line in sync with whether this
        // employee already has a pending request, live — no need to
        // refresh the page to see it clear once an admin decides
        db.collection("offDayChangeRequests")
            .where("user", "==", RelayDesk.currentUser)
            .where("status", "==", "pending")
            .onSnapshot(snapshot => {

                const pending = !snapshot.empty;

                btn.disabled = pending;
                btn.style.opacity = pending ? "0.5" : "1";
                btn.style.cursor = pending ? "not-allowed" : "pointer";

                if (statusEl) {
                    if (pending) {
                        statusEl.textContent = "🗓️ Off-day change request pending admin approval";
                        statusEl.classList.remove("hidden");
                    } else {
                        statusEl.classList.add("hidden");
                    }
                }
            }, err => console.error("Off-day request status listener failed:", err));

        btn.onclick = async () => {

            if (btn.disabled) return;

            try {

                const doc = await db.collection("users").doc(RelayDesk.currentUser).get();
                const currentOffDays = doc.exists ? (doc.data().weeklyOffDays || []) : [];

                // stashed on the grid so Send can diff against it without
                // a second read
                grid.dataset.currentOffDays = JSON.stringify(currentOffDays);
                window.renderOffDayCheckboxes?.(grid, currentOffDays);

                if (reasonInput) reasonInput.value = "";

                modal.classList.remove("hidden");
                modal.style.display = "flex";

            } catch (err) {
                console.error("Failed to load current off days:", err);
                alert(window.I18N ? window.I18N.t("disputes.offDayLoadFailed") : "Couldn't load your current off days — try again.");
            }
        };

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.add("hidden");
                modal.style.display = "none";
            };
        }

        if (sendBtn) {
            sendBtn.onclick = async () => {

                const requestedOffDays = window.readOffDayCheckboxes?.(grid) || [];
                const currentOffDays = JSON.parse(grid.dataset.currentOffDays || "[]");
                const reason = (reasonInput?.value || "").trim();

                const sameAsCurrent =
                    requestedOffDays.length === currentOffDays.length &&
                    requestedOffDays.every(d => currentOffDays.includes(d));

                if (sameAsCurrent) {
                    alert(window.I18N ? window.I18N.t("disputes.offDaySameSchedule") : "That's already your current off-day schedule — pick something different.");
                    return;
                }

                try {

                    await db.collection("offDayChangeRequests").add({
                        user: RelayDesk.currentUser,
                        currentOffDays,
                        requestedOffDays,
                        reason,
                        time: Date.now(),
                        status: "pending"
                    });

                    if (typeof logAudit === "function") {
                        await logAudit(
                            RelayDesk.currentUser,
                            "OFFDAY_CHANGE_REQUESTED",
                            `${currentOffDays.join(", ") || "none"} -> ${requestedOffDays.join(", ") || "none"}`
                        );
                    }

                    modal.classList.add("hidden");
                    modal.style.display = "none";

                    if (typeof window.NotificationManager === "object") {
                        window.NotificationManager.notify(window.I18N ? window.I18N.t("disputes.offDayRequestSent") : "🗓️ Off-day change request sent to admin", "info", { category: "offday" });
                    } else if (typeof window.showToast === "function") {
                        window.showToast(window.I18N ? window.I18N.t("disputes.offDayRequestSent") : "🗓️ Off-day change request sent to admin", "info");
                    }

                } catch (err) {
                    console.error("Off-day change request failed:", err);
                    alert(window.I18N ? window.I18N.t("disputes.offDayRequestFailed") : "Failed to send request.");
                }
            };
        }

        console.log("🗓️ Off-day change request module ready");
    }

})();
