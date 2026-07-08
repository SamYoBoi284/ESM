// ===========================================
// RelayDesk
// myhistory.js
// Employee "My Past Shifts" view + personal CSV export
// ===========================================

(function () {

    let cachedShifts = [];
    let initialized = false;

    window.initializeMyHistory = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeMyHistory, 300);
            return;
        }

        if (initialized) return;
        initialized = true;

        const openBtn = document.getElementById("myHistoryBtn");
        const closeBtn = document.getElementById("myHistoryCloseBtn");
        const exportBtn = document.getElementById("myHistoryExportBtn");
        const modal = document.getElementById("myHistoryModal");

        if (openBtn) {
            openBtn.onclick = () => {
                modal?.classList.remove("hidden");
                loadMyShifts();
            };
        }

        if (closeBtn) {
            closeBtn.onclick = () => modal?.classList.add("hidden");
        }

        if (exportBtn) {
            exportBtn.onclick = exportMyShiftsCSV;
        }

        console.log("📅 My History module ready");
    };

    async function loadMyShifts() {

        const list = document.getElementById("myHistoryList");
        if (!list) return;

        list.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;

        try {

            const snap = await db.collection("shiftHistory")
                .where("user", "==", RelayDesk.currentUser)
                .get();

            cachedShifts = [];
            snap.forEach(doc => cachedShifts.push(doc.data()));

            // sort newest-first client-side (avoids needing a composite index)
            cachedShifts.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

            if (!cachedShifts.length) {
                list.innerHTML = `<div class="workspaceEmpty">No past shifts yet.</div>`;
                return;
            }

            list.innerHTML = cachedShifts.map(s => {

                const start = s.startTime ? new Date(s.startTime).toLocaleTimeString() : "N/A";
                const end = s.endTime ? new Date(s.endTime).toLocaleTimeString() : "Active";
                const duration = s.shiftDuration || "Active";
                const loads = s.metrics?.bookedLoads || 0;
                const late = s.metrics?.lateClockIn
                    ? `⚠️ Late (${s.metrics.minutesLate || 0} min)`
                    : "On time";

                const offDayLine = s.offDayShift
                    ? `<div class="offTodayBadge">📴 Off-Day Shift — Overtime: ${formatTime(s.overtimeMs || 0)}</div>`
                    : "";

                return `
                    <div class="shiftBlock">
                        <b>📅 ${s.date}</b><br>
                        Start: ${start} &nbsp; End: ${end}<br>
                        Duration: ${duration}<br>
                        Work: ${s.workTime || "--:--:--"} &nbsp;
                        Break: ${s.breakTime || "--:--:--"} &nbsp;
                        Away: ${s.awayTime || "--:--:--"}<br>
                        Loads Booked: ${loads}<br>
                        Clock-in: ${late}
                        ${offDayLine}
                        ${s.notes ? `<hr><div><b>📒 Notes:</b><br>${escapeHtml(s.notes)}</div>` : ""}
                    </div>
                `;
            }).join("");

        } catch (err) {
            console.error("Load my shift history failed:", err);
            list.innerHTML = `<div class="workspaceEmpty">Failed to load history.</div>`;
        }
    }

    function exportMyShiftsCSV() {

        if (!cachedShifts.length) {
            alert("No shift history to export yet.");
            return;
        }

        let csv = "Date,Start,End,Duration,Work,Break,Away,Loads,Clock-in,Off-Day Shift,Overtime\n";

        cachedShifts.forEach(s => {

            const start = s.startTime ? new Date(s.startTime).toLocaleTimeString() : "N/A";
            const end = s.endTime ? new Date(s.endTime).toLocaleTimeString() : "Active";
            const clockIn = s.metrics?.lateClockIn
                ? `Late (${s.metrics.minutesLate || 0} min)`
                : "On time";

            csv += [
                s.date,
                start,
                end,
                s.shiftDuration || "Active",
                s.workTime || "--:--:--",
                s.breakTime || "--:--:--",
                s.awayTime || "--:--:--",
                s.metrics?.bookedLoads || 0,
                clockIn,
                s.offDayShift ? "Yes" : "No",
                s.offDayShift ? formatTime(s.overtimeMs || 0) : "--:--:--"
            ].join(",") + "\n";
        });

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `${RelayDesk.currentUser}-timesheet-${Date.now()}.csv`;
        a.click();

        URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

})();
