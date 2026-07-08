// ===========================================
// RelayDesk V5
// audit.js (CLEAN + ROLE SAFE + NO REPLAY BUG)
// + STRUCTURED CHANGE DIFFS (backward compatible)
// ===========================================


// prevent duplicate listeners
let auditInitialized = false;


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

                container.innerHTML = `
                    <div class="auditHeader"
                         onclick="this.nextElementSibling.classList.toggle('open')">
                        👤 ${user} ▼
                    </div>
                    <div class="auditDropdown">
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
