// ===========================================
// RelayDesk
// violations.js (NEW FILE)
// Admin-only permanent log of every Approve/Deny decision made on a
// Late Clock-in / Extended Away / Extended Break alert (see
// admin-extras.js's resolveAdminAlert and shifts.js's scanForAlerts).
// "Dismiss" never creates an entry here — dismissing an alert clears
// it from the Alerts panel with no trace, by design.
// ===========================================
//
// LIVE FEED (admin panel)
// ------------------------
// A "⚠️ Violations Log" section shows the most recent decisions,
// grouped by employee — mirrors audit.js's loadAuditLogs().
//
// MONTHLY ARCHIVE (permanent record)
// -----------------------------------
// Same lazy/self-healing pattern as monthlystats.js: there's no
// backend cron in this stack, so the first client to boot after a
// month closes does the archive write into violationsArchive/{YYYY-MM}.
// Admins browse past months and download each as a PDF or Excel
// (.xlsx) file from the Admin Panel.
//
// AUTO-EXPORT (the night before month-end) + GITHUB FALLBACK
// ------------------------------------------------------------
// During the last 24 hours of the month, whichever admin/dev client
// happens to be logged in automatically triggers a PDF + Excel
// download of that month's violations so far (once per month, tracked
// in system/violationsAutoExportState — guarded by a transaction so
// multiple open sessions don't each trigger their own download).
// If nobody was logged in during that window, the archive job falls
// back — for developer accounts only (window.DEVELOPER_ACCOUNTS) — to
// pushing the finalized month to a separate GitHub repo, same opt-in
// pattern as MonthlyStatsGithubBackup in monthlystats.js.
//
// ⚠️ SECURITY NOTE (also shown in the Admin Panel UI): the GitHub
// token is stored in Firestore, same caveat as monthlystats.js's
// backup — use a fine-grained, repo-scoped token, and lock down
// firestore.rules before relying on this for anything sensitive.
// ===========================================


// ===========================================
// MONTH MATH (self-contained — doesn't depend on monthlystats.js's
// load order)
// ===========================================

function pad2VL(n) {
    return String(n).padStart(2, "0");
}

function getMonthInfoVL(refDate = new Date()) {

    const y = refDate.getUTCFullYear();
    const m = refDate.getUTCMonth(); // 0-11

    const key = `${y}-${pad2VL(m + 1)}`;
    const label = new Date(Date.UTC(y, m, 1))
        .toLocaleString("default", { month: "long", timeZone: "UTC" }) + ` ${y}`;

    const startMs = Date.UTC(y, m, 1, 0, 0, 0, 0);
    const endMs = Date.UTC(y, m + 1, 1, 0, 0, 0, 0); // exclusive

    return { year: y, month: m, key, label, startMs, endMs };
}

function prevMonthInfoVL(info) {
    return getMonthInfoVL(new Date(info.startMs - 86400000));
}


// ===========================================
// SMALL HELPERS
// ===========================================

const VIOLATION_TYPE_LABELS = {
    late: "Late Clock-in",
    away: "Extended Away",
    break: "Extended Break"
};

function escapeVL(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function blankViolationTotals() {
    return {
        approved: 0, denied: 0,
        byType: {
            late: { approved: 0, denied: 0 },
            away: { approved: 0, denied: 0 },
            break: { approved: 0, denied: 0 }
        }
    };
}


// ===========================================
// LOGGING (called from admin-extras.js's resolveAdminAlert)
// ===========================================
// Only "approved"/"denied" ever land here — "dismissed" is
// intentionally never logged, per spec.

window.logViolationEntry = async function (userId, type, decision, detail) {

    if (decision !== "approved" && decision !== "denied") return;
    if (!VIOLATION_TYPE_LABELS[type]) return;

    try {
        await db.collection("violationLogs").add({
            user: userId,
            type,
            decision,
            detail: detail || "",
            month: getMonthInfoVL().key,
            by: window.RelayDesk?.currentUser || "A000",
            time: Date.now()
        });
    } catch (err) {
        console.error("Violations Log: failed to write entry:", err);
    }
};


// ===========================================
// AGGREGATION (shared by the live feed and the archive job)
// ===========================================

function aggregateViolationDocs(docs) {

    const perEmployee = {};
    const entries = [];
    let totalApproved = 0;
    let totalDenied = 0;

    docs.forEach(doc => {

        const v = doc.data();
        entries.push(v);

        if (!perEmployee[v.user]) {
            perEmployee[v.user] = blankViolationTotals();
        }

        const e = perEmployee[v.user];

        if (v.decision === "approved" || v.decision === "denied") {
            e[v.decision] += 1;
            if (e.byType[v.type]) e.byType[v.type][v.decision] += 1;
        }

        if (v.decision === "approved") totalApproved++;
        else if (v.decision === "denied") totalDenied++;
    });

    entries.sort((a, b) => (b.time || 0) - (a.time || 0));

    return { perEmployee, entries, totalApproved, totalDenied };
}

async function aggregateViolationsMonthOnce(info) {
    const snap = await db.collection("violationLogs")
        .where("month", "==", info.key)
        .get();

    return aggregateViolationDocs(snap.docs);
}


// ===========================================
// LIVE FEED (admin panel — most recent decisions, grouped by employee)
// ===========================================

let violationsFeedUnsub = null;

function attachViolationsFeed() {

    const box = document.getElementById("violationsLog");
    if (!box) return;

    if (violationsFeedUnsub) {
        violationsFeedUnsub();
        violationsFeedUnsub = null;
    }

    violationsFeedUnsub = db.collection("violationLogs")
        .orderBy("time", "desc")
        .limit(50)
        .onSnapshot(snapshot => {

            if (snapshot.empty) {
                box.innerHTML = `<div class="workspaceEmpty">No violations logged yet.</div>`;
                return;
            }

            const grouped = {};

            snapshot.forEach(doc => {
                const v = doc.data();
                if (!grouped[v.user]) grouped[v.user] = [];
                grouped[v.user].push(v);
            });

            box.innerHTML = "";

            Object.keys(grouped).forEach(user => {

                const container = document.createElement("div");
                container.className = "auditGroup";

                const details = grouped[user].map(v => {

                    const time = new Date(v.time).toLocaleString();
                    const badge = v.decision === "approved" ? "✅ Approved (excused)" : "❌ Denied";

                    return `
                        <div class="auditItem">
                            <b>${escapeVL(VIOLATION_TYPE_LABELS[v.type] || v.type)}</b>
                            <small>${escapeVL(v.detail)}</small>
                            <small>${badge} — by ${escapeVL(v.by)}</small>
                            <small>${time}</small>
                        </div>
                    `;
                }).join("");

                container.innerHTML = `
                    <div class="auditHeader" onclick="this.nextElementSibling.classList.toggle('open')">
                        👤 ${escapeVL(user)} ▼
                    </div>
                    <div class="auditDropdown">${details}</div>
                `;

                box.appendChild(container);
            });

        }, err => console.error("Violations Log: feed listener failed:", err));
}


// ===========================================
// MONTHLY ARCHIVE (admin-facing, permanent)
// ===========================================
// Lazy/self-healing archive, same reasoning as monthlystats.js: no
// Cloud Functions exist in this stack, so the first client to boot
// after a month has ended does the archive write.

async function maybeArchiveViolationsMonth(info) {
    try {

        const ref = db.collection("violationsArchive").doc(info.key);
        const existing = await ref.get();
        if (existing.exists) return; // already archived — common case, cheap bail-out

        // Phase 7, item 10: date-sensitive protection — same hook as
        // monthlystats.js's maybeArchiveMonth. Never blocks the archive
        // itself if the export fails.
        if (window.DevDataExport?.enabled) {
            window.DevDataExport.runFullExport("pre-violations-archive").catch(err => {
                console.warn("Violations Log: pre-archive data export failed (archive itself still proceeds):", err);
            });
        }

        const result = await aggregateViolationsMonthOnce(info);

        const payload = {
            month: info.key,
            monthLabel: info.label,
            entries: result.entries,
            perEmployee: result.perEmployee,
            totalApproved: result.totalApproved,
            totalDenied: result.totalDenied,
            archivedAt: Date.now(),
            archivedBy: window.RelayDesk?.currentUser || "system-auto",
            finalized: true
        };

        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (doc.exists) return; // someone else's write already landed first
            tx.set(ref, payload);
        });

        console.log(`⚠️ Violations Log: archived ${info.label}`);

        // GitHub push is only a FALLBACK — skip it if the "night
        // before" auto-download already covered this month for someone.
        const stateDoc = await db.collection("system").doc("violationsAutoExportState").get();
        const alreadyAutoExported = stateDoc.exists && stateDoc.data().lastAutoExportMonth === info.key;

        if (!alreadyAutoExported && window.ViolationsGithubBackup?.enabled) {
            window.ViolationsGithubBackup.upload(payload).catch(err => {
                console.warn("Violations Log: GitHub fallback backup failed (archive itself still succeeded):", err);
            });
        }

    } catch (err) {
        console.error("Violations Log: failed to archive", info.key, err);
    }
}


// ===========================================
// AUTO-EXPORT ("the night before" month-end)
// ===========================================
// Best-effort, client-side: whichever admin/dev has the Admin Panel
// open during the last 24 hours of the month triggers a PDF + Excel
// download of the month so far. A Firestore transaction makes sure
// only one open session actually claims it, even if several admins
// are online at once.

async function maybeAutoExportCurrentMonth(info) {
    try {

        const ref = db.collection("system").doc("violationsAutoExportState");
        const existing = await ref.get();
        if (existing.exists && existing.data().lastAutoExportMonth === info.key) return;

        let wonTheRace = false;

        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (doc.exists && doc.data().lastAutoExportMonth === info.key) return;
            tx.set(ref, {
                lastAutoExportMonth: info.key,
                lastAutoExportAt: Date.now(),
                lastAutoExportBy: window.RelayDesk?.currentUser || "system-auto"
            }, { merge: true });
            wonTheRace = true;
        });

        if (!wonTheRace) return; // another open session already claimed this month

        const result = await aggregateViolationsMonthOnce(info);

        const payload = {
            month: info.key,
            monthLabel: info.label,
            entries: result.entries,
            perEmployee: result.perEmployee,
            totalApproved: result.totalApproved,
            totalDenied: result.totalDenied,
            archivedAt: Date.now(),
            archivedBy: window.RelayDesk?.currentUser || "system-auto",
            finalized: false // the month isn't actually over yet
        };

        downloadViolationsPdf(payload);
        downloadViolationsXlsx(payload);

        console.log(`⚠️ Violations Log: auto-exported ${info.label} the night before month-end`);

    } catch (err) {
        console.error("Violations Log: auto-export failed:", err);
    }
}


// ===========================================
// PERIODIC SCHEDULE CHECK (rollover archive + pre-month-end export)
// ===========================================

let violationsCurrentMonthKey = null;

function checkViolationsSchedule() {

    const nowInfo = getMonthInfoVL();

    // Last 24 hours of the month — the "night before" window.
    const msUntilMonthEnd = nowInfo.endMs - Date.now();
    if (msUntilMonthEnd > 0 && msUntilMonthEnd <= 24 * 60 * 60 * 1000) {
        maybeAutoExportCurrentMonth(nowInfo);
    }

    if (!violationsCurrentMonthKey) {
        violationsCurrentMonthKey = nowInfo.key;
        return;
    }

    if (nowInfo.key !== violationsCurrentMonthKey) {
        console.log("📅 Violations Log: month rolled over ->", nowInfo.label);
        maybeArchiveViolationsMonth(prevMonthInfoVL(nowInfo));
        violationsCurrentMonthKey = nowInfo.key;
    }
}


// ===========================================
// BOOTSTRAP (called from app.js bootWorkspace())
// ===========================================
// Admin/dev-only background job — gated the same way as the
// Violations Log section itself (canViewStatistics).

window.initializeViolationsLog = function () {

    window.RelayDesk = window.RelayDesk || {};
    if (RelayDesk._violationsLogInitialized) return;
    if (!window.hasPermission?.("canViewStatistics")) return;

    RelayDesk._violationsLogInitialized = true;

    // Covers the case where nobody was logged in exactly when last
    // month ended.
    maybeArchiveViolationsMonth(prevMonthInfoVL(getMonthInfoVL()));

    violationsCurrentMonthKey = getMonthInfoVL().key;
    checkViolationsSchedule();
    setInterval(checkViolationsSchedule, 5 * 60 * 1000);
};


// ===========================================
// EXPORT: PDF (jsPDF) — mirrors reports.js's exportReportPdf pattern
// ===========================================

function downloadViolationsPdf(data) {

    if (!window.jspdf?.jsPDF) {
        alert("PDF library not loaded. Check your connection and try again.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

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

    line("RelayDesk Violations Log", 16, true);
    line(data.monthLabel, 12, true);
    line(`Archived ${new Date(data.archivedAt).toLocaleString()} by ${data.archivedBy}`, 9);
    y += 3;

    line("Summary", 13, true);
    line(`Total Approved (excused): ${data.totalApproved}`);
    line(`Total Denied: ${data.totalDenied}`);
    y += 3;

    line("Per Employee", 13, true);
    const ids = Object.keys(data.perEmployee || {});
    if (!ids.length) {
        line("No violations this month.");
    } else {
        ids.forEach(id => {
            const e = data.perEmployee[id];
            line(
                `${id} — Approved: ${e.approved} | Denied: ${e.denied}  ` +
                `(Late A:${e.byType.late.approved}/D:${e.byType.late.denied}  ` +
                `Away A:${e.byType.away.approved}/D:${e.byType.away.denied}  ` +
                `Break A:${e.byType.break.approved}/D:${e.byType.break.denied})`,
                9
            );
        });
    }
    y += 3;

    line(`All Entries (${data.entries.length})`, 13, true);
    if (!data.entries.length) {
        line("None.");
    } else {
        data.entries.forEach(v => {
            const badge = v.decision === "approved" ? "Approved" : "Denied";
            line(
                `${new Date(v.time).toLocaleString()} — ${v.user} — ${VIOLATION_TYPE_LABELS[v.type] || v.type} — ${badge} — ${v.detail || ""} — by ${v.by}`,
                8
            );
        });
    }

    doc.save(`relaydesk-violations-${data.month}.pdf`);
}


// ===========================================
// EXPORT: Excel (.xlsx, via SheetJS — window.XLSX)
// ===========================================

function downloadViolationsXlsx(data) {

    if (!window.XLSX) {
        alert("Excel library not loaded. Check your connection and try again.");
        return;
    }

    const summaryRows = [
        ["RelayDesk Violations Log", data.monthLabel],
        ["Archived", new Date(data.archivedAt).toLocaleString(), "By", data.archivedBy],
        [],
        ["Total Approved (excused)", data.totalApproved],
        ["Total Denied", data.totalDenied],
        [],
        ["Employee", "Approved", "Denied", "Late (A/D)", "Away (A/D)", "Break (A/D)"]
    ];

    Object.keys(data.perEmployee || {}).forEach(id => {
        const e = data.perEmployee[id];
        summaryRows.push([
            id, e.approved, e.denied,
            `${e.byType.late.approved}/${e.byType.late.denied}`,
            `${e.byType.away.approved}/${e.byType.away.denied}`,
            `${e.byType.break.approved}/${e.byType.break.denied}`
        ]);
    });

    const entriesRows = [
        ["Date/Time", "Employee", "Type", "Decision", "Detail", "Resolved By"]
    ];

    (data.entries || []).forEach(v => {
        entriesRows.push([
            new Date(v.time).toLocaleString(),
            v.user,
            VIOLATION_TYPE_LABELS[v.type] || v.type,
            v.decision === "approved" ? "Approved (excused)" : "Denied",
            v.detail || "",
            v.by
        ]);
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(entriesRows), "All Entries");

    XLSX.writeFile(wb, `relaydesk-violations-${data.month}.xlsx`);
}

window.downloadViolationsPdf = downloadViolationsPdf;
window.downloadViolationsXlsx = downloadViolationsXlsx;


// ===========================================
// OPTIONAL ENHANCEMENT: GitHub fallback backup
// (Developer accounts only — window.DEVELOPER_ACCOUNTS, devpanel.js)
// ===========================================
// Disabled by default. Only ever used as a FALLBACK for a month that
// nobody's session was open to auto-export the night before it ended
// (see maybeArchiveViolationsMonth above). Failing to upload never
// blocks the archive itself.

window.ViolationsGithubBackup = {
    enabled: false,
    repo: "",
    path: "violation-reports",
    token: ""
};

async function loadViolationsGithubConfig() {
    try {
        const doc = await db.collection("system").doc("violationsConfig").get();
        const cfg = doc.exists ? doc.data() : {};
        window.ViolationsGithubBackup.enabled = !!cfg.githubBackupEnabled;
        window.ViolationsGithubBackup.repo = cfg.githubRepo || "";
        window.ViolationsGithubBackup.path = cfg.githubPath || "violation-reports";
        window.ViolationsGithubBackup.token = cfg.githubToken || "";
    } catch (err) {
        console.warn("Violations Log: could not load GitHub backup config:", err);
    }
}

window.ViolationsGithubBackup.upload = async function (monthData) {

    const cfg = window.ViolationsGithubBackup;
    if (!cfg.enabled || !cfg.repo || !cfg.token) return;

    const path = `${cfg.path.replace(/\/$/, "")}/${monthData.month}.json`;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(monthData, null, 2))));

    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
        method: "PUT",
        headers: {
            "Authorization": `token ${cfg.token}`,
            "Accept": "application/vnd.github+json"
        },
        body: JSON.stringify({
            message: `RelayDesk violations report: ${monthData.monthLabel}`,
            content
        })
    });

    if (!res.ok) {
        throw new Error(`GitHub upload failed: ${res.status} ${await res.text()}`);
    }

    console.log(`☁️ Violations Log: backed up ${monthData.month} to GitHub`);
};

function initViolationsGithubControls() {

    const box = document.getElementById("violationsArchiveGithubBox");
    if (!box) return;

    const isDeveloper = (window.DEVELOPER_ACCOUNTS || []).includes(window.RelayDesk?.currentUser);

    if (!isDeveloper) {
        box.classList.add("hidden");
        return;
    }

    box.classList.remove("hidden");

    const enabledCk = document.getElementById("violationsGithubBackupEnabled");
    const repoInput = document.getElementById("violationsGithubBackupRepo");
    const pathInput = document.getElementById("violationsGithubBackupPath");
    const tokenInput = document.getElementById("violationsGithubBackupToken");
    const saveBtn = document.getElementById("violationsGithubBackupSaveBtn");

    loadViolationsGithubConfig().then(() => {
        if (enabledCk) enabledCk.checked = window.ViolationsGithubBackup.enabled;
        if (repoInput) repoInput.value = window.ViolationsGithubBackup.repo;
        if (pathInput) pathInput.value = window.ViolationsGithubBackup.path;
    });

    saveBtn?.addEventListener("click", async () => {

        const cfg = {
            githubBackupEnabled: !!enabledCk?.checked,
            githubRepo: repoInput?.value.trim() || "",
            githubPath: pathInput?.value.trim() || "violation-reports",
            githubToken: tokenInput?.value.trim() || window.ViolationsGithubBackup.token
        };

        await db.collection("system").doc("violationsConfig").set(cfg, { merge: true });
        await loadViolationsGithubConfig();

        if (tokenInput) tokenInput.value = "";
        alert("GitHub backup settings saved.");
    });
}


// ===========================================
// ADMIN PANEL: LIVE FEED + MONTHLY ARCHIVE VIEWER + EXPORT
// ===========================================

window.initViolationsAdmin = function () {

    window.RelayDesk = window.RelayDesk || {};
    if (RelayDesk._violationsAdminInitialized) return;
    RelayDesk._violationsAdminInitialized = true;

    const section = document.getElementById("violationsSection");
    if (section) {
        section.classList.toggle("hidden", !window.hasPermission?.("canViewStatistics"));
    }

    attachViolationsFeed();

    const select = document.getElementById("violationsArchiveSelect");
    const viewBox = document.getElementById("violationsArchiveView");
    const pdfBtn = document.getElementById("violationsArchivePdfBtn");
    const xlsxBtn = document.getElementById("violationsArchiveXlsxBtn");
    const refreshBtn = document.getElementById("violationsArchiveRefreshBtn");

    let currentArchiveDoc = null;

    function renderSelected(data) {

        currentArchiveDoc = data;
        if (!viewBox) return;

        if (!data) {
            viewBox.innerHTML = `<div class="workspaceEmpty">No archived months yet.</div>`;
            return;
        }

        const rows = Object.keys(data.perEmployee || {})
            .map(id => ({ id, ...data.perEmployee[id] }))
            .sort((a, b) => b.denied - a.denied);

        viewBox.innerHTML = `
            <div class="monthlyStatsSummary">
                <div class="timerCard">
                    <h3>✅ Approved</h3>
                    <span>${data.totalApproved}</span>
                </div>
                <div class="timerCard">
                    <h3>❌ Denied</h3>
                    <span>${data.totalDenied}</span>
                </div>
            </div>
            <div class="monthlyStatsPerEmployee">
                ${rows.map(r => `
                    <div class="monthlyStatRow">
                        <b>${escapeVL(r.id)}</b>
                        <span>Approved: ${r.approved}</span>
                        <span>Denied: ${r.denied}</span>
                    </div>
                `).join("") || `<div class="workspaceEmpty">No violations that month.</div>`}
            </div>
        `;
    }

    async function loadArchiveList() {

        if (!select) return;
        select.innerHTML = `<option value="">Loading...</option>`;

        const snap = await db.collection("violationsArchive").orderBy("month", "desc").get();

        if (snap.empty) {
            select.innerHTML = `<option value="">No archived months yet</option>`;
            renderSelected(null);
            return;
        }

        select.innerHTML = snap.docs.map(doc => {
            const d = doc.data();
            return `<option value="${doc.id}">${escapeVL(d.monthLabel || doc.id)}</option>`;
        }).join("");

        renderSelected(snap.docs[0].data());
    }

    select?.addEventListener("change", async () => {
        if (!select.value) return;
        const doc = await db.collection("violationsArchive").doc(select.value).get();
        if (doc.exists) renderSelected(doc.data());
    });

    refreshBtn?.addEventListener("click", loadArchiveList);

    pdfBtn?.addEventListener("click", () => {
        if (!window.hasPermission?.("canExportHistory")) {
            alert("You don't have permission to export this.");
            return;
        }
        if (!currentArchiveDoc) return;
        downloadViolationsPdf(currentArchiveDoc);
    });

    xlsxBtn?.addEventListener("click", () => {
        if (!window.hasPermission?.("canExportHistory")) {
            alert("You don't have permission to export this.");
            return;
        }
        if (!currentArchiveDoc) return;
        downloadViolationsXlsx(currentArchiveDoc);
    });

    loadArchiveList();
    initViolationsGithubControls();
};
