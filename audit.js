// ===========================================
// RelayDesk V5
// audit.js (CLEAN + ROLE SAFE + NO REPLAY BUG)
// + STRUCTURED CHANGE DIFFS (backward compatible)
// ===========================================


// prevent duplicate listeners
let auditInitialized = false;


// ===========================================
// AUDIT GROUP OPEN/CLOSE STATE (Phase 2)
// ===========================================
// Both loadAuditLogs() below and admin-extras.js's
// renderFilteredAuditLogs() rebuild #auditLog's innerHTML from
// scratch on every refresh (loadAuditLogs runs every 10s via
// setInterval). That used to blow away any group an admin had
// expanded — effectively "auto-closing" it out from under them.
// This tracks which user-groups are expanded across re-renders, so a
// group only closes when the admin actually closes it: the ✕ button,
// clicking outside the audit panel, or scrolling the panel out of
// view. Shared globally since both render functions use it.

window._auditOpenUsers = window._auditOpenUsers || new Set();

window.auditIsOpen = function (user) {
    return window._auditOpenUsers.has(user);
};

window.auditToggleOpen = function (headerEl, user) {
    if (window._auditOpenUsers.has(user)) {
        window._auditOpenUsers.delete(user);
    } else {
        window._auditOpenUsers.add(user);
    }
    headerEl.nextElementSibling.classList.toggle("open");
};

window.auditCloseGroup = function (closeBtnEl, user) {
    window._auditOpenUsers.delete(user);
    closeBtnEl.closest(".auditDropdown")?.classList.remove("open");
};

window.auditCloseAllGroups = function () {
    if (!window._auditOpenUsers.size) return;
    window._auditOpenUsers.clear();
    document.querySelectorAll("#auditLog .auditDropdown.open")
        .forEach(el => el.classList.remove("open"));
};

let auditCloseListenersBound = false;

function bindAuditCloseListeners() {

    if (auditCloseListenersBound) return;
    auditCloseListenersBound = true;

    // outside click closes any expanded groups
    document.addEventListener("click", (e) => {
        if (e.target.closest("#auditLog")) return;
        window.auditCloseAllGroups();
    });

    // scrolling the audit panel out of view closes any expanded groups
    const panel = document.getElementById("auditLog");
    if (panel && "IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) window.auditCloseAllGroups();
            });
        }, { threshold: 0 });
        observer.observe(panel);
    }
}


// ===========================================
// INIT AUDIT SYSTEM
// ===========================================

function initAuditSystem() {

    // ===== PERMISSION SYSTEM =====
    // only A000 or a user granted canViewAudit gets the live audit
    // feed / clear / sound-alert behavior below
    if (!window.hasPermission?.("canViewAudit")) {
        console.log("📜 Audit system skipped (no canViewAudit permission)");
        return;
    }

    console.log("📜 Audit system active");

    const box = $("auditLog");
    const refreshBtn = document.getElementById("auditRefreshBtn");
    const clearBtn = document.getElementById("clearAuditBtn");

    if (clearBtn) {
        clearBtn.onclick = clearAuditLog;
    }

    if (!box) return;

    if (refreshBtn) {
        refreshBtn.onclick = () => loadAuditLogs();
    }

    loadAuditLogs();
    bindAuditCloseListeners();

    setInterval(loadAuditLogs, 10000);

    // 🚫 prevent duplicate listeners
    if (auditInitialized) return;
    auditInitialized = true;

    // =====================================
    // SHIFT END SOUND LISTENER (FIXED)
    // =====================================

    const shiftStartTime = Date.now();

    db.collection("auditLogs")
        .where("action", "==", "SHIFT_ENDED")
        .onSnapshot(snapshot => {

            snapshot.docChanges().forEach(change => {

                if (change.type !== "added") return;

                const data = change.doc.data();

                const isAdmin = window.hasAdminAccess?.();

                // 🚫 ignore old events before login
                if (data.time && data.time < shiftStartTime) return;

                // 👤 normal users NEVER hear sound
                if (!isAdmin) return;

                // 🧑‍💼 ignore self events
                if (data.user === RelayDesk.currentUser) return;

                const audio = new Audio("assets/shift_end_ping.mp3");
                audio.play().catch(() => {});
            });

        });
}


// ===========================================
// SMALL DISPLAY HELPERS (new)
// ===========================================
// Kept local/private (not attached to window) — purely for rendering
// the audit feed itself. Doesn't touch or replace anything another
// file relies on (e.g. myhistory.js has its own separate escapeHtml).

function formatAuditValue(v) {

    if (v === undefined || v === null || v === "") return "—";

    const div = document.createElement("div");
    div.textContent = typeof v === "object" ? JSON.stringify(v) : String(v);
    return div.innerHTML;
}

function escapeAuditText(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}


// ===========================================
// LOAD LOGS
// ===========================================

function loadAuditLogs() {

    const box = $("auditLog");
    if (!box) return;

    db.collection("auditLogs")
        .orderBy("time", "desc")
        .limit(50)
        .get()
        .then(snapshot => {

            box.innerHTML = "";

            if (snapshot.empty) {
                box.innerHTML = `<div class="auditEmpty">No audit logs yet</div>`;
                return;
            }

            const grouped = {};

            snapshot.forEach(doc => {
                const l = doc.data();

                if (!grouped[l.user]) {
                    grouped[l.user] = [];
                }

                grouped[l.user].push(l);
            });

            Object.keys(grouped).forEach(user => {

                const container = document.createElement("div");
                container.className = "auditGroup";

                const details = grouped[user].map(l => {

                    const time = new Date(l.time).toLocaleTimeString();

                    // ----- NEW: structured before/after diff, only -----
                    // renders when an entry actually has one (older
                    // entries and every existing string-only logAudit()
                    // call are completely unaffected and render exactly
                    // as they did before).
                    const hasDiff = !!(l.before && l.after && Array.isArray(l.changedFields) && l.changedFields.length);

                    const diffBlock = hasDiff ? `
                        <div class="auditChangesToggle"
                             style="cursor:pointer;text-decoration:underline;font-size:11px;margin-top:2px;opacity:0.85;"
                             onclick="var d=this.nextElementSibling; d.style.display = (d.style.display==='block') ? 'none' : 'block';">
                            🔍 Show Changes
                        </div>
                        <div class="auditChangesDetail"
                             style="display:none;font-size:11px;margin-top:4px;padding-left:8px;border-left:2px solid rgba(255,255,255,0.15);">
                            ${l.changedFields.map(f => `
                                <div><b>${escapeAuditText(f)}:</b> ${formatAuditValue(l.before[f])} → ${formatAuditValue(l.after[f])}</div>
                            `).join("")}
                            ${l.reason ? `<div style="margin-top:4px;"><b>Reason:</b> ${escapeAuditText(l.reason)}</div>` : ""}
                        </div>
                    ` : "";

                    return `
                        <div class="auditItem">
                            <b>${l.action}</b>
                            <small>${l.detail || ""}</small>
                            <small>${time}</small>
                            ${diffBlock}
                        </div>
                    `;
                }).join("");

                const isOpen = window.auditIsOpen(user);

                container.innerHTML = `
                    <div class="auditHeader"
                         onclick="window.auditToggleOpen(this, '${user}')">
                        👤 ${user} ▼
                    </div>
                    <div class="auditDropdown${isOpen ? " open" : ""}">
                        <div class="auditCloseBtn" onclick="window.auditCloseGroup(this, '${user}')">✕ Close</div>
                        ${details}
                    </div>
                `;

                box.appendChild(container);
            });

        })
        .catch(err => {
            console.error("Audit load failed:", err);
        });
}


// ===========================================
// GLOBAL LOGGER
// ===========================================
//
// Signature is backward compatible: every existing call site
// (logAudit(user, action, detail)) behaves exactly as before — the
// new 4th "changes" argument is entirely optional and additive.
//
// To log a structured before/after change (e.g. a Load History edit),
// pass a 4th argument shaped like:
//   { before: {...fieldsBefore}, after: {...fieldsAfter}, reason: "..." }
// logAudit will automatically work out which fields actually differ
// (changedFields) so renderers don't have to diff it themselves.

window.logAudit = async function (user, action, detail = "", changes = null) {

    if (!db) return;

    const entry = {
        user,
        action,
        detail,
        time: Date.now(),
        shiftId: RelayDesk.shiftId || null
    };

    if (changes && typeof changes === "object") {

        if (changes.before) entry.before = changes.before;
        if (changes.after) entry.after = changes.after;
        if (changes.reason) entry.reason = changes.reason;

        if (changes.before && changes.after) {
            entry.changedFields = Object.keys(changes.after).filter(
                key => JSON.stringify(changes.before[key]) !== JSON.stringify(changes.after[key])
            );
        }
    }

    await db.collection("auditLogs").add(entry);

    console.log("📜 audit:", user, action);
};


// ===========================================
// SHIFT END LOGGER
// ===========================================

window.logShiftEnd = async function (user, reason = "Shift ended") {

    if (typeof logAudit !== "function") return;

    await logAudit(user, "SHIFT_ENDED", reason);
};


// ===========================================
// EXPORT (Phase 2 item 3)
// ===========================================
// Mirrors admin.js's exportShiftHistoryPdf: same jsPDF line()/page-break
// helper, same doc.save(...) pattern. Gated on canViewAudit (not
// canExportHistory) since that's the permission that already governs
// who sees the audit log at all.

window.exportAuditLogPdf = async function () {

    if (!window.hasPermission?.("canViewAudit")) {
        alert("You don't have permission to export the audit log.");
        return;
    }

    if (!window.jspdf?.jsPDF) {
        alert("PDF library not loaded. Check your connection and try again.");
        return;
    }

    const snapshot = await db.collection("auditLogs")
        .orderBy("time", "desc")
        .limit(300)
        .get();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    let y = 15;
    const lineGap = 6;
    const pageHeight = doc.internal.pageSize.getHeight();

    function line(text, size = 10, bold = false) {
        if (y > pageHeight - 15) {
            doc.addPage();
            y = 15;
        }
        doc.setFontSize(size);
        doc.setFont(undefined, bold ? "bold" : "normal");
        doc.text(String(text), 14, y);
        y += lineGap;
    }

    line("RelayDesk Audit Log Export", 16, true);
    line(`Generated ${new Date().toLocaleString()}`, 9);
    line(`Most recent ${snapshot.size} entries`, 9);
    y += 3;

    snapshot.forEach(docSnap => {

        const l = docSnap.data();
        const time = l.time ? new Date(l.time).toLocaleString() : "N/A";

        line(`${time}  |  ${l.user || "Unknown"}  |  ${l.action || ""}`, 9, true);

        if (l.detail) line(String(l.detail), 9);

        if (l.changedFields?.length) {
            l.changedFields.forEach(f => {
                const before = l.before?.[f] ?? "—";
                const after = l.after?.[f] ?? "—";
                line(`  ${f}: ${before} -> ${after}`, 8);
            });
            if (l.reason) line(`  Reason: ${l.reason}`, 8);
        }

        y += 1;
    });

    doc.save(`audit-log-export-${Date.now()}.pdf`);

    logAudit(RelayDesk.currentUser, "EXPORT_AUDIT_LOG", "Downloaded PDF export");
};


// ===========================================
// CLEAR LOGS
// ===========================================

window.clearAuditLog = async function () {

    if (!confirm("Delete every audit log?")) return;

    const logs = await db.collection("auditLogs").get();

    const batch = db.batch();

    logs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
};
