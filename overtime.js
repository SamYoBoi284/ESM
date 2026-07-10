// ===========================================
// RelayDesk
// overtime.js
// Employee "Request Overtime" button + reason box
// ===========================================
//
// Firestore shape:
//   overtimeRequests/{id} -> { user, reason, time, date, shiftId,
//                              status: "pending"|"approved"|"denied"|"completed",
//                              durationMs (set once completed) }
//
// Flow: employee types a reason and clicks "Request Overtime" ->
// request saved as "pending" -> admin Approves/Denies it in the
// Alerts panel -> if approved, status.js logs the actual overtime
// duration to the user's overtimeHistory when they press End Shift.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    // Phase 11, batch 4: toast/alert strings via shared I18N.
    if (window.I18N) {
        window.I18N.register("overtime", {
            en: {
                enterReason: "Please enter a reason for the overtime request first.",
                requestSent: "📨 Overtime request sent to admin",
                requestFailed: "Failed to send overtime request."
            },
            ar: {
                enterReason: "يرجى إدخال سبب لطلب العمل الإضافي أولاً.",
                requestSent: "📨 تم إرسال طلب العمل الإضافي إلى المشرف",
                requestFailed: "فشل إرسال طلب العمل الإضافي."
            }
        });
    }

    let initialized = false;

    window.initializeOvertime = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeOvertime, 300);
            return;
        }

        if (initialized) return;
        initialized = true;

        const btn = document.getElementById("requestOvertimeBtn");
        const reasonBox = document.getElementById("overtimeReasonInput");

        if (!btn) return;

        btn.onclick = async () => {

            const reason = (reasonBox?.value || "").trim();

            if (!reason) {
                alert(window.I18N ? window.I18N.t("overtime.enterReason") : "Please enter a reason for the overtime request first.");
                reasonBox?.focus();
                return;
            }

            try {

                await db.collection("overtimeRequests").add({
                    user: RelayDesk.currentUser,
                    reason,
                    time: Date.now(),
                    date: new Date().toISOString().split("T")[0],
                    shiftId: RelayDesk.shiftId || null,
                    status: "pending"
                });

                if (reasonBox) reasonBox.value = "";

                if (typeof window.NotificationManager === "object") {
                    window.NotificationManager.notify(window.I18N ? window.I18N.t("overtime.requestSent") : "📨 Overtime request sent to admin", "info", { category: "overtime" });
                } else if (typeof window.showToast === "function") {
                    window.showToast(window.I18N ? window.I18N.t("overtime.requestSent") : "📨 Overtime request sent to admin", "info");
                }

            } catch (err) {
                console.error("Overtime request failed:", err);
                alert(window.I18N ? window.I18N.t("overtime.requestFailed") : "Failed to send overtime request.");
            }
        };

        console.log("🕐 Overtime request module ready");
    };

})();
