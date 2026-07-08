// ===========================================
// RelayDesk
// monthlystats.js (NEW FILE)
// Company-wide Monthly Statistics (EVERY employee can see this —
// separate from the admin-only Statistics panel) + a permanent,
// admin-only monthly archive.
// ===========================================
//
// EMPLOYEE-FACING
// ---------------
// A "📊 Monthly Statistics" button next to "Today's Timers" pops out
// a draggable panel (same interaction pattern as the Today's Timers
// dropdown in timers.js) showing, for the CURRENT calendar month:
//   - Overall Total Booked Loads (every employee, combined)
//   - Overall Revenue (every employee, combined)
//   - A per-employee breakdown (Booked Loads + Revenue)
// It updates live — no refresh needed — as loads are booked, edited,
// deleted, or moved to/from Cancelled/Dispute.
//
// ADMIN-FACING
// ------------
// Every completed month is permanently archived to
// monthlyStatsArchive/{YYYY-MM} the first time any client boots after
// that month ends (see maybeArchiveMonth() below — there's no backend
// cron in this stack, so this app is deliberately self-healing: the
// very first login of the new month triggers the archive write for
// whichever month just closed). Admins can browse past months and
// download each as CSV or JSON from the Admin Panel's new
// "🗂 Monthly Archive" section. An optional, disabled-by-default
// GitHub auto-backup hook is available to whichever account(s) are
// listed in devpanel.js's window.DEVELOPER_ACCOUNTS (A009 today).
//
// DATA SOURCE / DEFINITIONS
// --------------------------
// Reads the exact same shiftHistory/{shiftId}.loadsLog arrays every
// other load feature already uses (loadhistory.js, admin.js) —
// nothing new is ever written to a load itself.
//
// A load counts toward the totals ("valid") when:
//   load.active !== false                         (not deleted)
//   AND load.status is NOT "Cancelled"
//   AND load.status is NOT "Needs Dispute"
// An edited load still counts — only those two statuses are excluded,
// exactly as specified.
//
// A load is attributed to the calendar month of `load.bookedAt` (the
// timestamp workspace.js's saveLoad() stamps once, at creation, and
// which queue.js's EDIT_LOAD/EDIT_HISTORICAL_LOAD handlers never
// touch again) — NOT its editable `date` field. That keeps a load
// permanently anchored to the month it was actually booked in, even
// if someone later edits its order/pickup date.
//
// PERFORMANCE
// -----------
// Never scans the whole shiftHistory collection. Every read is scoped
// to a date range on shiftHistory.date (the "YYYY-MM-DD" string every
// shift doc already carries — see status.js) with a 1-day buffer on
// each side to safely catch shifts that cross midnight. The live
// panel uses a single onSnapshot() on that scoped query, so after the
// first load Firestore only pushes real deltas — no polling.
//
// ===========================================


// ===========================================
// MONTH MATH
// ===========================================

function pad2MS(n) {
    return String(n).padStart(2, "0");
}

// All calendar math here is UTC-based on purpose, to stay consistent
// with the existing shiftHistory.date strings, which status.js builds
// via `new Date().toISOString().split("T")[0]` (UTC).
function getMonthInfo(refDate = new Date()) {

    const y = refDate.getUTCFullYear();
    const m = refDate.getUTCMonth(); // 0-11

    const key = `${y}-${pad2MS(m + 1)}`;
    const label = new Date(Date.UTC(y, m, 1))
        .toLocaleString("default", { month: "long", timeZone: "UTC" }) + ` ${y}`;

    const startMs = Date.UTC(y, m, 1, 0, 0, 0, 0);
    const endMs = Date.UTC(y, m + 1, 1, 0, 0, 0, 0); // exclusive

    // Buffer the shiftHistory.date range query by a day on each side so
    // an overnight shift starting the night before month-end (or
    // ending just after midnight on month-start) still gets pulled in.
    // Precise month attribution still happens afterward, in JS, using
    // each load's own bookedAt timestamp.
    const bufferStartStr = new Date(startMs - 86400000).toISOString().split("T")[0];
    const bufferEndStr = new Date(endMs + 86400000).toISOString().split("T")[0];

    return { year: y, month: m, key, label, startMs, endMs, bufferStartStr, bufferEndStr };
}

function prevMonthInfo(info) {
    return getMonthInfo(new Date(info.startMs - 86400000));
}

window.getMonthlyStatsInfo = getMonthInfo; // exposed for debugging/console use


// ===========================================
// VALID-LOAD FILTER
// ===========================================

const MONTHLY_STATS_EXCLUDED_STATUSES = ["Cancelled", "Needs Dispute"];

function isValidMonthlyLoad(load) {
    if (!load) return false;
    if (load.active === false) return false; // deleted after booking
    const status = load.status || "Booked";
    return !MONTHLY_STATS_EXCLUDED_STATUSES.includes(status);
}


// ===========================================
// AGGREGATION (shared by the live listener and the archive job)
// ===========================================

function aggregateMonthlyDocs(docs, info) {

    const perEmployee = {};
    let totalLoads = 0;
    let totalRevenue = 0;

    docs.forEach(doc => {

        const shiftData = doc.data() || {};
        const loadsLog = Array.isArray(shiftData.loadsLog) ? shiftData.loadsLog : [];
        if (!loadsLog.length) return;

        const owner = shiftData.user || null;
        if (!owner) return;

        loadsLog.forEach(load => {

            if (!isValidMonthlyLoad(load)) return;

            // Legacy loads booked before `bookedAt` existed fall back
            // to the shift's own date so they aren't silently dropped
            // from every month's totals forever.
            const bookedAt = typeof load.bookedAt === "number"
                ? load.bookedAt
                : (Date.parse(shiftData.date || "") || 0);

            if (bookedAt < info.startMs || bookedAt >= info.endMs) return;

            if (!perEmployee[owner]) {
                perEmployee[owner] = { loads: 0, revenue: 0 };
            }

            const price = Number(load.price) || 0;

            perEmployee[owner].loads += 1;
            perEmployee[owner].revenue += price;

            totalLoads += 1;
            totalRevenue += price;
        });
    });

    return { perEmployee, totalLoads, totalRevenue };
}

// One-time scoped read — used only for archiving a CLOSED month, so a
// plain .get() (not a live listener) is the right tool here.
async function aggregateMonthOnce(info) {
    const snap = await db.collection("shiftHistory")
        .where("date", ">=", info.bufferStartStr)
        .where("date", "<=", info.bufferEndStr)
        .get();

    return aggregateMonthlyDocs(snap.docs, info);
}


// ===========================================
// LIVE LISTENER (current month, employee-facing)
// ===========================================

let monthlyStatsUnsub = null;
let monthlyStatsCurrentInfo = null;

function attachMonthlyStatsListener() {

    monthlyStatsCurrentInfo = getMonthInfo();

    if (monthlyStatsUnsub) {
        monthlyStatsUnsub();
        monthlyStatsUnsub = null;
    }

    monthlyStatsUnsub = db.collection("shiftHistory")
        .where("date", ">=", monthlyStatsCurrentInfo.bufferStartStr)
        .where("date", "<=", monthlyStatsCurrentInfo.bufferEndStr)
        .onSnapshot(snap => {

            const result = aggregateMonthlyDocs(snap.docs, monthlyStatsCurrentInfo);

            window.RelayDesk = window.RelayDesk || {};
            RelayDesk.monthlyStats = { ...result, info: monthlyStatsCurrentInfo };

            renderMonthlyStatsPanel();

        }, err => {
            console.error("Monthly Statistics: live listener failed:", err);
        });
}

// Cheap self-heal for an app instance left open across midnight on the
// last day of the month — re-points the live listener at the new
// month and archives the one that just closed. Checked every 5 min
// rather than with a precise midnight timer, which is plenty for a
// "month" boundary and avoids any timezone/DST edge cases.
function checkForMonthRollover() {
    const nowInfo = getMonthInfo();
    if (!monthlyStatsCurrentInfo || nowInfo.key !== monthlyStatsCurrentInfo.key) {
        console.log("📅 Monthly Statistics: month rolled over ->", nowInfo.label);
        maybeArchiveMonth(prevMonthInfo(nowInfo));
        attachMonthlyStatsListener();
    }
}

window.startMonthlyStatsListener = function () {

    window.RelayDesk = window.RelayDesk || {};
    if (RelayDesk._monthlyStatsListenerActive) return;
    RelayDesk._monthlyStatsListenerActive = true;

    attachMonthlyStatsListener();
    setInterval(checkForMonthRollover, 5 * 60 * 1000);
};


// ===========================================
// MONTHLY ARCHIVE (admin-facing, permanent)
// ===========================================
// Lazy/self-healing archive: no Cloud Functions exist in this stack,
// so instead of a midnight cron, the FIRST client to boot after a
// month has ended does the archive write. This is cheap in the common
// case (a single .get() that finds the doc already exists) and safe
// under concurrency — two clients racing to archive the same month
// both compute identical numbers from already-closed data, and the
// transaction below guarantees only one write actually lands.

async function maybeArchiveMonth(info) {
    try {
        const ref = db.collection("monthlyStatsArchive").doc(info.key);
        const existing = await ref.get();
        if (existing.exists) return; // already archived — common case, cheap bail-out

        const result = await aggregateMonthOnce(info);

        const payload = {
            month: info.key,
            monthLabel: info.label,
            totalLoads: result.totalLoads,
            totalRevenue: result.totalRevenue,
            perEmployee: result.perEmployee,
            archivedAt: Date.now(),
            archivedBy: window.RelayDesk?.currentUser || "system-auto",
            finalized: true
        };

        await db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            if (doc.exists) return; // someone else's write already landed first
            tx.set(ref, payload);
        });

        console.log(`🗂 Monthly Statistics: archived ${info.label}`);

        if (window.MonthlyStatsGithubBackup?.enabled) {
            window.MonthlyStatsGithubBackup.upload(payload).catch(err => {
                console.warn("Monthly Statistics: GitHub backup failed (archive itself still succeeded):", err);
            });
        }

    } catch (err) {
        console.error("Monthly Statistics: failed to archive", info.key, err);
    }
}


// ===========================================
// BOOTSTRAP (called from app.js bootWorkspace())
// ===========================================

window.initializeMonthlyStats = function () {

    window.RelayDesk = window.RelayDesk || {};
    if (RelayDesk._monthlyStatsInitialized) return;
    RelayDesk._monthlyStatsInitialized = true;

    // Covers the case where nobody was logged in at the exact moment
    // last month ended — the next person to log in closes it out.
    maybeArchiveMonth(prevMonthInfo(getMonthInfo()));

    startMonthlyStatsListener();
};


// ===========================================
// RENDERING (employee-facing popout panel)
// ===========================================

function formatCurrencyMS(n) {
    return "$" + (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function escapeMS(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function renderMonthlyStatsPanel() {

    const stats = window.RelayDesk?.monthlyStats;
    if (!stats) return;

    const labelEl = document.getElementById("monthlyStatsMonthLabel");
    if (labelEl) labelEl.textContent = stats.info.label;

    const totalLoadsEl = document.getElementById("monthlyStatsTotalLoads");
    const totalRevenueEl = document.getElementById("monthlyStatsTotalRevenue");
    if (totalLoadsEl) totalLoadsEl.textContent = stats.totalLoads;
    if (totalRevenueEl) totalRevenueEl.textContent = formatCurrencyMS(stats.totalRevenue);

    const footerLoadsEl = document.getElementById("monthlyStatsFooterLoads");
    const footerRevenueEl = document.getElementById("monthlyStatsFooterRevenue");
    if (footerLoadsEl) footerLoadsEl.textContent = stats.totalLoads;
    if (footerRevenueEl) footerRevenueEl.textContent = formatCurrencyMS(stats.totalRevenue);

    const listEl = document.getElementById("monthlyStatsPerEmployee");
    if (!listEl) return;

    const rows = Object.keys(stats.perEmployee)
        .map(id => ({ id, ...stats.perEmployee[id] }))
        .sort((a, b) => b.revenue - a.revenue);

    if (!rows.length) {
        listEl.innerHTML = `<div class="workspaceEmpty">No booked loads yet this month.</div>`;
        return;
    }

    listEl.innerHTML = rows.map(r => `
        <div class="monthlyStatRow">
            <b>${escapeMS(r.id)}</b>
            <span>Booked Loads: ${r.loads}</span>
            <span>Revenue: ${formatCurrencyMS(r.revenue)}</span>
        </div>
    `).join("");
}

window.renderMonthlyStatsPanel = renderMonthlyStatsPanel;


// ===========================================
// TOGGLE + DRAG-AND-DROP (mirrors timers.js's
// initTodaysTimersToggle, kept self-contained here so the existing,
// already-tested Today's Timers code path is never touched)
// ===========================================

window.initMonthlyStatsToggle = function () {

    const toggleBtn = document.getElementById("monthlyStatsToggleBtn");
    const dropdown = document.getElementById("monthlyStatsDropdown");
    const dragHandle = document.getElementById("monthlyStatsDragHandle");

    if (!toggleBtn || !dropdown) return;

    toggleBtn.onclick = () => {
        dropdown.classList.toggle("hidden");
    };

    if (dragHandle) {

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        dragHandle.addEventListener("mousedown", (e) => {

            dragging = true;
            dropdown.classList.add("dragging");

            const rect = dropdown.getBoundingClientRect();
            dropdown.style.position = "fixed";
            dropdown.style.left = rect.left + "px";
            dropdown.style.top = rect.top + "px";
            dropdown.style.transform = "none";

            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {

            if (!dragging) return;

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - dropdown.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - dropdown.offsetHeight));

            dropdown.style.left = newLeft + "px";
            dropdown.style.top = newTop + "px";
        });

        document.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            dropdown.classList.remove("dragging");
            document.body.style.userSelect = "";
        });
    }

    console.log("📊 Monthly Statistics dropdown ready");
};


// ===========================================
// ADMIN PANEL: MONTHLY ARCHIVE VIEWER + EXPORT
// ===========================================

window.initMonthlyArchiveAdmin = function () {

    window.RelayDesk = window.RelayDesk || {};
    if (RelayDesk._monthlyArchiveAdminInitialized) return;
    RelayDesk._monthlyArchiveAdminInitialized = true;

    const section = document.getElementById("monthlyArchiveSection");
    if (section) {
        section.classList.toggle("hidden", !window.hasPermission?.("canViewStatistics"));
    }

    const select = document.getElementById("monthlyArchiveSelect");
    const viewBox = document.getElementById("monthlyArchiveView");
    const csvBtn = document.getElementById("monthlyArchiveCsvBtn");
    const jsonBtn = document.getElementById("monthlyArchiveJsonBtn");
    const refreshBtn = document.getElementById("monthlyArchiveRefreshBtn");

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
            .sort((a, b) => b.revenue - a.revenue);

        viewBox.innerHTML = `
            <div class="monthlyStatsSummary">
                <div class="timerCard">
                    <h3>📦 Total Loads</h3>
                    <span>${data.totalLoads}</span>
                </div>
                <div class="timerCard">
                    <h3>💰 Total Revenue</h3>
                    <span>${formatCurrencyMS(data.totalRevenue)}</span>
                </div>
            </div>
            <div class="monthlyStatsPerEmployee">
                ${rows.map(r => `
                    <div class="monthlyStatRow">
                        <b>${escapeMS(r.id)}</b>
                        <span>Booked Loads: ${r.loads}</span>
                        <span>Revenue: ${formatCurrencyMS(r.revenue)}</span>
                    </div>
                `).join("") || `<div class="workspaceEmpty">No qualifying loads that month.</div>`}
            </div>
        `;
    }

    async function loadArchiveList() {

        if (!select) return;
        select.innerHTML = `<option value="">Loading...</option>`;

        const snap = await db.collection("monthlyStatsArchive").orderBy("month", "desc").get();

        if (snap.empty) {
            select.innerHTML = `<option value="">No archived months yet</option>`;
            renderSelected(null);
            return;
        }

        select.innerHTML = snap.docs.map(doc => {
            const d = doc.data();
            return `<option value="${doc.id}">${escapeMS(d.monthLabel || doc.id)}</option>`;
        }).join("");

        renderSelected(snap.docs[0].data());
    }

    select?.addEventListener("change", async () => {
        if (!select.value) return;
        const doc = await db.collection("monthlyStatsArchive").doc(select.value).get();
        if (doc.exists) renderSelected(doc.data());
    });

    refreshBtn?.addEventListener("click", loadArchiveList);

    csvBtn?.addEventListener("click", () => {
        if (!currentArchiveDoc) return;
        downloadMonthlyArchiveCsv(currentArchiveDoc);
    });

    jsonBtn?.addEventListener("click", () => {
        if (!currentArchiveDoc) return;
        downloadMonthlyArchiveJson(currentArchiveDoc);
    });

    loadArchiveList();
    initGithubBackupControls();
};

function downloadMonthlyArchiveCsv(data) {

    let csv = `RelayDesk Monthly Statistics,${data.monthLabel}\n`;
    csv += `Archived,${new Date(data.archivedAt).toLocaleString()},By,${data.archivedBy}\n\n`;
    csv += `Employee,Booked Loads,Revenue\n`;

    Object.keys(data.perEmployee || {}).forEach(id => {
        const e = data.perEmployee[id];
        csv += `${id},${e.loads},${e.revenue}\n`;
    });

    csv += `\nOverall Total Booked Loads,${data.totalLoads}\n`;
    csv += `Overall Total Revenue,${data.totalRevenue}\n`;

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relaydesk-monthly-stats-${data.month}.csv`;
    a.click();
}

function downloadMonthlyArchiveJson(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relaydesk-monthly-stats-${data.month}.json`;
    a.click();
}


// ===========================================
// OPTIONAL ENHANCEMENT: GitHub auto-backup
// (Developer accounts only — window.DEVELOPER_ACCOUNTS, devpanel.js)
// ===========================================
// Disabled by default. Failing to upload NEVER blocks the archive
// itself (see the .catch() in maybeArchiveMonth above) — this is
// purely a convenience mirror of data that's already safely stored
// in Firestore.
//
// ⚠️ SECURITY NOTE (also shown in the Admin Panel UI): whatever token
// is saved here is stored in Firestore, which today is world-
// readable/writable under the temporary open rule in firestore.rules
// (it expires 2026-07-30 — see that file). Use a fine-grained,
// repo-scoped GitHub token, never a broad personal-access token, and
// replace the open Firestore rule with real per-collection rules
// before relying on this for anything sensitive.

window.MonthlyStatsGithubBackup = {
    enabled: false,
    repo: "",
    path: "monthly-reports",
    token: ""
};

async function loadGithubBackupConfig() {
    try {
        const doc = await db.collection("system").doc("monthlyStatsConfig").get();
        const cfg = doc.exists ? doc.data() : {};
        window.MonthlyStatsGithubBackup.enabled = !!cfg.githubBackupEnabled;
        window.MonthlyStatsGithubBackup.repo = cfg.githubRepo || "";
        window.MonthlyStatsGithubBackup.path = cfg.githubPath || "monthly-reports";
        window.MonthlyStatsGithubBackup.token = cfg.githubToken || "";
    } catch (err) {
        console.warn("Monthly Statistics: could not load GitHub backup config:", err);
    }
}

window.MonthlyStatsGithubBackup.upload = async function (monthData) {

    const cfg = window.MonthlyStatsGithubBackup;
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
            message: `RelayDesk monthly report: ${monthData.monthLabel}`,
            content
        })
    });

    if (!res.ok) {
        throw new Error(`GitHub upload failed: ${res.status} ${await res.text()}`);
    }

    console.log(`☁️ Monthly Statistics: backed up ${monthData.month} to GitHub`);
};

function initGithubBackupControls() {

    const box = document.getElementById("monthlyArchiveGithubBox");
    if (!box) return;

    const isDeveloper = (window.DEVELOPER_ACCOUNTS || []).includes(window.RelayDesk?.currentUser);

    if (!isDeveloper) {
        box.classList.add("hidden");
        return;
    }

    box.classList.remove("hidden");

    const enabledCk = document.getElementById("githubBackupEnabled");
    const repoInput = document.getElementById("githubBackupRepo");
    const pathInput = document.getElementById("githubBackupPath");
    const tokenInput = document.getElementById("githubBackupToken");
    const saveBtn = document.getElementById("githubBackupSaveBtn");

    loadGithubBackupConfig().then(() => {
        if (enabledCk) enabledCk.checked = window.MonthlyStatsGithubBackup.enabled;
        if (repoInput) repoInput.value = window.MonthlyStatsGithubBackup.repo;
        if (pathInput) pathInput.value = window.MonthlyStatsGithubBackup.path;
    });

    saveBtn?.addEventListener("click", async () => {

        const cfg = {
            githubBackupEnabled: !!enabledCk?.checked,
            githubRepo: repoInput?.value.trim() || "",
            githubPath: pathInput?.value.trim() || "monthly-reports",
            githubToken: tokenInput?.value.trim() || window.MonthlyStatsGithubBackup.token
        };

        await db.collection("system").doc("monthlyStatsConfig").set(cfg, { merge: true });
        await loadGithubBackupConfig();

        if (tokenInput) tokenInput.value = "";
        alert("GitHub backup settings saved.");
    });
}
