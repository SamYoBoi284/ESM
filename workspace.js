// ===========================================
// RelayDesk V22 (FIXED)
// workspace.js
// ===========================================

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    RelayDesk.workspace = {

        initialized: false,
        notes: "",
        UI: {},
        saveTimeout: null,

        init() {

            if (this.initialized) return;

            this.cacheUI();
            this.bindEvents();

            this.initialized = true;

            console.log("📝 Workspace initialized.");
        },

        cacheUI() {

            this.UI = {
                notes: document.getElementById("workspaceNotes"),
                notesStatus: document.getElementById("workspaceSaveStatus"),
                countdown: document.getElementById("shiftCountdown"),
                endedAt: document.getElementById("shiftEndedAt")
            };
        },

        bindEvents() {

            if (this.UI.notes) {
                this.UI.notes.addEventListener("input", () => this.queueSave());
            }
        },

        queueSave() {

            clearTimeout(this.saveTimeout);
            this.showSaveStatus("Saving...");

            this.saveTimeout = setTimeout(() => this.saveNotes(), 1200);
        },

        async saveNotes() {

    if (!RelayDesk.currentUser) return;

    const noteText = this.UI.notes?.value || "";

    try {

        // Queued (not written to Firestore immediately). dedupeKey
        // means if several keystrokes queue up while offline, only
        // the latest note text is kept — not every intermediate draft.
        RelayDesk.queue.enqueue("SAVE_NOTES", {
            uid: RelayDesk.currentUser,
            shiftId: RelayDesk.shiftId || null,
            notes: noteText
        }, { dedupeKey: `notes:${RelayDesk.currentUser}` });

        this.showSaveStatus("Saved ✔");

    } catch (err) {
        console.error(err);
        this.showSaveStatus("Save Failed");
    }

},

        async load() {

            if (!RelayDesk.currentUser) return;

            const doc = await db.collection("users").doc(RelayDesk.currentUser).get();
            if (!doc.exists) return;

            const data = doc.data() || {};

            if (this.UI.notes) this.UI.notes.value = data.notes || "";
        },

        showSaveStatus(text) {
            if (this.UI.notesStatus)
                this.UI.notesStatus.textContent = text;
        }
    };

})();


// ===========================================
// END-OF-SHIFT REPORT FORMATTER (NEW PANEL)
// ===========================================

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    RelayDesk.reportFormatter = {

        initialized: false,
        UI: {},

        // Default template shown the first time an employee opens the
        // panel. Employees (or admins, via the same textarea) can
        // overwrite this with whatever structure they want — it's
        // saved per-browser so it sticks around next shift.
        DEFAULT_TEMPLATE:
`End of Shift Report — {{date}}
{{user}}
Shift: {{shiftStart}} - {{shiftEnd}}

Loads Booked ({{loadCount}}):
{{loads}}

Notes:
{{notes}}`,

        // Team Members (combined shift report) — selection is kept in
        // memory only (per V51 item 6): it's a report-generation-time
        // concern, never written anywhere, and resets on page reload.
        // `shiftData` caches the OTHER selected employees' current
        // active-shift data (bookedLoads/notes) as of the last time the
        // modal was applied — the current user's own data is always
        // read live instead of cached, same as the solo report already
        // did before this feature existed.
        teamMembers: {
            selected: new Set(),
            allUsers: [],
            shiftData: {},
            unsub: null
        },

        init() {

            if (this.initialized) return;

            this.mount();
            this.cacheUI();
            this.bindEvents();
            this.restoreTemplate();
            this.autoLoadShiftData();
            this.renderPreview();

            this.initialized = true;

            console.log("🧾 Report formatter initialized.");
        },

        // Builds the panel's DOM. If the page already has a
        // <div id="reportFormatterPanel"></div> placeholder, it fills
        // that in. Otherwise it creates one and drops it right after
        // the shift notes panel so it shows up on the dashboard
        // without needing any HTML changes.
        mount() {

            let container = document.getElementById("reportFormatterPanel");

            if (!container) {
                container = document.createElement("div");
                container.id = "reportFormatterPanel";

                const anchor =
                    document.getElementById("workspaceNotes")?.closest("section, .panel, div") ||
                    document.getElementById("workspaceNotes")?.parentElement ||
                    document.body;

                anchor.parentElement
                    ? anchor.parentElement.insertBefore(container, anchor.nextSibling)
                    : document.body.appendChild(container);
            }

            container.className = "panel reportFormatterPanel";

            container.innerHTML = `
                <h3>📄 End-of-Shift Report Formatter</h3>

                <label for="reportTemplateInput">Report Template Format</label>
                <textarea id="reportTemplateInput" rows="6"
                    placeholder="Paste your (or your admin's) report template here. Use {{date}}, {{user}}, {{shiftStart}}, {{shiftEnd}}, {{loadCount}}, {{loads}}, {{notes}} as placeholders."></textarea>

                <div class="reportFormatterRow">
                    <label for="reportRawInput">Shift Data / Raw Notes</label>
                    <button id="reportAutoLoadBtn" class="smallButton" type="button">🔄 Auto-Load Today's Shift Data</button>
                </div>
                <textarea id="reportRawInput" rows="6"
                    placeholder="Enter or auto-load today's shift notes here."></textarea>

                <div class="reportFormatterRow">
                    <button id="reportTeamMembersBtn" class="smallButton" type="button">👥 Team Members</button>
                    <span id="reportTeamMembersStatus" class="reportTeamMembersStatus"></span>
                </div>

                <label>Live Preview</label>
                <pre id="reportPreview" class="reportPreview"></pre>

                <div class="reportFormatterRow">
                    <button id="reportCopyBtn" class="smallButton" type="button">📋 Copy to Clipboard</button>
                    <span id="reportCopyStatus"></span>
                </div>
            `;
        },

        cacheUI() {

            this.UI = {
                template: document.getElementById("reportTemplateInput"),
                raw: document.getElementById("reportRawInput"),
                preview: document.getElementById("reportPreview"),
                autoLoadBtn: document.getElementById("reportAutoLoadBtn"),
                copyBtn: document.getElementById("reportCopyBtn"),
                copyStatus: document.getElementById("reportCopyStatus"),

                teamMembersBtn: document.getElementById("reportTeamMembersBtn"),
                teamMembersStatus: document.getElementById("reportTeamMembersStatus"),
                teamModal: document.getElementById("teamMembersModal"),
                teamList: document.getElementById("teamMembersList"),
                teamSelectAllBtn: document.getElementById("teamMembersSelectAllBtn"),
                teamClearBtn: document.getElementById("teamMembersClearBtn"),
                teamApplyBtn: document.getElementById("teamMembersApplyBtn"),
                teamCancelBtn: document.getElementById("teamMembersCancelBtn")
            };
        },

        bindEvents() {

            this.UI.template?.addEventListener("input", () => {
                this.saveTemplate();
                this.renderPreview();
            });

            this.UI.raw?.addEventListener("input", () => this.renderPreview());

            this.UI.autoLoadBtn?.addEventListener("click", async () => {
                this.autoLoadShiftData();

                // keep the OTHER selected employees' data fresh too,
                // not just this employee's own notes/loads
                if (this.teamMembers.selected.size > 1) {
                    await this.refreshTeamShiftData();
                }

                this.renderPreview();
            });

            this.UI.copyBtn?.addEventListener("click", () => this.copyToClipboard());

            this.UI.teamMembersBtn?.addEventListener("click", () => this.openTeamModal());
            this.UI.teamSelectAllBtn?.addEventListener("click", () => this.selectAllTeamMembers());
            this.UI.teamClearBtn?.addEventListener("click", () => this.clearTeamSelection());
            this.UI.teamApplyBtn?.addEventListener("click", () => this.applyTeamSelection());
            this.UI.teamCancelBtn?.addEventListener("click", () => this.closeTeamModal());
        },

        // Template is a personal formatting preference, so it's kept
        // per-browser rather than round-tripped through Firestore.
        saveTemplate() {
            try {
                localStorage.setItem(
                    "relaydesk_reportTemplate",
                    this.UI.template?.value ?? ""
                );
            } catch (e) {}
        },

        restoreTemplate() {

            let saved = null;

            try {
                saved = localStorage.getItem("relaydesk_reportTemplate");
            } catch (e) {}

            if (this.UI.template) {
                this.UI.template.value = saved || this.DEFAULT_TEMPLATE;
            }
        },

        // Pulls together whatever we already know about today's shift
        // (notes box + booked loads) so the employee doesn't have to
        // retype anything by hand.
        //
        // V51: the only source of truth for the current shift's loads
        // is the live RelayDesk.bookedLoads array — never a cached
        // copy — so this (and buildReport below) always reflect
        // add/edit/delete immediately.
        // NOTE (V51 items 2/3): this used to also append a "Loads:"
        // block onto the notes text so it ended up baked into
        // {{notes}} — which is why {{loads}} looked like it was being
        // ignored and the load list appeared to get appended after
        // the Notes section instead of replacing {{loads}} in place.
        // {{loads}} is its own placeholder (see buildReport), so this
        // only needs to seed the raw notes box with the actual notes.
        autoLoadShiftData() {

            if (!this.UI.raw) return;

            const notes = RelayDesk.workspace?.UI?.notes?.value?.trim() || "";

            this.UI.raw.value = notes;
        },

        // Order departments should appear in on the report; anything
        // with no department (legacy loads) falls into "Other" at the end.
        // (Renamed from DIVISION_ORDER — Phase 2 item 5. Kept as a plain
        // mirror of window.LOAD_DEPARTMENTS + "Other" for anything that
        // still references this property.)
        DEPARTMENT_ORDER: ["STS", "iTour", "Alquaiti", "F&F", "Other"],

        // Phase 2 item 4: groups loads Department -> Driver -> VRID Type
        // -> Loads (via the shared window.groupLoadsHierarchy helper)
        // and renders them the way the report spec wants — a divider
        // line before EACH "Department (count)" block (including the
        // first one), then each driver/VRID sub-block, then each load.
        //
        // opts.showOwner: prefix each load line with the employee code
        // that booked it (used by the combined Team Members report).
        // opts.forceAllDivisions: always render all 4 official
        // departments, showing "No loads were booked for this
        // department." for empty ones instead of skipping them (also
        // combined-report only — the solo report keeps its original
        // skip-if-empty behavior).
        formatLoadsForTemplate(loads, opts = {}) {

            const { showOwner = false, forceAllDivisions = false } = opts;

            if (!loads.length && !forceAllDivisions) return "No booked loads recorded.";

            const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";

            const formatLine = (l) => {
                const owner = showOwner ? `${l.bookedByCode} | ` : "";
                const vridTag = l.vrid ? ` | VRID: ${l.vrid}` : "";
                return `• ${owner}${l.date} | $${l.price}${vridTag}${l.note ? " | " + l.note : ""}`;
            };

            const grouped = window.groupLoadsHierarchy(loads);
            const groupedMap = new Map(grouped.map(g => [g.department, g]));

            const departmentsToShow = forceAllDivisions
                ? [...window.LOAD_DEPARTMENTS, ...(groupedMap.has("Other") ? ["Other"] : [])]
                : grouped.map(g => g.department);

            const sections = departmentsToShow.map(dept => {

                const group = groupedMap.get(dept);

                if (!group || !group.drivers.length) {
                    return `${dept}\nNo loads were booked for this department.`;
                }

                let total = 0;

                const driverBlocks = group.drivers.map(d => {

                    const vridBlocks = d.vridGroups.map(vg => {
                        total += vg.loads.length;
                        const lines = vg.loads.map(formatLine).join("\n");
                        return `  ${vg.vridType} (${vg.loads.length})\n${lines}`;
                    }).join("\n");

                    return ` Driver: ${d.driver}\n${vridBlocks}`;
                }).join("\n\n");

                return `${dept} (${total})\n${driverBlocks}`;
            });

            if (!sections.length) return "No booked loads recorded.";

            return sections.map(s => `${DIVIDER}\n${s}`).join("\n\n");
        },

        // Called by the loads system after every render (add / edit /
        // delete / live snapshot) so the preview never goes stale
        // without the employee having to press Auto-Load again.
        refresh() {
            this.renderPreview();
        },

        // V51 item 1: {{shiftStart}}/{{shiftEnd}} now resolve from the
        // employee's ASSIGNED shift cycle (shifts.js SHIFT_CYCLES),
        // not the actual clock-in/out timestamps for today.
        getAssignedShiftTimes() {

            const key = RelayDesk.currentUserData?.assignedShift;
            const cycle = key && window.SHIFT_CYCLES ? window.SHIFT_CYCLES[key] : null;

            if (!cycle) return { start: "--", end: "--" };

            const start = new Date(2000, 0, 1, cycle.startHour, cycle.startMinute);
            const end = new Date(start.getTime() + 9 * 60 * 60 * 1000);

            const fmt = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

            return { start: fmt(start), end: fmt(end) };
        },

        // Returns the given employee's CURRENT active-shift data. The
        // report creator's own data is always read live (workspace
        // notes box + RelayDesk.bookedLoads) rather than from the
        // teamMembers cache, exactly like the solo report always did.
        getTeamMemberShiftData(id) {

            if (id === RelayDesk.currentUser) {
                return {
                    bookedLoads: RelayDesk.bookedLoads || [],
                    notes: RelayDesk.workspace?.UI?.notes?.value || ""
                };
            }

            return this.teamMembers.shiftData?.[id] || { bookedLoads: [], notes: "" };
        },

        // V51 item 6: preserves which employee wrote each note instead
        // of merging them into a single anonymous block. Employees with
        // no notes are skipped entirely.
        formatCombinedNotes(selectedIds) {

            const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";

            const blocks = selectedIds
                .map(id => {
                    const text = (this.getTeamMemberShiftData(id).notes || "").trim();
                    return text ? `${id}\n\n${text}` : null;
                })
                .filter(Boolean);

            if (!blocks.length) return "";

            return "Notes\n\n" + blocks.map(b => `${DIVIDER}\n\n${b}`).join("\n\n");
        },

        // Fills the template's {{placeholders}} in with live shift
        // data plus whatever raw notes are currently in the box.
        //
        // When more than one Team Member is selected, {{user}} and
        // {{notes}} expand into fully self-labeled, self-contained
        // blocks (Report Submitted By / Employees Included, and a
        // per-employee Notes breakdown) rather than plain values —
        // this is a report-generation-only combination, nothing is
        // ever merged or written back to Firestore.
        buildReport() {

            const template = this.UI.template?.value || "";
            const rawNotes = this.UI.raw?.value || "";

            const selectedIds = this.teamMembers.selected.size
                ? Array.from(this.teamMembers.selected).sort()
                : [RelayDesk.currentUser];

            const isCombined = selectedIds.length > 1;

            let loads, userToken, notesToken;

            if (isCombined) {

                loads = [];
                selectedIds.forEach(id => {
                    const entry = this.getTeamMemberShiftData(id);
                    entry.bookedLoads.forEach(l => loads.push({ ...l, bookedByCode: id }));
                });

                userToken = "Report Submitted By:\n" + (RelayDesk.currentUser || "") +
                    "\n\nEmployees Included:\n\n" +
                    selectedIds.map(id => `• ${id}`).join("\n");

                notesToken = this.formatCombinedNotes(selectedIds);

            } else {

                loads = RelayDesk.bookedLoads || [];
                userToken = RelayDesk.currentUser || "";
                notesToken = rawNotes;
            }

            const shiftTimes = this.getAssignedShiftTimes();

            const tokens = {
                "{{date}}": new Date().toLocaleDateString(),
                "{{user}}": userToken,
                "{{shiftStart}}": shiftTimes.start,
                "{{shiftEnd}}": shiftTimes.end,
                "{{loadCount}}": String(loads.length),
                "{{loads}}": this.formatLoadsForTemplate(loads, {
                    showOwner: isCombined,
                    forceAllDivisions: isCombined
                }),
                "{{notes}}": notesToken
            };

            const hasKnownToken = Object.keys(tokens)
                .some(token => template.includes(token));

            if (!template.trim()) {
                return rawNotes;
            }

            let output = template;

            for (const [token, value] of Object.entries(tokens)) {
                output = output.split(token).join(value);
            }

            // If the pasted template doesn't use any recognized
            // placeholders at all, treat it as a header and append
            // the raw notes underneath rather than silently dropping
            // them.
            if (!hasKnownToken && rawNotes.trim()) {
                output += "\n\n" + rawNotes;
            }

            // Safety net: a template saved (in localStorage, per
            // browser) before {{loads}} existed — or one an employee
            // hand-edited and accidentally dropped the token from —
            // would otherwise silently lose the load list entirely now
            // that autoLoadShiftData() no longer bakes it into {{notes}}
            // as a side effect. If the template has other known tokens
            // (so it's not just being treated as a plain header above)
            // but doesn't reference {{loads}}, append the loads block
            // so it's never lost.
            if (hasKnownToken && !template.includes("{{loads}}") && loads.length) {
                output += `\n\nLoads Booked (${loads.length}):\n` +
                    this.formatLoadsForTemplate(loads, {
                        showOwner: isCombined,
                        forceAllDivisions: isCombined
                    });
            }

            return output;
        },

        renderPreview() {
            if (this.UI.preview) {
                this.UI.preview.textContent = this.buildReport();
            }
        },

        async copyToClipboard() {

            const text = this.buildReport();

            try {
                await navigator.clipboard.writeText(text);
                this.showCopyStatus("Copied ✔");
            } catch (err) {
                console.error("❌ Clipboard copy failed:", err);
                this.showCopyStatus("Copy failed");
            }
        },

        showCopyStatus(text) {

            if (!this.UI.copyStatus) return;

            this.UI.copyStatus.textContent = text;

            clearTimeout(this._copyStatusTimeout);
            this._copyStatusTimeout = setTimeout(() => {
                if (this.UI.copyStatus) this.UI.copyStatus.textContent = "";
            }, 2000);
        },

        // ===========================================
        // TEAM MEMBERS MODAL (V51 item 6)
        // ===========================================
        //
        // Read-only, report-generation-time only. Never merges
        // Firestore documents, never writes bookedLoads/shiftHistory
        // for anyone, never modifies another employee's data.

        listenToTeamMembers() {

            if (this.teamMembers.unsub) return;

            this.teamMembers.unsub = db.collection("users").onSnapshot(snapshot => {

                const users = [];

                snapshot.forEach(doc => {
                    if (doc.id === "A000") return; // admin account, not an employee
                    const data = doc.data() || {};
                    users.push({ id: doc.id, status: data.status || "Off Duty" });
                });

                this.teamMembers.allUsers = users;

                // keep the open modal's list live rather than stale
                if (this.UI.teamModal && !this.UI.teamModal.classList.contains("hidden")) {
                    this.renderTeamList();
                }
            });
        },

        openTeamModal() {

            if (!this.UI.teamModal) return;

            this.listenToTeamMembers();

            // the report creator is always included and can't be removed
            if (RelayDesk.currentUser) this.teamMembers.selected.add(RelayDesk.currentUser);

            this.renderTeamList();
            this.UI.teamModal.classList.remove("hidden");
        },

        closeTeamModal() {
            this.UI.teamModal?.classList.add("hidden");
        },

        // "Active employee" = anyone currently clocked in (any status
        // other than Off Duty) — the current user is always shown too,
        // even if for some reason their own status isn't loaded yet.
        renderTeamList() {

            if (!this.UI.teamList) return;

            const rows = this.teamMembers.allUsers
                .filter(u => u.id === RelayDesk.currentUser || u.status !== "Off Duty")
                .sort((a, b) => a.id.localeCompare(b.id));

            this.UI.teamList.innerHTML = rows.length
                ? rows.map(u => {

                    const isSelf = u.id === RelayDesk.currentUser;
                    const checked = isSelf || this.teamMembers.selected.has(u.id);

                    return `
                        <label class="teamMemberRow${isSelf ? " teamMemberSelf" : ""}">
                            <input type="checkbox" value="${u.id}"
                                ${checked ? "checked" : ""}
                                ${isSelf ? "disabled" : ""}>
                            ${u.id}${isSelf ? " (you)" : ""}
                        </label>
                    `;
                }).join("")
                : `<div class="workspaceEmpty">No active employees found.</div>`;
        },

        selectAllTeamMembers() {
            this.UI.teamList?.querySelectorAll("input[type=checkbox]").forEach(cb => {
                cb.checked = true;
            });
        },

        clearTeamSelection() {
            this.UI.teamList?.querySelectorAll("input[type=checkbox]").forEach(cb => {
                if (!cb.disabled) cb.checked = false; // current user stays checked
            });
        },

        async applyTeamSelection() {

            const checked = Array.from(
                this.UI.teamList?.querySelectorAll("input[type=checkbox]:checked") || []
            ).map(cb => cb.value);

            // Set() naturally prevents duplicate selections; currentUser
            // is force-included regardless of checkbox state
            const selected = new Set(checked);
            if (RelayDesk.currentUser) selected.add(RelayDesk.currentUser);

            this.teamMembers.selected = selected;
            this.closeTeamModal();

            if (this.UI.teamMembersStatus) {
                this.UI.teamMembersStatus.textContent = selected.size > 1
                    ? `Combined report: ${selected.size} employees`
                    : "";
            }

            await this.refreshTeamShiftData();
            this.renderPreview();
        },

        // Pulls each OTHER selected employee's current active shift
        // data (bookedLoads + notes) straight off their live "users"
        // doc — a READ only, used just for this report's generation.
        async refreshTeamShiftData() {

            const ids = Array.from(this.teamMembers.selected)
                .filter(id => id !== RelayDesk.currentUser);

            const data = {};

            await Promise.all(ids.map(async (id) => {
                try {
                    const doc = await db.collection("users").doc(id).get();
                    const d = doc.data() || {};

                    data[id] = {
                        bookedLoads: Array.isArray(d.bookedLoads) ? d.bookedLoads : [],
                        notes: d.notes || ""
                    };

                } catch (err) {
                    console.error("⚠️ Failed to load team member shift data:", id, err);
                    data[id] = { bookedLoads: [], notes: "" };
                }
            }));

            this.teamMembers.shiftData = data;
        }
    };

    window.addEventListener("DOMContentLoaded", () => {
        // Small delay so it mounts after the rest of the dashboard
        // (and RelayDesk.workspace) has had a chance to render.
        setTimeout(() => RelayDesk.reportFormatter.init(), 300);
    });

})();


// ===========================================
// SHIFT SYSTEM (FIXED)
// ===========================================

const SHIFT_WARNING_MS = 15 * 60 * 1000; // heads-up at 15 min remaining

let shiftInterval = null;
let shiftHandled = false;
let shiftWarningHandled = false;
let lastKnownShiftEndTime = null;

window.initializeWorkspace = function () {

    if (!RelayDesk.currentUser) {
        setTimeout(initializeWorkspace, 300);
        return;
    }

    loadWorkspace();

    if (shiftInterval) clearInterval(shiftInterval);

    shiftInterval = setInterval(updateShiftCountdown, 1000);
};


// ===========================================
// COUNTDOWN (FIXED)
// ===========================================

function updateShiftCountdown() {

    const el = document.getElementById("shiftCountdown");
    if (!el) return;

    if (!RelayDesk.shiftEndTime) {
        el.textContent = "--:--:--";
        return;
    }

    // FIX: detect a new shift (different, future shiftEndTime) and
    // re-arm shiftHandled so SHIFT_ENDED fires again for it
    if (
        RelayDesk.shiftEndTime !== lastKnownShiftEndTime &&
        RelayDesk.shiftEndTime > Date.now()
    ) {
        shiftHandled = false;
        shiftWarningHandled = false;
        lastKnownShiftEndTime = RelayDesk.shiftEndTime;

        // clear leftover "Shift Ended" text from the previous shift
        if (RelayDesk.workspace?.UI?.endedAt) {
            RelayDesk.workspace.UI.endedAt.textContent = "";
        }
    }

    const now = Date.now();
    const remaining = RelayDesk.shiftEndTime - now;

    el.textContent = formatTime(Math.max(remaining, 0));

    // ======================
    // SHIFT-END WARNING (heads-up before the hard stop)
    // ======================

    if (remaining > 0 && remaining <= SHIFT_WARNING_MS && !shiftWarningHandled) {

        shiftWarningHandled = true;

        if (typeof window.NotificationManager === "object") {
            window.NotificationManager.notify("⏳ 15 minutes left in your shift.", "warning", { category: "alerts" });
        } else if (typeof window.showToast === "function") {
            window.showToast("⏳ 15 minutes left in your shift.", "warn");
        }

        try {
            const audio = new Audio("assets/shift_warning_ping.mp3");
            audio.play().catch(() => {});
        } catch (e) {}
    }

    if (remaining <= 0 && !shiftHandled) {

        shiftHandled = true;

        // Shift-end automation: notifications -> Auto Break -> Auto Off
        // Duty if nobody clocks out. See shiftautomation.js for the full
        // sequence. Only meaningful if the employee is still (unattended)
        // On Duty — if they'd already put themselves on Break/Away,
        // nothing unfair is accumulating, so there's nothing to catch.
        window.beginShiftEndGrace?.();

        const endedAt = Date.now();

        if (RelayDesk.workspace?.UI?.endedAt) {
            RelayDesk.workspace.UI.endedAt.textContent =
                "Shift Ended: " + new Date(endedAt).toLocaleTimeString();
        }

        if (typeof logAudit === "function") {
            logAudit(RelayDesk.currentUser, "SHIFT_ENDED", "Auto end");
        }

        db.collection("auditLogs").add({
            user: RelayDesk.currentUser,
            action: "SHIFT_ENDED",
            detail: "Auto end",
            time: Date.now()
        });
    }
}


// ===========================================
// LOAD SHIFT META
// ===========================================
// NOTE: shift START/END is owned exclusively by status.js
// (changeUserStatus("On Duty") / "End Shift"). The old duplicate
// window.startShift()/saveWorkspace() writer pair that used to live
// here has been removed — it was dead code (never called from
// app.js, auth.js, or index.html) and was a second, out-of-sync
// source of truth for shiftStart/shiftEndTime that skipped the
// lateness/off-day checks status.js performs. This file now only
// ever READS shift state via loadWorkspace() below.

async function loadWorkspace() {

    const uid = RelayDesk.currentUser;
    if (!uid) return;

    const doc = await db.collection("users").doc(uid).get();
    if (!doc.exists) return;

    const data = doc.data() || {};

    RelayDesk.shiftStart = data.shiftStart || null;
    RelayDesk.shiftEndTime = data.shiftEndTime || null;
    RelayDesk.shiftId = data.shiftId || null;
    RelayDesk.overtimeBaseline = data.overtimeBaseline || null;
    RelayDesk.isOffDayShift = data.isOffDayShift || false;
    RelayDesk.bookedLoads = data.bookedLoads || [];
}


// -------------------------------
// BOOKED LOADS (V51 — single source of truth: RelayDesk.bookedLoads)
// -------------------------------
//
// RelayDesk.bookedLoads is the ONE array for the current shift's
// loads. It's kept live by startLoadsListener() (timers.js, onSnapshot
// on this employee's users/{uid} doc) and updated optimistically here
// on add/edit/delete so the UI never waits on a round trip. Every
// write still goes through RelayDesk.queue, which is what maintains
// the permanent per-shift shiftHistory.loadsLog ledger — that part
// already existed and isn't touched here.

// V-Phase2: "Division" is renamed to "Department" everywhere in the UI.
// The underlying Firestore field name stays `division` on purpose (kept
// backward compatible so no migration is needed on existing load docs) —
// only the label changes. LOAD_DIVISIONS is kept as an alias in case
// anything else in the app still references the old name.
window.LOAD_DEPARTMENTS = ["STS", "iTour", "Alquaiti", "F&F"];
window.LOAD_DIVISIONS = window.LOAD_DEPARTMENTS;

// Phase 2 item 6: VRID is a type dropdown (Trip / Load / Block-Contract)
// plus a separate free-text VRID number field (`vrid`) so a future
// Shift History Searcher can filter loads by VRID directly.
window.VRID_TYPES = ["Trip", "Load", "Block/Contract"];

// Phase 2 item 4: parses the Driver field. Typing "For <name>" strips
// the "For" keyword and keeps everything typed after it — including a
// last name — as the driver's name (e.g. "For Mahdi Harb" -> "Mahdi
// Harb"). If "For" wasn't typed, the raw text is used as-is so a bare
// name still works. Grouping matches driver names case-insensitively so
// "Mahdi" and "mahdi" land in the same bucket, so two loads for the same
// driver always group together regardless of exact casing.
window.parseDriverName = function (raw) {
    if (!raw) return "";
    let s = String(raw).trim();
    const m = s.match(/^for\s+(.+)$/i);
    if (m) s = m[1].trim();
    return s.replace(/\s+/g, " ");
};

// Phase 2 item 4: shared Department -> Driver -> VRID Type -> Loads
// grouping, used by both the employee's own Booked Loads list
// (renderBookedLoads below) and the Admin drilldown (admin.js
// toggleShiftLoads). Loads with no recognized department fall into
// "Other", no driver typed falls into "Unassigned", no VRID type
// selected falls into "Unspecified" — nothing gets silently dropped.
window.groupLoadsHierarchy = function (loads) {

    const NO_DEPT = "Other";
    const NO_DRIVER = "Unassigned";
    const NO_VRID = "Unspecified";

    const deptMap = new Map();

    (loads || []).forEach(l => {

        const dept = l.division && window.LOAD_DEPARTMENTS.includes(l.division) ? l.division : NO_DEPT;

        const driverRaw = (l.driver || "").trim();
        const driverKey = driverRaw ? driverRaw.toLowerCase() : NO_DRIVER;
        const driverLabel = driverRaw || NO_DRIVER;

        const vridType = l.vridType && window.VRID_TYPES.includes(l.vridType) ? l.vridType : NO_VRID;

        if (!deptMap.has(dept)) deptMap.set(dept, new Map());
        const driverMap = deptMap.get(dept);

        if (!driverMap.has(driverKey)) driverMap.set(driverKey, { label: driverLabel, vrids: new Map() });
        const driverEntry = driverMap.get(driverKey);

        if (!driverEntry.vrids.has(vridType)) driverEntry.vrids.set(vridType, []);
        driverEntry.vrids.get(vridType).push(l);
    });

    const deptOrder = [
        ...window.LOAD_DEPARTMENTS.filter(d => deptMap.has(d)),
        ...(deptMap.has(NO_DEPT) ? [NO_DEPT] : [])
    ];

    return deptOrder.map(dept => {

        const driverMap = deptMap.get(dept);

        const drivers = [...driverMap.entries()]
            .sort((a, b) => {
                // "Unassigned" always sorts last, everything else alphabetically
                if (a[1].label === NO_DRIVER) return 1;
                if (b[1].label === NO_DRIVER) return -1;
                return a[1].label.localeCompare(b[1].label);
            })
            .map(([, entry]) => {

                const vridOrder = [
                    ...window.VRID_TYPES.filter(v => entry.vrids.has(v)),
                    ...(entry.vrids.has(NO_VRID) ? [NO_VRID] : [])
                ];

                return {
                    driver: entry.label,
                    vridGroups: vridOrder.map(v => ({ vridType: v, loads: entry.vrids.get(v) }))
                };
            });

        return { department: dept, drivers };
    });
};

window.initializeBookedLoads = initializeBookedLoads;
window.renderBookedLoads = renderBookedLoads;

function initializeBookedLoads() {

    if (!RelayDesk.currentUser) {
        setTimeout(initializeBookedLoads, 300);
        return;
    }

    const btn = document.getElementById("addLoadBtn");
    if (!btn) return;

    btn.onclick = () => openLoadModal(null);

    bindLoadModal();
    bindLoadToolbar();

    // one live listener drives users.bookedLoads for this employee —
    // it fires immediately with whatever's cached/on the server, so
    // there's no need for a separate one-time fetch on top of it
    window.startLoadsListener?.();
}

// ===========================================
// LOAD TOOLBAR — sort + filters (Load Management, Phase 5)
// ===========================================
// Sort/filter choices live in localStorage (per-computer, same pattern
// as everything else here) rather than in ESMSettings, since these are
// live workspace state, not a fixed preference — Settings only controls
// the STARTING value (defaultLoadSorting) and whether a change made here
// should stick around ("Remember last-used sort order" / "...filters").

const LAST_LOAD_SORT_KEY = "esm_last_load_sort";
const LAST_LOAD_FILTERS_KEY = "esm_last_load_filters";

let loadToolbarUI = {};
let currentLoadSort = null;
let currentLoadFilters = { department: "", driver: "", vridType: "" };
let completedLoadsExpanded = null; // null = follow "Auto-collapse completed loads" setting

function getEffectiveLoadSort() {
    if (window.ESMSettings?.get("rememberLastLoadSort")) {
        try {
            const remembered = localStorage.getItem(LAST_LOAD_SORT_KEY);
            if (remembered) return remembered;
        } catch (e) {}
    }
    return window.ESMSettings?.get("defaultLoadSorting") || "Newest";
}

function getEffectiveLoadFilters() {
    if (window.ESMSettings?.get("rememberLastLoadFilters")) {
        try {
            const raw = localStorage.getItem(LAST_LOAD_FILTERS_KEY);
            if (raw) return { department: "", driver: "", vridType: "", ...JSON.parse(raw) };
        } catch (e) {}
    }
    return { department: "", driver: "", vridType: "" };
}

// Exposed so settings.js can drop the remembered override the instant
// "Remember last-used sort/filters" gets turned off, instead of it
// lingering until the next add/edit/delete happens to re-render.
window.clearRememberedLoadSort = function () {
    try { localStorage.removeItem(LAST_LOAD_SORT_KEY); } catch (e) {}
    currentLoadSort = window.ESMSettings?.get("defaultLoadSorting") || "Newest";
    if (loadToolbarUI.sort) loadToolbarUI.sort.value = currentLoadSort;
};

window.clearRememberedLoadFilters = function () {
    try { localStorage.removeItem(LAST_LOAD_FILTERS_KEY); } catch (e) {}
    currentLoadFilters = { department: "", driver: "", vridType: "" };
    if (loadToolbarUI.deptFilter) loadToolbarUI.deptFilter.value = "";
    if (loadToolbarUI.driverFilter) loadToolbarUI.driverFilter.value = "";
    if (loadToolbarUI.vridFilter) loadToolbarUI.vridFilter.value = "";
};

function bindLoadToolbar() {

    loadToolbarUI = {
        sort: document.getElementById("loadSortSelect"),
        deptFilter: document.getElementById("loadFilterDept"),
        driverFilter: document.getElementById("loadFilterDriver"),
        vridFilter: document.getElementById("loadFilterVrid"),
        toggleCompletedBtn: document.getElementById("toggleCompletedLoadsBtn")
    };

    if (!loadToolbarUI.sort || loadToolbarUI.bound) return;
    loadToolbarUI.bound = true;

    if (loadToolbarUI.deptFilter) {
        loadToolbarUI.deptFilter.innerHTML = `<option value="">All Departments</option>` +
            window.LOAD_DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join("");
    }
    if (loadToolbarUI.vridFilter) {
        loadToolbarUI.vridFilter.innerHTML = `<option value="">All VRID Types</option>` +
            window.VRID_TYPES.map(v => `<option value="${v}">${v}</option>`).join("");
    }

    currentLoadSort = getEffectiveLoadSort();
    currentLoadFilters = getEffectiveLoadFilters();

    loadToolbarUI.sort.value = currentLoadSort;
    if (loadToolbarUI.deptFilter) loadToolbarUI.deptFilter.value = currentLoadFilters.department || "";
    if (loadToolbarUI.vridFilter) loadToolbarUI.vridFilter.value = currentLoadFilters.vridType || "";

    loadToolbarUI.sort.addEventListener("change", () => {
        currentLoadSort = loadToolbarUI.sort.value;
        if (window.ESMSettings?.get("rememberLastLoadSort")) {
            try { localStorage.setItem(LAST_LOAD_SORT_KEY, currentLoadSort); } catch (e) {}
        }
        renderBookedLoads();
    });

    [loadToolbarUI.deptFilter, loadToolbarUI.driverFilter, loadToolbarUI.vridFilter].forEach(el => {
        el?.addEventListener("change", () => {
            currentLoadFilters = {
                department: loadToolbarUI.deptFilter?.value || "",
                driver: loadToolbarUI.driverFilter?.value || "",
                vridType: loadToolbarUI.vridFilter?.value || ""
            };
            if (window.ESMSettings?.get("rememberLastLoadFilters")) {
                try { localStorage.setItem(LAST_LOAD_FILTERS_KEY, JSON.stringify(currentLoadFilters)); } catch (e) {}
            }
            renderBookedLoads();
        });
    });

    loadToolbarUI.toggleCompletedBtn?.addEventListener("click", () => {
        completedLoadsExpanded = !completedLoadsExpanded;
        renderBookedLoads();
    });
}

// Rebuilds the Driver filter's option list from whatever drivers are
// actually present right now, keeping the currently-selected value if
// it still exists. Done every render (not just once) since which
// drivers exist changes as loads are added/edited.
function refreshDriverFilterOptions(loads) {
    if (!loadToolbarUI.driverFilter) return;

    const drivers = [...new Set(
        (loads || [])
            .map(l => (l.driver || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    const current = currentLoadFilters.driver || "";

    loadToolbarUI.driverFilter.innerHTML = `<option value="">All Drivers</option>` +
        drivers.map(d => `<option value="${d}">${d}</option>`).join("");

    loadToolbarUI.driverFilter.value = drivers.includes(current) ? current : "";
    if (!drivers.includes(current) && current) {
        currentLoadFilters.driver = "";
    }
}

function loadMatchesFilters(load) {
    if (currentLoadFilters.department && load.division !== currentLoadFilters.department) return false;
    if (currentLoadFilters.driver && (load.driver || "").trim() !== currentLoadFilters.driver) return false;
    if (currentLoadFilters.vridType && load.vridType !== currentLoadFilters.vridType) return false;
    return true;
}

// Settings feature: "Auto-collapse completed loads" (Load Management,
// Phase 5). There's no explicit "completed" status on a load — the
// active workspace list only ever holds the CURRENT shift's loads
// (status.js clears RelayDesk.bookedLoads to [] on End Shift), so any
// load whose shiftId doesn't match the shift that's active right now
// is a leftover from a previous shift that never got cleared out
// (offline queue catching up, a shift that ended abnormally, etc.) —
// i.e. "completed" for display purposes.
function isCompletedLoad(load) {
    return !!(load.shiftId && RelayDesk.shiftId && load.shiftId !== RelayDesk.shiftId);
}

function saveLoad(load) {

    const uid = RelayDesk.currentUser;
    if (!uid) return;

    // stamp the load with the shift it belongs to and when it was
    // booked — this is what lets its record survive in Shift
    // History even after it gets deleted from the live workspace
    load.shiftId = RelayDesk.shiftId || null;
    load.bookedAt = Date.now();
    load.active = true;

    // ---- optimistic local update (works fully offline) ----
    RelayDesk.bookedLoads = RelayDesk.bookedLoads || [];
    RelayDesk.bookedLoads.push(load);
    renderBookedLoads();

    // Settings feature: "Highlight newly booked loads" (Load Management).
    // Same reasoning as editLoad()'s timeout below — without this the
    // highlight would stick around indefinitely if nothing else happens
    // to trigger a re-render before the window expires.
    setTimeout(renderBookedLoads, NEWLY_BOOKED_WINDOW_MS + 500);

    // ---- queue the actual Firestore write for whenever we're online ----
    RelayDesk.queue.enqueue("ADD_LOAD", { uid, load });
}

function editLoad(loadId, changes) {

    const uid = RelayDesk.currentUser;
    if (!uid) return;

    const allLoads = RelayDesk.bookedLoads || [];
    const target = allLoads.find(l => l.id === loadId);

    // ---- optimistic local update ----
    // lastEditedAt drives the "Highlight recently edited loads" Settings
    // option in renderBookedLoads below; it's local-only bookkeeping and
    // isn't written to Firestore with the rest of `changes`.
    RelayDesk.bookedLoads = allLoads.map(l =>
        l.id === loadId ? { ...l, ...changes, lastEditedAt: Date.now() } : l
    );
    renderBookedLoads();

    // Settings feature: "Highlight recently edited loads" (Load Management).
    // renderBookedLoads() only re-checks the 5-minute window when it's
    // called for some other reason, so without this the highlight could
    // stick around indefinitely if nothing else triggers a re-render.
    // This just schedules the one re-render needed to let it expire on time.
    setTimeout(renderBookedLoads, 5 * 60 * 1000 + 500);

    // ---- queue the write (audit log fires inside the handler, once
    // the edit has actually reached Firestore) ----
    RelayDesk.queue.enqueue("EDIT_LOAD", {
        uid,
        loadId,
        changes,
        shiftId: target?.shiftId || RelayDesk.shiftId || null
    });
}

function deleteLoad(id) {

    const uid = RelayDesk.currentUser;
    if (!uid) return;

    // ===== PERMISSION SYSTEM =====
    if (!window.hasPermission?.("canDeleteLoads")) {
        alert("You don't have permission to delete loads.");
        return;
    }

    // Settings feature: "Confirm before deleting loads" (Load Management)
    if (window.ESMSettings?.get("confirmBeforeDeletingLoads")) {
        if (!confirm("Delete this load? This can't be undone.")) {
            return;
        }
    }

    // remember which shift this load belongs to BEFORE removing it,
    // so its record stays attached to the correct day even if the
    // employee is now on a different day's shift
    const allLoads = RelayDesk.bookedLoads || [];
    const target = allLoads.find(l => l.id === id);

    // ---- optimistic local update ----
    RelayDesk.bookedLoads = allLoads.filter(l => l.id !== id);
    renderBookedLoads();

    // frees the VRID for reuse now that this load is gone (Load
    // History feature) — best-effort, never blocks the delete itself
    if (target?.vrid) {
        window.releaseVrid?.(target.vrid);
    }

    // fall back to today's shift only for legacy loads booked before
    // this fix (which never got a shiftId stamped on them)
    const shiftId = target?.shiftId || RelayDesk.shiftId || null;

    // ---- queue the write ----
    RelayDesk.queue.enqueue("DELETE_LOAD", { uid, loadId: id, shiftId });
}

// "Recently" windows for the two highlight settings — kept short and
// distinct so the two states don't get confused: a newly-booked load
// fades back to normal quicker than a recently-edited one, and if a
// load is edited within its just-booked window, the edit visually wins
// (it's the most recent action taken on it).
const NEWLY_BOOKED_WINDOW_MS = 2 * 60 * 1000;
const RECENTLY_EDITED_WINDOW_MS = 5 * 60 * 1000;

function sortLoadsBy(loads, sortMode) {
    return [...loads].sort((a, b) => {
        if (sortMode === "VRID") return (a.vrid || "").localeCompare(b.vrid || "");
        if (sortMode === "Price") return (Number(b.price) || 0) - (Number(a.price) || 0);
        return (b.bookedAt || 0) - (a.bookedAt || 0); // Newest
    });
}

// Builds one load card. Shared by both the active list and the
// collapsed "completed" section below.
function buildLoadCard(load) {

    const div = document.createElement("div");
    div.className = "loadCard";

    const recentlyEdited = load.lastEditedAt && (Date.now() - load.lastEditedAt < RECENTLY_EDITED_WINDOW_MS);
    const newlyBooked = !recentlyEdited && load.bookedAt && (Date.now() - load.bookedAt < NEWLY_BOOKED_WINDOW_MS);

    // Settings feature: "Highlight recently edited loads" (Load Management).
    if (window.ESMSettings?.get("highlightRecentlyEditedLoads") && recentlyEdited) {
        div.classList.add("loadCardRecentlyEdited");
    }

    // Settings feature: "Highlight newly booked loads" (Load Management,
    // Phase 5). Distinct class/color from the "recently edited" one so
    // the two states read differently at a glance.
    if (window.ESMSettings?.get("highlightNewlyBookedLoads") && newlyBooked) {
        div.classList.add("loadCardNewlyBooked");
    }

    div.innerHTML = `
        <div><b>${load.date}</b></div>
        <div>💰 $${load.price}</div>
        ${load.vrid ? `<div class="loadVridBadge">🔢 ${load.vrid}</div>` : ""}
        <div>👤 ${load.bookedBy}</div>
        <div>${load.note || ""}</div>
        <div class="loadCardButtons">
            <button class="editLoadBtn smallButton">✏️ Edit</button>
            ${window.hasPermission?.("canDeleteLoads") ? `<button class="deleteLoadBtn">Delete</button>` : ""}
        </div>
    `;

    div.querySelector(".editLoadBtn").onclick =
        () => openLoadModal(load);

    div.querySelector(".deleteLoadBtn")?.addEventListener("click",
        () => deleteLoad(load.id));

    return div;
}

// Phase 2 item 4: renders the Department -> Driver -> VRID Type -> Loads
// grouped tree (shared groupLoadsHierarchy helper above) instead of a
// flat list of load cards. Department is now shown as a section header
// rather than a per-card badge, since it's the top grouping level.
function renderLoadGroupTree(rootEl, loads) {

    const grouped = window.groupLoadsHierarchy(loads);

    grouped.forEach(deptGroup => {

        const deptWrap = document.createElement("div");
        deptWrap.className = "loadGroupDept";
        deptWrap.innerHTML = `<div class="loadGroupDeptHeader">🏢 ${deptGroup.department}</div>`;

        deptGroup.drivers.forEach(driverGroup => {

            const driverWrap = document.createElement("div");
            driverWrap.className = "loadGroupDriver";
            driverWrap.innerHTML = `<div class="loadGroupDriverHeader">🚚 ${driverGroup.driver}</div>`;

            driverGroup.vridGroups.forEach(vg => {

                const vridWrap = document.createElement("div");
                vridWrap.className = "loadGroupVrid";
                vridWrap.innerHTML = `<div class="loadGroupVridHeader">🔖 ${vg.vridType} (${vg.loads.length})</div>`;

                vg.loads.forEach(load => vridWrap.appendChild(buildLoadCard(load)));

                driverWrap.appendChild(vridWrap);
            });

            deptWrap.appendChild(driverWrap);
        });

        rootEl.appendChild(deptWrap);
    });
}

function renderBookedLoads() {

    const container = document.getElementById("bookedLoads");
    if (!container) return;

    bindLoadToolbar();

    const rawLoads = RelayDesk.bookedLoads || [];
    const toolbarEl = document.getElementById("loadToolbar");

    container.innerHTML = "";

    if (!rawLoads.length) {
        toolbarEl?.classList.add("hidden");
        container.innerHTML =
            '<div class="workspaceEmpty">No booked loads.</div>';
        RelayDesk.reportFormatter?.refresh();
        return;
    }

    toolbarEl?.classList.remove("hidden");
    refreshDriverFilterOptions(rawLoads);

    // Settings feature: "Auto-collapse completed loads" (Load
    // Management, Phase 5) — see isCompletedLoad() above for what
    // "completed" means here.
    const completedRaw = rawLoads.filter(isCompletedLoad);
    const activeRaw = rawLoads.filter(l => !isCompletedLoad(l));

    // Settings feature: "Default sorting" (Load Management), overridden
    // live by the toolbar's Sort dropdown. Grouping by Department/
    // Driver/VRID Type still applies on top of this — sorting only
    // decides the order of loads *within* each of those groups.
    const sortMode = currentLoadSort || getEffectiveLoadSort();
    const activeSorted = sortLoadsBy(activeRaw, sortMode);
    const completedSorted = sortLoadsBy(completedRaw, sortMode);

    const activeFiltered = activeSorted.filter(loadMatchesFilters);
    const completedFiltered = completedSorted.filter(loadMatchesFilters);

    const filtersActive = !!(currentLoadFilters.department || currentLoadFilters.driver || currentLoadFilters.vridType);

    if (activeFiltered.length) {
        renderLoadGroupTree(container, activeFiltered);
    } else {
        container.innerHTML = `<div class="workspaceEmpty">${
            filtersActive ? "No loads match the current filters." : "No active loads."
        }</div>`;
    }

    // Completed (previous-shift) loads — collapsed by default per the
    // "Auto-collapse completed loads" setting, toggleable either way.
    const toggleBtn = document.getElementById("toggleCompletedLoadsBtn");

    if (completedFiltered.length) {
        toggleBtn?.classList.remove("hidden");

        const expanded = completedLoadsExpanded !== null
            ? completedLoadsExpanded
            : !window.ESMSettings?.get("autoCollapseCompletedLoads");

        if (toggleBtn) {
            toggleBtn.textContent = expanded
                ? `Hide completed (${completedFiltered.length})`
                : `Show completed (${completedFiltered.length})`;
        }

        if (expanded) {
            const completedWrap = document.createElement("div");
            completedWrap.className = "loadGroupCompleted";
            completedWrap.innerHTML = `<div class="loadGroupCompletedHeader">✅ Completed — previous shift(s)</div>`;
            renderLoadGroupTree(completedWrap, completedFiltered);
            container.appendChild(completedWrap);
        }
    } else {
        toggleBtn?.classList.add("hidden");
    }

    // Report Formatter's live preview always reflects whatever just
    // rendered here — add / edit / delete / cross-tab snapshot, all
    // covered from this single choke point.
    RelayDesk.reportFormatter?.refresh();
}


// ===========================================
// ONE REUSABLE LOAD MODAL (Add + Edit)
// ===========================================

let loadModalEditingId = null;
let loadModalOpen = false;
let loadModalUI = {};

function bindLoadModal() {

    if (loadModalUI.bound) return;

    loadModalUI = {
        bound: true,
        overlay: document.getElementById("loadModal"),
        title: document.getElementById("loadModalTitle"),
        date: document.getElementById("loadModalDate"),
        price: document.getElementById("loadModalPrice"),
        department: document.getElementById("loadModalDepartment"),
        driver: document.getElementById("loadModalDriver"),
        vridType: document.getElementById("loadModalVridType"),
        vridNumber: document.getElementById("loadModalVridNumber"),
        note: document.getElementById("loadModalNote"),
        dateError: document.getElementById("loadModalDateError"),
        priceError: document.getElementById("loadModalPriceError"),
        departmentError: document.getElementById("loadModalDepartmentError"),
        vridNumberError: document.getElementById("loadModalVridNumberError"),
        saveBtn: document.getElementById("loadModalSaveBtn"),
        cancelBtn: document.getElementById("loadModalCancelBtn")
    };

    if (!loadModalUI.overlay) return;

    loadModalUI.saveBtn?.addEventListener("click", saveLoadModal);
    loadModalUI.cancelBtn?.addEventListener("click", closeLoadModal);
}

function openLoadModal(load) {

    if (RelayDesk.currentUserData?.frozen) {
        alert("Account frozen — action blocked");
        return;
    }

    if (load && !window.hasPermission?.("canEditLoads")) {
        alert("You don't have permission to edit loads.");
        return;
    }

    bindLoadModal();
    if (!loadModalUI.overlay) return;

    loadModalEditingId = load ? load.id : null;

    if (loadModalUI.title) {
        loadModalUI.title.textContent = load ? "✏️ Edit Load" : "📦 Add Load";
    }

    if (loadModalUI.date) loadModalUI.date.value = load?.date || "";
    if (loadModalUI.price) loadModalUI.price.value = load?.price || "";
    if (loadModalUI.department) loadModalUI.department.value = load?.division || "";
    if (loadModalUI.driver) loadModalUI.driver.value = load?.driver || "";
    if (loadModalUI.vridType) loadModalUI.vridType.value = load?.vridType || "";
    if (loadModalUI.vridNumber) loadModalUI.vridNumber.value = load?.vrid || "";
    if (loadModalUI.note) loadModalUI.note.value = load?.note || "";

    clearLoadModalErrors();

    loadModalOpen = true;
    loadModalUI.overlay.classList.remove("hidden");
    loadModalUI.overlay.style.display = "flex";
    loadModalUI.overlay.setAttribute("aria-hidden", "false");
}

function closeLoadModal() {
    const overlay = loadModalUI.overlay;

    if (overlay) {
        loadModalOpen = false;
        overlay.classList.add("hidden");
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
        overlay.dispatchEvent(new CustomEvent("modal:close", { bubbles: true }));
    }

    loadModalUI.saveBtn?.removeAttribute("disabled");
    loadModalUI.saveBtn?.classList.remove("is-disabled");
    clearLoadModalErrors();
    document.activeElement?.blur();
    loadModalEditingId = null;
}

function clearLoadModalErrors() {

    [loadModalUI.date, loadModalUI.price, loadModalUI.department, loadModalUI.vridNumber].forEach(el =>
        el?.classList.remove("fieldError"));

    [loadModalUI.dateError, loadModalUI.priceError, loadModalUI.departmentError, loadModalUI.vridNumberError].forEach(el => {
        if (el) el.textContent = "";
    });
}

function validateLoadModal() {

    clearLoadModalErrors();

    let valid = true;

    const date = loadModalUI.date?.value?.trim();
    const price = loadModalUI.price?.value;
    const department = loadModalUI.department?.value;

    if (!date) {
        loadModalUI.date?.classList.add("fieldError");
        if (loadModalUI.dateError) loadModalUI.dateError.textContent = "Date is required.";
        valid = false;
    }

    if (!price || isNaN(price) || Number(price) <= 0) {
        loadModalUI.price?.classList.add("fieldError");
        if (loadModalUI.priceError) loadModalUI.priceError.textContent = "Enter a valid price.";
        valid = false;
    }

    if (!department || !window.LOAD_DEPARTMENTS.includes(department)) {
        loadModalUI.department?.classList.add("fieldError");
        if (loadModalUI.departmentError) loadModalUI.departmentError.textContent = "Select a department.";
        valid = false;
    }

    // Driver is still a fully optional enhancement (Phase 2 item 4) —
    // no validation enforced on it.

    // Load History feature: VRID is now the permanent, searchable
    // Load ID, so every NEW load must have one (existing loads that
    // predate this requirement keep working as-is — see
    // loadhistory.js's backfill). Editing an old load that doesn't
    // have a VRID yet still doesn't force one here, so that flow
    // isn't disrupted; but if a VRID IS typed, it always has to be
    // unique (checked async in saveLoadModal, not here).
    const vridNumber = loadModalUI.vridNumber?.value?.trim();

    if (!loadModalEditingId && !vridNumber) {
        loadModalUI.vridNumber?.classList.add("fieldError");
        if (loadModalUI.vridNumberError) loadModalUI.vridNumberError.textContent = "VRID (Load ID) is required.";
        valid = false;
    }

    return valid;
}

async function saveLoadModal() {

    if (!validateLoadModal()) return;

    const date = loadModalUI.date.value.trim();
    const price = loadModalUI.price.value;
    // Kept as `division` on the load object/Firestore for backward
    // compatibility (Phase 2 item 5) — only the UI label is "Department".
    const division = loadModalUI.department.value;
    const note = loadModalUI.note?.value?.trim() || "";
    const driver = window.parseDriverName(loadModalUI.driver?.value || "");
    const vridType = loadModalUI.vridType?.value || "";
    const vrid = loadModalUI.vridNumber?.value?.trim() || "";

    // Load History feature: VRID doubles as the permanent, searchable
    // Load ID, so it must be unique across every load ever booked.
    // Only checked when a VRID is actually present (required on
    // create, still optional when editing a pre-existing load that
    // never had one) and only re-checked on edit if it actually
    // changed, so untouched VRIDs never get re-validated/re-reserved.
    const existingLoad = loadModalEditingId
        ? (RelayDesk.bookedLoads || []).find(l => l.id === loadModalEditingId)
        : null;

    const vridChanged = vrid && vrid !== (existingLoad?.vrid || "");

    if (vridChanged) {

        if (loadModalUI.saveBtn) loadModalUI.saveBtn.disabled = true;

        let reserved = false;

        try {
            reserved = await window.reserveVrid(vrid, {
                loadId: loadModalEditingId || null,
                uid: RelayDesk.currentUser
            });
        } catch (err) {
            console.error("VRID uniqueness check failed:", err);
            if (loadModalUI.saveBtn) loadModalUI.saveBtn.disabled = false;
            loadModalUI.vridNumber?.classList.add("fieldError");
            if (loadModalUI.vridNumberError) {
                loadModalUI.vridNumberError.textContent = "Couldn't verify VRID uniqueness — check your connection and try again.";
            }
            return;
        }

        if (loadModalUI.saveBtn) loadModalUI.saveBtn.disabled = false;

        if (!reserved) {
            loadModalUI.vridNumber?.classList.add("fieldError");
            if (loadModalUI.vridNumberError) {
                loadModalUI.vridNumberError.textContent = "That VRID is already in use on another load.";
            }
            return;
        }

        // freed up now that the new VRID is reserved — never on
        // create (nothing to release yet)
        if (existingLoad?.vrid) {
            window.releaseVrid(existingLoad.vrid);
        }
    }

    if (loadModalEditingId) {

        editLoad(loadModalEditingId, { date, price, division, note, driver, vridType, vrid, editedAt: Date.now() });

    } else {

        saveLoad({
            id: Date.now(),
            date,
            price,
            division,
            driver,
            vridType,
            vrid,
            bookedBy: RelayDesk.currentUser,
            note
        });
    }

    closeLoadModal();
}

// -------------------------------
// BOOT
// -------------------------------

window.addEventListener("DOMContentLoaded", () => {
    initializeBookedLoads();
});