// ===========================================
// RelayDesk V5
// reports.js
// Report Generator (Daily / Weekly / Monthly)
// Employees, Loads, Attendance, Late %, Away %,
// Audit Summary, Top Performers — export PDF/CSV
// ===========================================

let reportsInitialized = false;
let lastGeneratedReport = null; // cached so Export buttons don't re-query

function initReportGenerator() {

    if (reportsInitialized) return;
    reportsInitialized = true;

    const section = document.getElementById("reportGeneratorSection");
    const periodSelect = document.getElementById("reportPeriodSelect");
    const dateInput = document.getElementById("reportDateInput");
    const generateBtn = document.getElementById("reportGenerateBtn");
    const closeBtn = document.getElementById("reportModalCloseBtn");
    const pdfBtn = document.getElementById("reportExportPdfBtn");
    const csvBtn = document.getElementById("reportExportCsvBtn");

    if (!generateBtn) return;

    // ===== PERMISSION SYSTEM =====
    // same gate as the Statistics card — anyone who can view stats
    // can generate/preview a report; exporting is gated separately
    // below (canExportHistory), same as the existing export buttons
    if (section) {
        section.classList.toggle("hidden", !window.hasPermission?.("canViewStatistics"));
    }

    // default the date picker to today
    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }

    generateBtn.onclick = async () => {

        if (!window.hasPermission?.("canViewStatistics")) {
            alert("You don't have permission to generate reports.");
            return;
        }

        const period = periodSelect?.value || "daily";
        const anchor = dateInput?.value
            ? new Date(dateInput.value + "T00:00:00")
            : new Date();

        const original = generateBtn.textContent;
        generateBtn.disabled = true;
        generateBtn.textContent = "⏳ Generating...";

        try {

            const report = await buildReport(period, anchor);
            lastGeneratedReport = report;

            renderReportModal(report);
            openReportModal();

            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "REPORT_GENERATED", report.label);
            }

        } catch (err) {
            console.error("Report generation failed:", err);
            alert("Failed to generate report. See console for details.");
        }

        generateBtn.textContent = original;
        generateBtn.disabled = false;
    };

    if (closeBtn) {
        closeBtn.onclick = closeReportModal;
    }

    if (pdfBtn) {
        pdfBtn.onclick = () => exportReportPdf(lastGeneratedReport);
    }

    if (csvBtn) {
        csvBtn.onclick = () => exportReportCsv(lastGeneratedReport);
    }

    console.log("📊 Report Generator ready");
}

// piggyback on the same admin-ready poll admin-extras.js uses, so the
// DOM exists and permissions are resolved before we bind to anything
window.addEventListener("DOMContentLoaded", () => {
    const check = setInterval(() => {
        if (window.hasAdminAccess?.()) {
            initReportGenerator();
            clearInterval(check);
        }
    }, 400);
});


// ===========================================
// SCHEDULED SHIFT START TIMES (for lateness calc)
// STEP 5 CUTOVER: reads the new Shift Management system's single
// source of truth (shiftmanagement.js — window.getEmployeeAssignedShift
// / window.getShiftExpectedStartEpoch) instead of the old shifts.js
// window.SHIFT_CYCLES / window.getExpectedShiftStart, so report
// lateness respects each employee's own configured shift (any
// start/end/timezone, not just the 3 old fixed US/SY cycles).
// ===========================================


// ===========================================
// PERIOD RANGE CALCULATION
// ===========================================

function getPeriodRange(period, anchorDate) {

    const start = new Date(anchorDate);
    start.setHours(0, 0, 0, 0);

    let end;
    let label;

    if (period === "weekly") {

        // calendar week, Sunday -> Saturday, containing the anchor date
        const day = start.getDay(); // 0 = Sunday
        start.setDate(start.getDate() - day);

        end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        label = `Weekly Report (${start.toLocaleDateString()} – ${end.toLocaleDateString()})`;

    } else if (period === "monthly") {

        start.setDate(1);

        end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        label = `Monthly Report (${start.toLocaleString(undefined, { month: "long", year: "numeric" })})`;

    } else {

        // daily
        end = new Date(start);
        end.setHours(23, 59, 59, 999);

        label = `Daily Report (${start.toLocaleDateString()})`;
    }

    return { start: start.getTime(), end: end.getTime(), label, period };
}


// ===========================================
// BUILD REPORT (pulls + aggregates Firestore data)
// ===========================================

async function buildReport(period, anchorDate) {

    const { start, end, label } = getPeriodRange(period, anchorDate);

    // ----- EMPLOYEES -----
    const usersSnap = await db.collection("users").get();

    const employees = [];
    usersSnap.forEach(doc => {
        if (doc.id === "A000") return; // admin isn't a reportable employee
        employees.push({ id: doc.id, ...doc.data() });
    });

    const perUser = {};
    employees.forEach(e => {
        perUser[e.id] = {
            id: e.id,
            role: e.role || "Not Set",
            permissionLevel: e.permissionLevel || "Employee",
            shifts: 0,
            lateShifts: 0,
            work: 0,
            breakT: 0,
            away: 0,
            loads: 0
        };
    });

    // ----- SHIFT HISTORY (within period) -----
    const shiftSnap = await db.collection("shiftHistory").get();

    shiftSnap.forEach(doc => {

        const s = doc.data();
        if (!s.startTime || s.startTime < start || s.startTime > end) return;

        const bucket = perUser[s.user];
        if (!bucket) return; // shift belongs to a deleted/unknown user

        bucket.shifts += 1;
        bucket.work += s.work || 0;
        bucket.breakT += s.breakT || s.break || 0;
        bucket.away += s.away || 0;
        bucket.loads += s.metrics?.bookedLoads || 0;

        // Lateness: compare actual clock-in to the scheduled start for
        // whichever shift this employee is CURRENTLY assigned (new
        // Shift Management system). This is a best-effort signal —
        // historical shift assignment per-day isn't tracked, so a
        // recent reassignment can skew past shifts.
        const resolvedShift = window.getEmployeeAssignedShift?.(s.user);

        if (resolvedShift && resolvedShift.enabled !== false) {

            const scheduled = window.getShiftExpectedStartEpoch(resolvedShift, s.startTime);
            const minutesLate = (s.startTime - scheduled) / 60000;

            if (minutesLate > (window.LATE_GRACE_MINUTES || 10)) {
                bucket.lateShifts += 1;
            }
        }
    });

    // ----- AUDIT SUMMARY (within period) -----
    let auditSummary = [];
    let totalAuditEvents = 0;

    try {

        const auditSnap = await db.collection("auditLogs")
            .where("time", ">=", start)
            .where("time", "<=", end)
            .get();

        const actionCounts = {};

        auditSnap.forEach(doc => {
            const l = doc.data();
            totalAuditEvents += 1;
            const action = l.action || "Unknown";
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });

        auditSummary = Object.entries(actionCounts)
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count);

    } catch (err) {
        console.error("Audit summary fetch failed:", err);
    }

    // ----- TOTALS + TOP PERFORMERS -----
    const rows = Object.values(perUser);

    let totalLoads = 0, totalShifts = 0, totalLateShifts = 0;
    let totalWork = 0, totalBreak = 0, totalAway = 0;

    let topLoads = null;
    let topWork = null;
    let bestAttendance = null; // lowest late % among employees who had shifts

    rows.forEach(r => {

        totalLoads += r.loads;
        totalShifts += r.shifts;
        totalLateShifts += r.lateShifts;
        totalWork += r.work;
        totalBreak += r.breakT;
        totalAway += r.away;

        r.latePercent = r.shifts ? (r.lateShifts / r.shifts) * 100 : 0;
        r.awayPercent = (r.work + r.breakT + r.away)
            ? (r.away / (r.work + r.breakT + r.away)) * 100
            : 0;

        if (r.shifts === 0) return; // no activity this period — skip for "top" awards

        if (!topLoads || r.loads > topLoads.loads) topLoads = r;
        if (!topWork || r.work > topWork.work) topWork = r;
        if (!bestAttendance || r.latePercent < bestAttendance.latePercent) bestAttendance = r;
    });

    const overallLatePercent = totalShifts ? (totalLateShifts / totalShifts) * 100 : 0;
    const overallAwayPercent = (totalWork + totalBreak + totalAway)
        ? (totalAway / (totalWork + totalBreak + totalAway)) * 100
        : 0;

    return {
        period,
        label,
        range: { start, end },
        generatedAt: Date.now(),
        generatedBy: RelayDesk.currentUser,
        employees: rows.sort((a, b) => b.loads - a.loads),
        totals: {
            employeeCount: employees.length,
            totalLoads,
            totalShifts,
            overallLatePercent,
            overallAwayPercent
        },
        auditSummary,
        totalAuditEvents,
        topPerformers: { topLoads, topWork, bestAttendance }
    };
}


// ===========================================
// RENDER REPORT PREVIEW
// ===========================================

function renderReportModal(report) {

    const box = document.getElementById("reportGeneratorContent");
    if (!box) return;

    const titleEl = document.getElementById("reportModalTitle");
    if (titleEl) titleEl.textContent = "📊 " + report.label;

    const t = report.totals;
    const tp = report.topPerformers;

    box.innerHTML = `

        <div class="reportMeta">
            Generated ${new Date(report.generatedAt).toLocaleString()} by ${report.generatedBy}
        </div>

        <div class="reportSummaryGrid">
            <div class="reportSummaryCard"><b>${t.employeeCount}</b><span>Employees</span></div>
            <div class="reportSummaryCard"><b>${t.totalShifts}</b><span>Attendance (Shifts)</span></div>
            <div class="reportSummaryCard"><b>${t.totalLoads}</b><span>Loads Booked</span></div>
            <div class="reportSummaryCard"><b>${t.overallLatePercent.toFixed(1)}%</b><span>Late %</span></div>
            <div class="reportSummaryCard"><b>${t.overallAwayPercent.toFixed(1)}%</b><span>Away %</span></div>
        </div>

        <h4 class="reportSectionTitle">🏆 Top Performers</h4>
        <div class="reportTopGrid">
            <div>Most Loads: <b>${tp.topLoads ? `${tp.topLoads.id} (${tp.topLoads.loads})` : "—"}</b></div>
            <div>Most Work Time: <b>${tp.topWork ? `${tp.topWork.id} (${formatTime(tp.topWork.work)})` : "—"}</b></div>
            <div>Best Attendance: <b>${tp.bestAttendance ? `${tp.bestAttendance.id} (${tp.bestAttendance.latePercent.toFixed(1)}% late)` : "—"}</b></div>
        </div>

        <h4 class="reportSectionTitle">👤 Employees</h4>
        <div class="reportTableWrap">
            <table class="reportTable">
                <thead>
                    <tr>
                        <th>Employee</th><th>Role</th><th>Shifts</th><th>Work</th>
                        <th>Break</th><th>Away</th><th>Loads</th><th>Late %</th><th>Away %</th>
                    </tr>
                </thead>
                <tbody>
                    ${report.employees.length ? report.employees.map(e => `
                        <tr>
                            <td>${e.id}</td>
                            <td>${e.role}</td>
                            <td>${e.shifts}</td>
                            <td>${formatTime(e.work)}</td>
                            <td>${formatTime(e.breakT)}</td>
                            <td>${formatTime(e.away)}</td>
                            <td>${e.loads}</td>
                            <td>${e.latePercent.toFixed(1)}%</td>
                            <td>${e.awayPercent.toFixed(1)}%</td>
                        </tr>
                    `).join("") : `<tr><td colspan="9" class="workspaceEmpty">No shift activity in this period</td></tr>`}
                </tbody>
            </table>
        </div>

        <h4 class="reportSectionTitle">📜 Audit Summary (${report.totalAuditEvents})</h4>
        <div class="reportTableWrap">
            ${report.auditSummary.length ? `
                <table class="reportTable">
                    <thead><tr><th>Action</th><th>Count</th></tr></thead>
                    <tbody>
                        ${report.auditSummary.slice(0, 10).map(a => `
                            <tr><td>${a.action}</td><td>${a.count}</td></tr>
                        `).join("")}
                    </tbody>
                </table>
            ` : `<div class="workspaceEmpty">No audit activity in this period</div>`}
        </div>
    `;
}

function openReportModal() {
    document.getElementById("reportGeneratorModal")?.classList.remove("hidden");
}

function closeReportModal() {
    document.getElementById("reportGeneratorModal")?.classList.add("hidden");
}

window.closeReportModal = closeReportModal;


// ===========================================
// EXPORT: CSV
// ===========================================

function exportReportCsv(report) {

    if (!report) {
        alert("Generate a report first.");
        return;
    }

    if (!window.hasPermission?.("canExportHistory")) {
        alert("You don't have permission to export reports.");
        return;
    }

    const t = report.totals;
    const tp = report.topPerformers;

    let csv = `RelayDesk Report,${report.label}\n`;
    csv += `Generated,${new Date(report.generatedAt).toLocaleString()},By,${report.generatedBy}\n\n`;

    csv += `SUMMARY\n`;
    csv += `Employees,${t.employeeCount}\n`;
    csv += `Total Shifts (Attendance),${t.totalShifts}\n`;
    csv += `Total Loads,${t.totalLoads}\n`;
    csv += `Late %,${t.overallLatePercent.toFixed(1)}%\n`;
    csv += `Away %,${t.overallAwayPercent.toFixed(1)}%\n\n`;

    csv += `TOP PERFORMERS\n`;
    csv += `Most Loads,${tp.topLoads ? `${tp.topLoads.id} (${tp.topLoads.loads})` : "-"}\n`;
    csv += `Most Work Time,${tp.topWork ? `${tp.topWork.id} (${formatTime(tp.topWork.work)})` : "-"}\n`;
    csv += `Best Attendance,${tp.bestAttendance ? `${tp.bestAttendance.id} (${tp.bestAttendance.latePercent.toFixed(1)}% late)` : "-"}\n\n`;

    csv += `EMPLOYEES\n`;
    csv += `Employee,Role,Shifts,Work,Break,Away,Loads,Late %,Away %\n`;

    report.employees.forEach(e => {
        csv += `${e.id},${e.role},${e.shifts},${formatTime(e.work)},${formatTime(e.breakT)},${formatTime(e.away)},${e.loads},${e.latePercent.toFixed(1)}%,${e.awayPercent.toFixed(1)}%\n`;
    });

    csv += `\nAUDIT SUMMARY (${report.totalAuditEvents} events)\n`;
    csv += `Action,Count\n`;
    report.auditSummary.forEach(a => {
        csv += `${a.action},${a.count}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `relaydesk-report-${report.period}-${Date.now()}.csv`;
    a.click();

    URL.revokeObjectURL(url);

    if (typeof logAudit === "function") {
        logAudit(RelayDesk.currentUser, "REPORT_EXPORT_CSV", report.label);
    }
}


// ===========================================
// EXPORT: PDF (jsPDF)
// ===========================================

function exportReportPdf(report) {

    if (!report) {
        alert("Generate a report first.");
        return;
    }

    if (!window.hasPermission?.("canExportHistory")) {
        alert("You don't have permission to export reports.");
        return;
    }

    if (!window.jspdf?.jsPDF) {
        alert("PDF library not loaded. Check your connection and try again.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const t = report.totals;
    const tp = report.topPerformers;

    let y = 15;
    const lineGap = 7;
    const pageHeight = doc.internal.pageSize.getHeight();

    function line(text, size = 11, bold = false) {
        if (y > pageHeight - 15) {
            doc.addPage();
            y = 15;
        }
        doc.setFontSize(size);
        doc.setFont(undefined, bold ? "bold" : "normal");
        doc.text(String(text), 14, y);
        y += lineGap;
    }

    line("RelayDesk Report", 16, true);
    line(report.label, 12, true);
    line(`Generated ${new Date(report.generatedAt).toLocaleString()} by ${report.generatedBy}`, 9);
    y += 3;

    line("Summary", 13, true);
    line(`Employees: ${t.employeeCount}`);
    line(`Total Shifts (Attendance): ${t.totalShifts}`);
    line(`Total Loads: ${t.totalLoads}`);
    line(`Late %: ${t.overallLatePercent.toFixed(1)}%`);
    line(`Away %: ${t.overallAwayPercent.toFixed(1)}%`);
    y += 3;

    line("Top Performers", 13, true);
    line(`Most Loads: ${tp.topLoads ? `${tp.topLoads.id} (${tp.topLoads.loads})` : "-"}`);
    line(`Most Work Time: ${tp.topWork ? `${tp.topWork.id} (${formatTime(tp.topWork.work)})` : "-"}`);
    line(`Best Attendance: ${tp.bestAttendance ? `${tp.bestAttendance.id} (${tp.bestAttendance.latePercent.toFixed(1)}% late)` : "-"}`);
    y += 3;

    line("Employees", 13, true);
    if (!report.employees.length) {
        line("No shift activity in this period.");
    } else {
        report.employees.forEach(e => {
            line(
                `${e.id} — Shifts: ${e.shifts} | Work: ${formatTime(e.work)} | Break: ${formatTime(e.breakT)} | Away: ${formatTime(e.away)} | Loads: ${e.loads} | Late: ${e.latePercent.toFixed(1)}% | Away: ${e.awayPercent.toFixed(1)}%`,
                9
            );
        });
    }
    y += 3;

    line(`Audit Summary (${report.totalAuditEvents} events)`, 13, true);
    if (!report.auditSummary.length) {
        line("No audit activity in this period.");
    } else {
        report.auditSummary.slice(0, 20).forEach(a => {
            line(`${a.action}: ${a.count}`, 10);
        });
    }

    doc.save(`relaydesk-report-${report.period}-${Date.now()}.pdf`);

    if (typeof logAudit === "function") {
        logAudit(RelayDesk.currentUser, "REPORT_EXPORT_PDF", report.label);
    }
}
