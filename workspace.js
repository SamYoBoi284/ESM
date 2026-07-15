// ===========================================
// RelayDesk V22 (FIXED)
// workspace.js
// ===========================================

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    // Phase 11, batch 3/4: confirm()/toast/alert/save-status strings via shared I18N.
    if (window.I18N) {
        window.I18N.register("workspace", {
            en: {
                confirmDeleteLoad: "Delete this load? This can't be undone.",
                savingNotes: "Saving...",
                notesSaved: "Saved ✔",
                notesSaveFailed: "Save Failed",
                shiftEndingSoon: "⏳ 15 minutes left in your shift.",
                noPermissionDeleteLoad: "You don't have permission to delete loads.",
                noPermissionEditLoad: "You don't have permission to edit loads.",
                loadSaveFailed: "Failed to save load — check your connection.",
                shiftEndPromptQuestion: "Your scheduled shift has ended. Are you continuing to work today?",
                shiftEndPromptStartOvertime: "Start Overtime",
                shiftEndPromptDecline: "No, I'm done for today"
            },
            ar: {
                confirmDeleteLoad: "حذف هذه الشحنة؟ لا يمكن التراجع عن هذا الإجراء.",
                savingNotes: "جارٍ الحفظ...",
                notesSaved: "تم الحفظ ✔",
                notesSaveFailed: "فشل الحفظ",
                shiftEndingSoon: "⏳ تبقّى 15 دقيقة على انتهاء ورديتك.",
                noPermissionDeleteLoad: "ليس لديك صلاحية لحذف الشحنات.",
                noPermissionEditLoad: "ليس لديك صلاحية لتعديل الشحنات.",
                loadSaveFailed: "فشل حفظ الشحنة — تحقق من الاتصال.",
                shiftEndPromptQuestion: "انتهت ورديتك المجدولة. هل ستستمر بالعمل اليوم؟",
                shiftEndPromptStartOvertime: "بدء العمل الإضافي",
                shiftEndPromptDecline: "لا، انتهيت لهذا اليوم"
            }
        });
    }

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
            this.showSaveStatus(window.I18N ? window.I18N.t("workspace.savingNotes") : "Saving...");

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

        this.showSaveStatus(window.I18N ? window.I18N.t("workspace.notesSaved") : "Saved ✔");

    } catch (err) {
        console.error(err);
        this.showSaveStatus(window.I18N ? window.I18N.t("workspace.notesSaveFailed") : "Save Failed");
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

        // Template 1 — the fixed, uneditable default. Phase 4 item 5:
        // this is always available in the template dropdown and can no
        // longer be overwritten in place (that's what the two Custom
        // slots below are for).
        DEFAULT_TEMPLATE:
`End of Shift Report — {{date}}
{{user}}
Shift: {{shiftStart}} - {{shiftEnd}}

Loads Booked ({{loadCount}}):
{{loads}}

Notes:
{{notes}}`,

        // Recognized placeholders — used both to fill the template and
        // (Phase 4 item 6) to auto-detect whether a pasted Custom
        // template is usable at all.
        KNOWN_TOKENS: [
            "{{date}}", "{{user}}", "{{shiftStart}}", "{{shiftEnd}}",
            "{{loadCount}}", "{{loads}}", "{{notes}}"
        ],

        TEMPLATE_SLOTS: ["template1", "custom1", "custom2"],

        // Phase 4 items 5+6: which template is active, plus the raw
        // pasted text for the two Custom slots. Template 1 itself is
        // never stored here — it's always DEFAULT_TEMPLATE. Saved
        // per-user in Firestore (`reportTemplates` +
        // `activeReportTemplate` on the user doc), not per-browser —
        // this replaces the old localStorage-only single template.
        templateState: {
            active: "template1",
            custom1: "",
            custom2: ""
        },

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

            // Paint Template 1 immediately so the panel never shows a
            // blank textarea while the Firestore read below is in
            // flight, then swap in the user's actual saved slot/state
            // once it resolves.
            this.applyActiveTemplateToUI();
            this.loadTemplateState().then(() => this.renderPreview());

            this.autoLoadShiftData().then(() => this.renderPreview());
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
                <div class="panelCollapseHeader">
                    <h3>📄 End-of-Shift Report Formatter</h3>
                    <button type="button" id="reportFormatterToggleBtn" class="panelCollapseToggleBtn" aria-expanded="true" aria-controls="reportFormatterBody" title="Collapse">▾</button>
                </div>

                <div id="reportFormatterBody">

                    <label for="reportTemplateInput">Report Template Format</label>
                    <textarea id="reportTemplateInput" rows="6"
                        placeholder="Paste your report template here. Use {{date}}, {{user}}, {{shiftStart}}, {{shiftEnd}}, {{loadCount}}, {{loads}}, {{notes}} as placeholders."></textarea>
                    <div id="reportTemplateFallbackNotice" class="reportTemplateFallbackNotice hidden">⚠️ This custom template has no recognized placeholders, so Template 1 is being used instead.</div>

                    <div class="reportFormatterRow">
                        <select id="reportTemplateSelect" class="reportTemplateSelect">
                            <option value="template1">Template 1 (Default)</option>
                            <option value="custom1">Custom Template 1</option>
                            <option value="custom2">Custom Template 2</option>
                        </select>
                        <button id="reportAutoLoadBtn" class="smallButton" type="button">🔄 Auto-Load Today's Shift Data</button>
                    </div>
                    <div class="reportDeptNotesGrid">
                        ${window.LOAD_DEPARTMENTS.map(dept => `
                            <div class="reportDeptNoteField">
                                <label for="reportDeptNotes_${this.deptFieldId(dept)}">${dept}</label>
                                <textarea id="reportDeptNotes_${this.deptFieldId(dept)}" rows="3"
                                    data-dept="${dept}"
                                    placeholder="Notes specific to ${dept}..."></textarea>
                            </div>
                        `).join("")}
                    </div>

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

                </div>
            `;
        },

        cacheUI() {

            this.UI = {
                template: document.getElementById("reportTemplateInput"),
                templateSelect: document.getElementById("reportTemplateSelect"),
                templateFallbackNotice: document.getElementById("reportTemplateFallbackNotice"),
                preview: document.getElementById("reportPreview"),
                autoLoadBtn: document.getElementById("reportAutoLoadBtn"),
                copyBtn: document.getElementById("reportCopyBtn"),
                copyStatus: document.getElementById("reportCopyStatus"),

                deptNotes: {},

                teamMembersBtn: document.getElementById("reportTeamMembersBtn"),
                teamMembersStatus: document.getElementById("reportTeamMembersStatus"),
                teamModal: document.getElementById("teamMembersModal"),
                teamList: document.getElementById("teamMembersList"),
                teamSelectAllBtn: document.getElementById("teamMembersSelectAllBtn"),
                teamClearBtn: document.getElementById("teamMembersClearBtn"),
                teamApplyBtn: document.getElementById("teamMembersApplyBtn"),
                teamCancelBtn: document.getElementById("teamMembersCancelBtn")
            };

            window.LOAD_DEPARTMENTS.forEach(dept => {
                this.UI.deptNotes[dept] = document.getElementById(`reportDeptNotes_${this.deptFieldId(dept)}`);
            });
        },

        // "F&F" isn't a safe DOM id character-for-character, so this maps
        // each department name to a safe id suffix. Only "F&F" actually
        // needs remapping today, but this stays generic for any future
        // department name with special characters.
        deptFieldId(dept) {
            return dept.replace(/[^a-zA-Z0-9]/g, "");
        },

        bindEvents() {

            window.bindPanelCollapseToggle?.(
                "reportFormatterToggleBtn",
                "reportFormatterBody",
                "relaydesk_collapse_reportFormatter"
            );

            this.UI.template?.addEventListener("input", () => {
                // Template 1 is rendered read-only, but guard here too
                // in case the readonly attribute gets bypassed somehow
                // — it must never be overwritten in place.
                if (this.templateState.active === "template1") return;

                this.templateState[this.templateState.active] = this.UI.template.value;
                this.queueTemplateStateSave();
                this.renderPreview();
            });

            this.UI.templateSelect?.addEventListener("change", () => {
                const value = this.UI.templateSelect.value;
                this.templateState.active = this.TEMPLATE_SLOTS.includes(value) ? value : "template1";
                this.applyActiveTemplateToUI();
                this.saveTemplateState(); // discrete action — save immediately, no debounce
                this.renderPreview();
            });

            Object.values(this.UI.deptNotes).forEach(el => {
                el?.addEventListener("input", () => {
                    this.queueDeptNotesSave();
                    this.renderPreview();
                });
            });

            this.UI.autoLoadBtn?.addEventListener("click", async () => {
                await this.autoLoadShiftData();

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

        // Phase 4 items 5+6: template state (active slot + the two
        // Custom slots' pasted text) is a per-USER preference now, not
        // per-browser — saved on the user's own Firestore doc so it
        // follows them across devices, same pattern as deptNotes below.
        loadTemplateState() {

            if (!RelayDesk.currentUser) return Promise.resolve();

            return db.collection("users").doc(RelayDesk.currentUser).get()
                .then(doc => {

                    const data = doc.exists ? (doc.data() || {}) : {};
                    const saved = data.reportTemplates || {};

                    this.templateState.custom1 = saved.custom1 || "";
                    this.templateState.custom2 = saved.custom2 || "";
                    this.templateState.active = this.TEMPLATE_SLOTS.includes(data.activeReportTemplate)
                        ? data.activeReportTemplate
                        : "template1";

                    this.applyActiveTemplateToUI();
                })
                .catch(err => {
                    console.error("⚠️ Failed to load report templates:", err);
                });
        },

        queueTemplateStateSave() {
            clearTimeout(this._templateSaveTimeout);
            this._templateSaveTimeout = setTimeout(() => this.saveTemplateState(), 1200);
        },

        saveTemplateState() {

            if (!RelayDesk.currentUser) return;

            RelayDesk.queue.enqueue("FIRESTORE_MERGE", {
                collection: "users",
                docId: RelayDesk.currentUser,
                data: {
                    activeReportTemplate: this.templateState.active,
                    reportTemplates: {
                        custom1: this.templateState.custom1,
                        custom2: this.templateState.custom2
                    }
                }
            }, { dedupeKey: `reportTemplates:${RelayDesk.currentUser}` });
        },

        // Paints the dropdown + textarea to match templateState.active.
        // Template 1 is always DEFAULT_TEMPLATE and always read-only;
        // Custom 1/2 show whatever's been pasted into that slot (or
        // blank) and are freely editable.
        applyActiveTemplateToUI() {

            if (this.UI.templateSelect) {
                this.UI.templateSelect.value = this.templateState.active;
            }

            if (this.UI.template) {

                const isDefault = this.templateState.active === "template1";

                this.UI.template.value = isDefault
                    ? this.DEFAULT_TEMPLATE
                    : (this.templateState[this.templateState.active] || "");

                this.UI.template.readOnly = isDefault;
                this.UI.template.classList.toggle("reportTemplateReadOnly", isDefault);
            }
        },

        // Re-pulls the current user's own saved department notes from
        // Firestore into the 4 fields (in case they were edited on
        // another device/tab since this page loaded). Team members'
        // department notes are refreshed separately by
        // refreshTeamShiftData(), called right after this by the
        // Auto-Load button's click handler when Team Members mode is on.
        async autoLoadShiftData() {
            await this.loadOwnDeptNotes();
        },

        // Fetches deptNotes off the current user's own doc and populates
        // the 4 textareas. Called once on init(), and again whenever the
        // Auto-Load button is pressed.
        async loadOwnDeptNotes() {

            if (!RelayDesk.currentUser) return;

            try {
                const doc = await db.collection("users").doc(RelayDesk.currentUser).get();
                const data = doc.exists ? (doc.data() || {}) : {};
                const saved = data.deptNotes || {};

                window.LOAD_DEPARTMENTS.forEach(dept => {
                    const el = this.UI.deptNotes[dept];
                    if (el) el.value = saved[dept] || "";
                });

            } catch (err) {
                console.error("⚠️ Failed to load department notes:", err);
            }
        },

        // Reads the CURRENT values straight out of the 4 textareas —
        // always live, same principle as RelayDesk.bookedLoads never
        // being cached for the report creator's own data.
        getCurrentDeptNotes() {
            const out = {};
            window.LOAD_DEPARTMENTS.forEach(dept => {
                out[dept] = this.UI.deptNotes[dept]?.value || "";
            });
            return out;
        },

        // Debounced save, mirroring RelayDesk.workspace's
        // queueSave()/saveNotes() pattern for the general notes box.
        queueDeptNotesSave() {
            clearTimeout(this._deptNotesSaveTimeout);
            this._deptNotesSaveTimeout = setTimeout(() => this.saveDeptNotes(), 1200);
        },

        saveDeptNotes() {

            if (!RelayDesk.currentUser) return;

            const deptNotes = this.getCurrentDeptNotes();

            RelayDesk.queue.enqueue("FIRESTORE_MERGE", {
                collection: "users",
                docId: RelayDesk.currentUser,
                data: { deptNotes }
            }, { dedupeKey: `deptNotes:${RelayDesk.currentUser}` });
        },

        // Order departments should appear in on the report; anything
        // with no department (legacy loads) falls into "Other" at the end.
        // (Renamed from DIVISION_ORDER — Phase 2 item 5. Kept as a plain
        // mirror of window.LOAD_DEPARTMENTS + "Other" for anything that
        // still references this property.)
        DEPARTMENT_ORDER: ["STS", "iTour", "Alquaiti", "F&F", "Other"],

        // Per-department note formatter — resolves the note text to show
        // under one department's section of the report.
        //
        // Solo mode (selectedIds.length <= 1): returns that one employee's
        // own value from the 4 department textareas, trimmed, or "" if
        // empty — no employee-code prefix (there's only one author).
        //
        // Combined/Team-Members mode: for every selected employee with a
        // non-empty note for this department, emits one line formatted
        // exactly like a load's owner prefix (`{code} | ...`) — e.g.
        // "A009 | my notes here". Multiple employees' lines are joined
        // with a single newline, no blank-line separation, no per-employee
        // sub-header (this deliberately does NOT mirror
        // formatCombinedNotes()'s blockier style used for the general
        // Notes section — the user asked for this to look like the
        // existing multi-employee LOAD lines instead).
        // Returns "" if nobody wrote anything for this department.
        formatDeptNoteBlock(dept, selectedIds = []) {

            const ids = selectedIds.length ? selectedIds : [RelayDesk.currentUser];

            if (ids.length <= 1) {
                const id = ids[0];
                const text = (id === RelayDesk.currentUser
                    ? this.getCurrentDeptNotes()[dept]
                    : (this.getTeamMemberShiftData(id).deptNotes || {})[dept]) || "";
                return text.trim();
            }

            const lines = ids
                .map(id => {
                    const text = (this.getTeamMemberShiftData(id).deptNotes?.[dept] || "").trim();
                    return text ? `${id} | ${text}` : null;
                })
                .filter(Boolean);

            return lines.join("\n");
        },

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
        // skip-if-empty behavior, EXCEPT that a department with no loads
        // but a typed note is still shown so the note isn't lost).
        // opts.selectedIds: which employee code(s) to pull department
        // notes from (passed straight to formatDeptNoteBlock).
        formatLoadsForTemplate(loads, opts = {}) {

            const { showOwner = false, forceAllDivisions = false, selectedIds = [] } = opts;

            const DIVIDER = "━━━━━━━━━━━━━━━━━━━━";

            const formatLine = (l) => {
                const owner = showOwner ? `${l.bookedByCode} | ` : "";
                const vridTag = l.vrid ? ` | VRID: ${l.vrid}` : "";
                const perMileTag = l.pricePerMile ? ` ($${l.pricePerMile}/mi)` : "";
                // Trip VRIDs hide From/To in the Add Load modal in favor of
                // the multi-stop list (onLoadModalVridTypeChange), so a Trip
                // load's `from`/`to` are always empty — its optional "Show
                // these stops in the End-of-Shift Report" toggle fills the
                // exact same field/position a Load or Block/Contract's
                // From/To would occupy on this line, instead of From/To.
                const hasStops = l.includeStopsInReport && Array.isArray(l.stops) && l.stops.length;
                const routeTag = hasStops
                    ? ` | 🛑 ${l.stops.join(" → ")}`
                    : (l.from || l.to) ? ` | ${l.from || "?"} → ${l.to || "?"}` : "";
                return `• ${owner}${l.date} | $${l.price}${perMileTag}${routeTag}${vridTag}${l.note ? " | " + l.note : ""}`;
            };

            const grouped = window.groupLoadsHierarchy(loads);
            const groupedMap = new Map(grouped.map(g => [g.department, g]));

            // A named department (STS/iTour/Alquaiti/F&F) is shown even
            // with zero loads if either forceAllDivisions is set (combined
            // report — always shows all 4), or it has a non-empty note
            // (so a note typed for a department nobody booked loads in
            // still surfaces on the solo report instead of being dropped).
            const departmentsToShow = forceAllDivisions
                ? [...window.LOAD_DEPARTMENTS, ...(groupedMap.has("Other") ? ["Other"] : [])]
                : [
                    ...window.LOAD_DEPARTMENTS.filter(d => groupedMap.has(d) || this.formatDeptNoteBlock(d, selectedIds)),
                    ...(groupedMap.has("Other") ? ["Other"] : [])
                ];

            if (!loads.length && !departmentsToShow.length) return "No booked loads recorded.";

            const sections = departmentsToShow.map(dept => {

                const group = groupedMap.get(dept);
                const noteBlock = this.formatDeptNoteBlock(dept, selectedIds);

                if (!group || !group.drivers.length) {
                    const noteLine = noteBlock || "No updates were provided for this department.";
                    return `${dept}\nNo loads were booked for this department.\n${noteLine}`;
                }

                let total = 0;

                const driverBlocks = group.drivers.map(d => {

                    const vridBlocks = d.vridGroups.map(vg => {
                        total += vg.loads.length;
                        // Optional per-load "Show these stops in the
                        // End-of-Shift Report" toggle (Add Load modal, Trip
                        // VRIDs only) is now handled inline inside
                        // formatLine() itself, in the same field From/To
                        // would occupy — no separate stops block here.
                        const lines = vg.loads.map(formatLine).join("\n");
                        const header = `  ${vg.vridType} (${vg.loads.length})`;
                        return `${header}\n${lines}`;
                    }).join("\n");

                    return ` Driver: ${d.driver}\n${vridBlocks}`;
                }).join("\n\n");

                const notesSuffix = noteBlock ? `\nNotes:\n${noteBlock}` : "";

                return `${dept} (${total})\n${driverBlocks}${notesSuffix}`;
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
        // employee's ASSIGNED shift.
        // STEP 5 CUTOVER: reads RelayDesk.currentUserShift (new Shift
        // Management system, resolved at login / kept live via
        // shiftsChanged — see auth.js) instead of the old
        // assignedShift key + SHIFT_CYCLES + hardcoded 9-hour end.
        // e.g. a shift configured 4:00-9:00 now correctly shows
        // start "4:00 AM" / end "9:00 AM" (whatever its own configured
        // end actually is) instead of always start+9hrs.
        getAssignedShiftTimes() {

            const shift = RelayDesk.currentUserShift;
            if (!shift) return { start: "--", end: "--" };

            const parseHM = (str) => {
                const [h, m] = (str || "00:00").split(":").map(Number);
                return { h: h || 0, m: m || 0 };
            };

            const s = parseHM(shift.startTime);
            const e = parseHM(shift.endTime);

            const start = new Date(2000, 0, 1, s.h, s.m);
            const end = new Date(2000, 0, 1, e.h, e.m);

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
                    notes: RelayDesk.workspace?.UI?.notes?.value || "",
                    deptNotes: this.getCurrentDeptNotes()
                };
            }

            return this.teamMembers.shiftData?.[id] || { bookedLoads: [], notes: "", deptNotes: {} };
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
        // Phase 4 item 6: a Custom slot only gets used as-is if it
        // actually contains at least one recognized {{placeholder}}.
        // An empty slot, or one pasted in without any known token,
        // falls back to Template 1 instead — surfaced to the employee
        // via the fallback notice in renderPreview().
        resolveActiveTemplateText() {

            if (this.templateState.active === "template1") {
                return { text: this.DEFAULT_TEMPLATE, fellBack: false };
            }

            const custom = this.templateState[this.templateState.active] || "";
            const hasKnownToken = this.KNOWN_TOKENS.some(t => custom.includes(t));

            if (!custom.trim() || !hasKnownToken) {
                return { text: this.DEFAULT_TEMPLATE, fellBack: true };
            }

            return { text: custom, fellBack: false };
        },

        buildReport() {

            const { text: template, fellBack } = this.resolveActiveTemplateText();
            this._lastTemplateFallback = fellBack;

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
                // General ("green box") notes are read live, same as the
                // current-user branch of getTeamMemberShiftData — the
                // department textareas are a separate concern now and no
                // longer feed {{notes}}.
                notesToken = RelayDesk.workspace?.UI?.notes?.value || "";
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
                    forceAllDivisions: isCombined,
                    selectedIds
                }),
                "{{notes}}": notesToken
            };

            const hasKnownToken = Object.keys(tokens)
                .some(token => template.includes(token));

            if (!template.trim()) {
                return notesToken;
            }

            let output = template;

            for (const [token, value] of Object.entries(tokens)) {
                output = output.split(token).join(value);
            }

            // If the pasted template doesn't use any recognized
            // placeholders at all, treat it as a header and append
            // the general notes underneath rather than silently dropping
            // them.
            if (!hasKnownToken && notesToken.trim()) {
                output += "\n\n" + notesToken;
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
                        forceAllDivisions: isCombined,
                        selectedIds
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
        // data (bookedLoads + notes + deptNotes) straight off their live
        // "users" doc — a READ only, used just for this report's
        // generation.
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
                        notes: d.notes || "",
                        deptNotes: d.deptNotes || {}
                    };

                } catch (err) {
                    console.error("⚠️ Failed to load team member shift data:", id, err);
                    data[id] = { bookedLoads: [], notes: "", deptNotes: {} };
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
            window.NotificationManager.notify(window.I18N ? window.I18N.t("workspace.shiftEndingSoon") : "⏳ 15 minutes left in your shift.", "warning", { category: "alerts" });
        } else if (typeof window.showToast === "function") {
            window.showToast(window.I18N ? window.I18N.t("workspace.shiftEndingSoon") : "⏳ 15 minutes left in your shift.", "warn");
        }

        try {
            const audio = new Audio("assets/shift_warning_ping.mp3");
            audio.play().catch(() => {});
        } catch (e) {}
    }

    if (remaining <= 0 && !shiftHandled) {

        shiftHandled = true;

        // Step 2: the normal shift now actually gets closed out the
        // moment the countdown hits zero — shiftHistory write, timer
        // reset, status -> Off Duty — instead of just logging an
        // audit line and leaving everything running. See
        // finalizeNormalShiftEnd() / showShiftEndContinuePrompt() /
        // startOvertimeFromShiftEndPrompt() in status.js for the rest
        // of the flow this kicks off.
        if (typeof window.finalizeNormalShiftEnd === "function") {
            window.finalizeNormalShiftEnd({ thenPrompt: true });
        } else {
            // Safety fallback: if status.js somehow hasn't loaded this
            // function, fall back to at least logging it like before
            // rather than silently doing nothing.
            const endedAt = Date.now();

            if (RelayDesk.workspace?.UI?.endedAt) {
                RelayDesk.workspace.UI.endedAt.textContent =
                    "Shift Ended: " + new Date(endedAt).toLocaleTimeString();
            }

            if (typeof logAudit === "function") {
                logAudit(RelayDesk.currentUser, "SHIFT_ENDED", "Auto end (fallback — finalizeNormalShiftEnd missing)");
            }

            db.collection("auditLogs").add({
                user: RelayDesk.currentUser,
                action: "SHIFT_ENDED",
                detail: "Auto end (fallback — finalizeNormalShiftEnd missing)",
                time: Date.now()
            });
        }
    }
}


// ===========================================
// STEP 2: SHIFT-END CONTINUE/STOP PROMPT
// ===========================================
// Shown the instant the normal shift auto-finalizes (triggered from
// finalizeNormalShiftEnd() in status.js, right after the shift is
// already closed out). Forces an explicit choice so a forgotten
// session can never silently roll into overtime OR silently roll into
// the next day — no response within the timeout is treated exactly
// the same as "No, I'm done for today" per the spec.

const SHIFT_END_PROMPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — matches
// the existing 5-minute notification cadence already used elsewhere in
// this codebase (shift-ending-soon warning above, retired shiftautomation.js
// grace flow). Not yet explicitly confirmed by Sam — flagged in the
// context tracker, proceeding with this as the default.

let shiftEndPromptTimeoutId = null;

function removeShiftEndPromptToast() {
    document.getElementById("shiftEndPromptToast")?.remove();
}

window.showShiftEndContinuePrompt = function () {

    removeShiftEndPromptToast();
    if (shiftEndPromptTimeoutId) clearTimeout(shiftEndPromptTimeoutId);

    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.id = "shiftEndPromptToast";
    toast.className = "toast toast-warn shiftGraceToast";

    const text = document.createElement("span");
    text.textContent = window.I18N
        ? window.I18N.t("workspace.shiftEndPromptQuestion")
        : "Your scheduled shift has ended. Are you continuing to work today?";

    const btnRow = document.createElement("div");
    btnRow.className = "shiftEndPromptBtnRow";

    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "shiftGraceResumeBtn";
    startBtn.textContent = window.I18N
        ? window.I18N.t("workspace.shiftEndPromptStartOvertime")
        : "Start Overtime";
    startBtn.onclick = () => {
        clearTimeout(shiftEndPromptTimeoutId);
        removeShiftEndPromptToast();
        window.startOvertimeFromShiftEndPrompt?.();
    };

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.className = "shiftEndPromptDeclineBtn";
    declineBtn.textContent = window.I18N
        ? window.I18N.t("workspace.shiftEndPromptDecline")
        : "No, I'm done for today";
    declineBtn.onclick = () => {
        clearTimeout(shiftEndPromptTimeoutId);
        removeShiftEndPromptToast();
        window.declineOvertimeFromShiftEndPrompt?.();
    };

    btnRow.appendChild(startBtn);
    btnRow.appendChild(declineBtn);

    toast.appendChild(text);
    toast.appendChild(btnRow);
    container.appendChild(toast);

    void toast.offsetHeight;
    toast.classList.add("toastShow");

    // No response -> same outcome as declining, per spec: never leave
    // a session that can carry into the next day.
    shiftEndPromptTimeoutId = setTimeout(() => {
        removeShiftEndPromptToast();
        window.declineOvertimeFromShiftEndPrompt?.();
    }, SHIFT_END_PROMPT_TIMEOUT_MS);
};


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

// V52 note: the Load modal's Driver field no longer calls this — it's
// now a searchable dropdown (see the "DRIVER COMBOBOX" section further
// down) that always saves an exact, validated name, so there's no more
// free-typed "For <name>" text to parse there. Left in place in case
// anything else in the app still wants this same parsing behavior.
//
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

    // one live listener drives users.bookedLoads for this employee —
    // it fires immediately with whatever's cached/on the server, so
    // there's no need for a separate one-time fetch on top of it
    window.startLoadsListener?.();
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

    // ---- write straight to Firestore instead of going through the
    // offline queue. New-employee accounts were seeing loads never
    // reach shiftHistory (so Load History, Admin stats, and the
    // per-user drilldown all stayed silent for them) — the queue only
    // drains strictly in order and stops dead on the first failure,
    // so anything queued behind one bad/slow item for a given session
    // just never arrived. Booking a load is the one write that other
    // screens' live listeners depend on seeing immediately, so it goes
    // straight to Firestore now instead of waiting its turn. ----
    saveLoadDirect(uid, load).catch(err => {
        console.error("saveLoad: direct Firestore write failed:", err);
        window.showToast?.(
            window.I18N ? window.I18N.t("workspace.loadSaveFailed") : "Failed to save load — check your connection.",
            "error"
        );
    });
}

// Mirrors what queue.js's old ADD_LOAD handler used to do, minus the
// queue/retry wrapper — see the comment in saveLoad() above for why
// this write no longer goes through RelayDesk.queue.
async function saveLoadDirect(uid, load) {

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data() || {};
    const loads = Array.isArray(userData.bookedLoads) ? userData.bookedLoads : [];

    if (!loads.some(l => l.id === load.id)) {
        loads.push(load);
        await userRef.set({ bookedLoads: loads }, { merge: true });
    }

    if (!load.shiftId) return;

    const shiftRef = db.collection("shiftHistory").doc(load.shiftId);
    const shiftDoc = await shiftRef.get();
    const shiftData = shiftDoc.data() || {};
    const loadsLog = Array.isArray(shiftData.loadsLog) ? shiftData.loadsLog : [];

    if (loadsLog.some(l => l.id === load.id)) return;

    loadsLog.push(load);
    const current = shiftData.metrics?.bookedLoads ?? 0;

    await shiftRef.set({
        metrics: { bookedLoads: current + 1 },
        loadsLog
    }, { merge: true });

    if (typeof logAudit === "function") {
        await logAudit(uid, "LOAD_BOOKED", `Load ${load.vrid || load.id} booked`);
    }
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
        alert(window.I18N ? window.I18N.t("workspace.noPermissionDeleteLoad") : "You don't have permission to delete loads.");
        return;
    }

    // Settings feature: "Confirm before deleting loads" (Load Management)
    if (window.ESMSettings?.get("confirmBeforeDeletingLoads")) {
        if (!confirm(window.I18N ? window.I18N.t("workspace.confirmDeleteLoad") : "Delete this load? This can't be undone.")) {
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

    const rawLoads = RelayDesk.bookedLoads || [];

    container.innerHTML = "";

    if (!rawLoads.length) {
        container.innerHTML =
            '<div class="workspaceEmpty">No booked loads.</div>';
        RelayDesk.reportFormatter?.refresh();
        return;
    }

    // Settings feature: "Auto-collapse completed loads" (Load
    // Management, Phase 5) — see isCompletedLoad() above for what
    // "completed" means here.
    const completedRaw = rawLoads.filter(isCompletedLoad);
    const activeRaw = rawLoads.filter(l => !isCompletedLoad(l));

    // Settings feature: "Default sorting" (Load Management). Grouping
    // by Department/Driver/VRID Type still applies on top of this —
    // sorting only decides the order of loads *within* each group.
    const sortMode = window.ESMSettings?.get("defaultLoadSorting") || "Newest";
    const activeSorted = sortLoadsBy(activeRaw, sortMode);
    const completedSorted = sortLoadsBy(completedRaw, sortMode);

    if (activeSorted.length) {
        renderLoadGroupTree(container, activeSorted);
    } else {
        container.innerHTML = '<div class="workspaceEmpty">No active loads.</div>';
    }

    // Completed (previous-shift) loads — shown/hidden per the
    // "Auto-collapse completed loads" setting.
    if (completedSorted.length && !window.ESMSettings?.get("autoCollapseCompletedLoads")) {
        const completedWrap = document.createElement("div");
        completedWrap.className = "loadGroupCompleted";
        completedWrap.innerHTML = `<div class="loadGroupCompletedHeader">✅ Completed — previous shift(s) (${completedSorted.length})</div>`;
        renderLoadGroupTree(completedWrap, completedSorted);
        container.appendChild(completedWrap);
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
        department: document.getElementById("loadModalDepartment"),
        from: document.getElementById("loadModalFrom"),
        to: document.getElementById("loadModalTo"),
        fromToContainer: document.getElementById("loadModalFromToContainer"),
        vridNumber: document.getElementById("loadModalVridNumber"),
        vridType: document.getElementById("loadModalVridType"),
        importRelayBtn: document.getElementById("loadModalImportRelayBtn"),
        importRelayError: document.getElementById("loadModalImportRelayError"),
        stopsContainer: document.getElementById("loadModalStopsContainer"),
        stopsList: document.getElementById("loadModalStopsList"),
        addStopBtn: document.getElementById("loadModalAddStopBtn"),
        includeStopsToggle: document.getElementById("loadModalIncludeStopsToggle"),
        price: document.getElementById("loadModalPrice"),
        pricePerMile: document.getElementById("loadModalPricePerMile"),
        // `driver` is the HIDDEN field — the canonical, validated value
        // that actually gets saved. `driverInput` is the visible
        // searchable text box the user types/clicks in. See the
        // "DRIVER COMBOBOX" section below for why they're split.
        driver: document.getElementById("loadModalDriver"),
        driverInput: document.getElementById("loadModalDriverSearch"),
        driverList: document.getElementById("loadModalDriverListbox"),
        note: document.getElementById("loadModalNote"),
        dateError: document.getElementById("loadModalDateError"),
        priceError: document.getElementById("loadModalPriceError"),
        departmentError: document.getElementById("loadModalDepartmentError"),
        vridNumberError: document.getElementById("loadModalVridNumberError"),
        driverError: document.getElementById("loadModalDriverError"),
        saveBtn: document.getElementById("loadModalSaveBtn"),
        cancelBtn: document.getElementById("loadModalCancelBtn")
    };

    if (!loadModalUI.overlay) return;

    loadModalUI.saveBtn?.addEventListener("click", saveLoadModal);
    loadModalUI.cancelBtn?.addEventListener("click", closeLoadModal);
    loadModalUI.department?.addEventListener("change", onLoadModalDepartmentChange);
    bindDriverCombobox();
    bindLoadModalVridAutoDetect();
    bindLoadModalPricePaste();
    bindLoadModalFromToSplit();
    bindLoadModalRelayImport();
    bindLoadModalStops();
}

// ===========================================
// DRIVER COMBOBOX (searchable dropdown, V52)
// ===========================================
//
// Replaces the old free-text Driver input, which caused inconsistent
// data ("for Ahmed" / "Ahmed" / "FOR AHMED" / "ahmed" all landing as
// different drivers). Drivers now come from a fixed, per-department
// list in drivers.js (window.DRIVER_LISTS), so the exact same spelling
// is always stored and a driver can never end up saved against the
// wrong department.
//
// Two inputs work together (see index.html):
//   - loadModalUI.driverInput — the VISIBLE text box. This is what the
//     user types into to search, and what the dropdown list is
//     rendered under. Free typing here does NOT by itself save
//     anything.
//   - loadModalUI.driver — a HIDDEN input that only ever gets a value
//     once a driver is *confirmed*: clicked, Enter'd while highlighted,
//     or an exact case-insensitive match on blur. This hidden value is
//     the one saveLoadModal() actually reads, and it's what
//     validateLoadModal() checks — so a typed-but-never-resolved name
//     behaves exactly like an empty required <select> would: it blocks
//     save with an inline error instead of silently going through.
let driverComboState = {
    department: null,
    options: [],   // every driver for the currently selected department
    filtered: [],  // options narrowed by the current search text
    highlighted: -1
};

function getDriverListForDepartment(dept) {
    if (!dept || !window.DRIVER_LISTS) return [];
    return window.DRIVER_LISTS[dept] || [];
}

function renderDriverOptions() {
    const list = loadModalUI.driverList;
    if (!list) return;

    list.innerHTML = "";

    if (!driverComboState.filtered.length) {
        const empty = document.createElement("li");
        empty.className = "driverComboboxEmpty";
        empty.textContent = driverComboState.options.length
            ? "No matching drivers"
            : "No drivers set up for this department yet";
        list.appendChild(empty);
        return;
    }

    driverComboState.filtered.forEach((name, i) => {
        const li = document.createElement("li");
        li.className = "driverComboboxOption" + (i === driverComboState.highlighted ? " isHighlighted" : "");
        li.textContent = name;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === driverComboState.highlighted ? "true" : "false");
        // mousedown (not click) fires before the input's blur handler,
        // so the pick registers before blur's "didn't resolve" logic runs
        li.addEventListener("mousedown", (e) => {
            e.preventDefault();
            selectDriver(name);
        });
        list.appendChild(li);
    });
}

function filterDriverOptions(query) {
    const q = (query || "").trim().toLowerCase();
    driverComboState.filtered = q
        ? driverComboState.options.filter(name => name.toLowerCase().includes(q))
        : driverComboState.options.slice();
    driverComboState.highlighted = driverComboState.filtered.length ? 0 : -1;
    renderDriverOptions();
}

function openDriverDropdown() {
    if (!loadModalUI.driverList || !loadModalUI.driverInput || loadModalUI.driverInput.disabled) return;
    loadModalUI.driverList.classList.remove("hidden");
    loadModalUI.driverInput.setAttribute("aria-expanded", "true");
}

function closeDriverDropdown() {
    if (!loadModalUI.driverList || !loadModalUI.driverInput) return;
    loadModalUI.driverList.classList.add("hidden");
    loadModalUI.driverInput.setAttribute("aria-expanded", "false");
    driverComboState.highlighted = -1;
}

function selectDriver(name) {
    if (loadModalUI.driver) loadModalUI.driver.value = name;
    if (loadModalUI.driverInput) loadModalUI.driverInput.value = name;
    closeDriverDropdown();
    loadModalUI.driverInput?.classList.remove("fieldError");
    if (loadModalUI.driverError) loadModalUI.driverError.textContent = "";
}

function clearDriverSelection() {
    if (loadModalUI.driver) loadModalUI.driver.value = "";
    if (loadModalUI.driverInput) loadModalUI.driverInput.value = "";
    loadModalUI.driverInput?.classList.remove("fieldError");
    if (loadModalUI.driverError) loadModalUI.driverError.textContent = "";
}

// Rebuilds the dropdown's source list for whatever department is
// currently selected. Called on modal open and whenever Department
// changes. Disables the field entirely (with an explanatory
// placeholder) until a department is picked, since drivers are always
// department-scoped.
function reloadDriverOptionsForDepartment(dept) {
    driverComboState.department = dept || null;
    driverComboState.options = getDriverListForDepartment(dept);
    filterDriverOptions(loadModalUI.driverInput?.value || "");

    if (loadModalUI.driverInput) {
        loadModalUI.driverInput.disabled = !dept;
        loadModalUI.driverInput.placeholder = dept ? "Select driver..." : "Select department first...";
    }
}

// Department dependency (per spec): changing Department always clears
// whatever driver was picked and reloads the list, so a driver from
// the old department can never linger selected under the new one.
function onLoadModalDepartmentChange() {
    clearDriverSelection();
    closeDriverDropdown();
    reloadDriverOptionsForDepartment(loadModalUI.department?.value || "");
}

function bindDriverCombobox() {
    const input = loadModalUI.driverInput;
    const list = loadModalUI.driverList;
    if (!input || !list || input.bound) return;
    input.bound = true;

    input.addEventListener("focus", () => {
        filterDriverOptions(input.value);
        openDriverDropdown();
    });

    input.addEventListener("input", () => {
        // typing invalidates any previously confirmed pick until it
        // resolves to an exact match again (see selectDriver/blur below)
        if (loadModalUI.driver) loadModalUI.driver.value = "";
        filterDriverOptions(input.value);
        openDriverDropdown();
    });

    input.addEventListener("keydown", (e) => {
        if (input.disabled) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (list.classList.contains("hidden")) {
                filterDriverOptions(input.value);
                openDriverDropdown();
                return;
            }
            if (driverComboState.filtered.length) {
                driverComboState.highlighted = (driverComboState.highlighted + 1) % driverComboState.filtered.length;
                renderDriverOptions();
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (driverComboState.filtered.length) {
                driverComboState.highlighted =
                    (driverComboState.highlighted - 1 + driverComboState.filtered.length) % driverComboState.filtered.length;
                renderDriverOptions();
            }
        } else if (e.key === "Enter") {
            if (!list.classList.contains("hidden") && driverComboState.highlighted > -1) {
                e.preventDefault();
                selectDriver(driverComboState.filtered[driverComboState.highlighted]);
            }
        } else if (e.key === "Escape") {
            if (!list.classList.contains("hidden")) {
                e.preventDefault();
                closeDriverDropdown();
            }
        }
    });

    input.addEventListener("blur", () => {
        // deferred so an option's mousedown (which already fired its own
        // selectDriver call) isn't clobbered by blur running first
        setTimeout(() => {
            const typed = input.value.trim();

            if (!typed) {
                clearDriverSelection();
                closeDriverDropdown();
                return;
            }

            const exact = driverComboState.options.find(name => name.toLowerCase() === typed.toLowerCase());

            if (exact) {
                selectDriver(exact);
            } else if (loadModalUI.driver) {
                // doesn't resolve to a real driver in this department —
                // leave the typed text visible so the user can see/fix
                // it, but keep the hidden value empty so validation
                // catches it at save time
                loadModalUI.driver.value = "";
            }

            closeDriverDropdown();
        }, 120);
    });

    document.addEventListener("click", (e) => {
        if (!loadModalUI.overlay || loadModalUI.overlay.classList.contains("hidden")) return;
        if (!e.target.closest("#loadModalDriverCombobox")) closeDriverDropdown();
    });
}

// ===========================================
// VRID TYPE AUTO-DETECT
// ===========================================
// As the user types/pastes into VRID Number, guess the VRID Type from
// its first character(s): a leading digit -> Load, "T-" -> Trip,
// "B-"/"C-" -> Block/Contract. Never fights a deliberate manual pick —
// once the user has touched the VRID Type dropdown themselves (or
// we're editing a load that already had a type saved), auto-detect
// stops overwriting it.
let loadModalVridTypeManualOverride = false;

function detectVridTypeFromNumber(vridNumber) {
    const trimmed = (vridNumber || "").trim();
    if (!trimmed) return "";
    if (/^\d/.test(trimmed)) return "Load";
    if (/^t-/i.test(trimmed)) return "Trip";
    if (/^[bc]-/i.test(trimmed)) return "Block/Contract";
    return "";
}

function bindLoadModalVridAutoDetect() {
    loadModalUI.vridNumber?.addEventListener("input", () => {
        if (loadModalVridTypeManualOverride) return;
        const detected = detectVridTypeFromNumber(loadModalUI.vridNumber.value);
        if (detected && loadModalUI.vridType) {
            loadModalUI.vridType.value = detected;
            onLoadModalVridTypeChange();
        }
    });

    loadModalUI.vridType?.addEventListener("change", () => {
        // any manual touch of the dropdown, from here on, wins over
        // auto-detect for the rest of this modal session
        loadModalVridTypeManualOverride = true;
        onLoadModalVridTypeChange();
    });
}

// Shows/hides the multi-stop list — only relevant for Trip-type VRIDs.
// From/To are single-origin/single-destination fields that don't make
// sense once there's a multi-stop route, so they swap places: Trip
// hides From/To and shows the stops list; anything else is the reverse.
function onLoadModalVridTypeChange() {
    const isTrip = loadModalUI.vridType?.value === "Trip";
    loadModalUI.stopsContainer?.classList.toggle("hidden", !isTrip);
    loadModalUI.fromToContainer?.classList.toggle("hidden", isTrip);
}

// ===========================================
// MULTI-STOP LIST (Trip VRID type)
// ===========================================
let loadModalStops = [];

function escapeHtmlAttr(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function renderLoadModalStops() {
    const list = loadModalUI.stopsList;
    if (!list) return;

    if (!loadModalStops.length) {
        list.innerHTML = `<div class="workspaceEmpty">No additional stops yet.</div>`;
    } else {
        list.innerHTML = loadModalStops.map((stop, i) => `
            <div class="loadModalStopRow" data-index="${i}">
                <input type="text" class="loadModalStopInput" placeholder="Stop ${i + 1}..." value="${escapeHtmlAttr(stop)}">
                <button type="button" class="dangerButton loadModalRemoveStopBtn" data-index="${i}">🗑</button>
            </div>
        `).join("");
    }

    list.querySelectorAll(".loadModalStopRow").forEach(row => {
        const i = Number(row.dataset.index);
        row.querySelector(".loadModalStopInput")?.addEventListener("input", (e) => {
            loadModalStops[i] = e.target.value;
        });
    });

    list.querySelectorAll(".loadModalRemoveStopBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            const i = Number(btn.dataset.index);
            loadModalStops.splice(i, 1);
            renderLoadModalStops();
        });
    });
}

function bindLoadModalStops() {
    loadModalUI.addStopBtn?.addEventListener("click", () => {
        loadModalStops.push("");
        renderLoadModalStops();
    });
}

// ===========================================
// PRICE / PRICE-PER-MILE PASTE SPLITTING
// ===========================================
// Handles pasting a combined clipboard blob like:
//   $278.51
//
//   $3.99/mi
// into the Price field — splits the dollar amount into Price and the
// "$X.XX/mi" amount into Price per Mile, instead of dumping the raw
// (unparseable, for a number input) text in.
function parsePricePaste(text) {
    if (!text) return null;

    const perMileMatch = text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*\/\s*mi\b/i);
    const perMile = perMileMatch ? perMileMatch[1].replace(/,/g, "") : null;

    // Strip the matched per-mile chunk out before looking for the
    // price, so the same number can't get matched twice.
    const remainder = perMileMatch
        ? text.slice(0, perMileMatch.index) + text.slice(perMileMatch.index + perMileMatch[0].length)
        : text;

    const priceMatch = remainder.match(/\$\s*([\d,]+(?:\.\d{2})?)/) || remainder.match(/([\d,]+\.\d{2})/);
    const price = priceMatch ? priceMatch[1].replace(/,/g, "") : null;

    if (!price && !perMile) return null;
    return { price, perMile };
}

function bindLoadModalPricePaste() {
    loadModalUI.price?.addEventListener("paste", (e) => {
        const text = (e.clipboardData || window.clipboardData)?.getData("text") || "";
        const parsed = parsePricePaste(text);
        if (!parsed) return; // not a recognized combined blob — let the normal paste happen

        e.preventDefault();
        if (parsed.price && loadModalUI.price) loadModalUI.price.value = parsed.price;
        if (parsed.perMile && loadModalUI.pricePerMile) loadModalUI.pricePerMile.value = parsed.perMile;
    });
}

// ===========================================
// FROM / TO "X to Y" SPLITTING
// ===========================================
// Mirrors parsePricePaste() above: handles a user typing/pasting both
// locations into the From field as "ORIGIN to DESTINATION" and splits
// them into their correct fields instead of saving the combined blob
// as a single From value.
//
// The separator must be a standalone "to" surrounded by whitespace (or
// string start/end), matched case-insensitively, so location names
// that merely contain "to" — "Toronto Warehouse", "Auto Parts
// Facility" — are left alone.
function parseFromToSplit(from) {
    if (!from) return null;

    const match = from.match(/\s+to\s+/i);
    if (!match) return null;

    const origin = from.slice(0, match.index).trim();
    const destination = from.slice(match.index + match[0].length).trim();

    if (!origin || !destination) return null;
    return { from: origin, to: destination };
}

// Live version of the split, same idiom as bindLoadModalPricePaste():
// as soon as the From field contains a recognizable "ORIGIN to
// DESTINATION" pattern, move the destination over into the To field
// right in the modal (not just silently at save time), so the user
// can see it happen and correct it before saving if needed.
//
// Runs on paste (after the pasted text lands) and on blur (covers the
// user typing it out by hand, like "BNSF to IND9"), and never
// overwrites a To field the user already filled in themselves.
function bindLoadModalFromToSplit() {
    const applySplit = () => {
        const existingTo = loadModalUI.to?.value?.trim();
        if (existingTo) return;

        const split = parseFromToSplit(loadModalUI.from?.value || "");
        if (!split) return;

        if (loadModalUI.from) loadModalUI.from.value = split.from;
        if (loadModalUI.to) loadModalUI.to.value = split.to;
    };

    loadModalUI.from?.addEventListener("paste", () => {
        // Let the paste land in the field first, then check it.
        setTimeout(applySplit, 0);
    });
    loadModalUI.from?.addEventListener("blur", applySplit);
}

// ===========================================
// RELAY LOAD CLIPBOARD IMPORTER
// ===========================================
// The team receives a booked load from Amazon Relay and re-sends it to
// drivers as a fixed sequence of separate chat messages:
//
//   BOOKED
//   <Load ID>
//   <Origin> TO <Destination>
//   <Trailer Number>
//   <Pickup Number>            (only if the trailer is loaded)
//   $<Price>
//   $<Price>/mi
//   NOTE: "<delay/load note>"  (optional)
//   #<sender employee code>
//
// "📋 Import Relay Copy" lets someone select + copy that whole block
// and have ESM pull the load-relevant fields (Load ID, From, To,
// Price, Price per Mile) straight into the AddLoad modal, instead of
// retyping them by hand. Trailer/Pickup/Note/sender-code are
// deliberately ignored — they don't belong on the load record.
//
// This is a pattern-based parser, not a fixed-line-number one: any of
// BOOKED / Trailer / Pickup / Note may be missing, and it still finds
// what it needs by matching each field's shape (currency, "/mi",
// " to " route separator) rather than assuming a position.
function parseRelayClipboard(text) {
    if (!text) return null;

    // Strip chat-app timestamp/sender stamps, e.g. "[7/12/2026 07:43]
    // STS Damascus: " — some copy modes (Telegram-style multi-select)
    // glue several stamped messages onto a single physical line instead
    // of one per line, so a simple per-line prefix strip isn't enough.
    // This runs a global replace across the raw text BEFORE splitting
    // into lines, turning every stamp into a line break so each
    // original message becomes its own line again.
    text = text.replace(/\[[^\]\n]+\]\s*[^:\n]+:\s*/g, "\n");

    let lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Drop the leading "BOOKED" marker, if present.
    lines = lines.filter(l => !/^booked$/i.test(l));

    // Drop the NOTE section: the "NOTE:" label line, plus a
    // directly-following quoted note line, if present. The note's
    // content is never needed here.
    const noteIdx = lines.findIndex(l => /^note:?$/i.test(l));
    if (noteIdx !== -1) {
        const hasQuotedLine = /^".*"$/.test(lines[noteIdx + 1] || "");
        lines.splice(noteIdx, hasQuotedLine ? 2 : 1);
    }

    // Drop the sender employee code line, e.g. "#A005".
    lines = lines.filter(l => !/^#\w+$/.test(l));

    // Route: the first remaining line with a standalone "to"
    // separator. Reuses parseFromToSplit()'s whitespace-bounded match
    // so "Toronto Warehouse"-style lines are never mistaken for a
    // route.
    let from = null, to = null;
    const routeIdx = lines.findIndex(l => /\s+to\s+/i.test(l));
    if (routeIdx !== -1) {
        const split = parseFromToSplit(lines[routeIdx]);
        if (split) {
            from = split.from;
            to = split.to;
        }
        lines.splice(routeIdx, 1);
    }

    // Price per mile ("$3.77/mi") — found and removed before the
    // plain price search below, so the same number/line can't get
    // matched twice.
    let pricePerMile = null;
    const pmIdx = lines.findIndex(l => /\$?\s*[\d,]+(?:\.\d+)?\s*\/\s*mi\b/i.test(l));
    if (pmIdx !== -1) {
        const pmMatch = lines[pmIdx].match(/\$?\s*([\d,]+(?:\.\d+)?)\s*\/\s*mi\b/i);
        pricePerMile = pmMatch ? pmMatch[1].replace(/,/g, "") : null;
        lines.splice(pmIdx, 1);
    }

    // Plain price ("$624.72").
    let price = null;
    const priceIdx = lines.findIndex(l => /\$\s*[\d,]+(?:\.\d{2})?/.test(l));
    if (priceIdx !== -1) {
        const priceMatch = lines[priceIdx].match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        price = priceMatch ? priceMatch[1].replace(/,/g, "") : null;
        lines.splice(priceIdx, 1);
    }

    // Whatever's left (Load ID, and optionally Trailer/Pickup numbers
    // that are deliberately ignored) keeps its original relative
    // order. The Load ID is always the first of what remains, since
    // in the source message sequence nothing but BOOKED comes before
    // it.
    const loadId = lines[0] || null;

    if (!loadId && !from && !to && !price && !pricePerMile) return null;

    return { loadId, from, to, price, pricePerMile };
}

// ===========================================
// RELAY TRIP CLIPBOARD IMPORTER (Trip ID -> Sub Load IDs -> Stops)
// ===========================================
// A Trip booking arrives as the same fixed message sequence documented
// above (BOOKED / ... / $price / $price/mi / NOTE / #sender), but
// instead of one <Load ID> + one route line, it has a Trip ID followed
// by a repeating (Sub Load ID, route) pair per leg — one pair per
// sub load, however many legs the trip has:
//
//   BOOKED
//   <Trip ID>                  e.g. T-11669D9N1
//   <Sub Load ID>               e.g. 1133F8G77
//   <Origin> TO <Destination>
//   <Sub Load ID>               e.g. 1164XQ9HZ
//   <Origin> TO <Destination>
//   ...                         (any number of additional legs)
//   $<Price>                    (trip total, appears once)
//   $<Price>/mi                 (trip total, appears once)
//   NOTE: "<delay/load note>"  (optional)
//   #<sender employee code>
//
// Sub Load IDs are only load-bearing for recognizing where each leg
// boundary falls while parsing — like Trailer/Pickup/sender-code in
// the single-load format, they're deliberately not kept on the load
// record itself. What IS kept is the resulting chain of stops
// (waypoints), built leg by leg: the first leg contributes both its
// origin and destination, every leg after that normally contributes
// only its destination (Relay legs connect end-to-end) — unless a
// leg's origin doesn't match the running last stop, in which case
// it's inserted too rather than silently dropped.
//
// Detection: this only recognizes the blob as a Trip at all if there
// are 2+ route ("X to Y") lines — a single-load blob always has
// exactly one, so this never misfires on the existing format and the
// caller can safely try this parser first.
function parseRelayClipboardTrip(text) {
    if (!text) return null;

    text = text.replace(/\[[^\]\n]+\]\s*[^:\n]+:\s*/g, "\n");

    let lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    lines = lines.filter(l => !/^booked$/i.test(l));

    const noteIdx = lines.findIndex(l => /^note:?$/i.test(l));
    if (noteIdx !== -1) {
        const hasQuotedLine = /^".*"$/.test(lines[noteIdx + 1] || "");
        lines.splice(noteIdx, hasQuotedLine ? 2 : 1);
    }

    lines = lines.filter(l => !/^#\w+$/.test(l));

    const routeLineCount = lines.filter(l => /\s+to\s+/i.test(l)).length;
    if (routeLineCount < 2) return null;

    let pricePerMile = null;
    const pmIdx = lines.findIndex(l => /\$?\s*[\d,]+(?:\.\d+)?\s*\/\s*mi\b/i.test(l));
    if (pmIdx !== -1) {
        const pmMatch = lines[pmIdx].match(/\$?\s*([\d,]+(?:\.\d+)?)\s*\/\s*mi\b/i);
        pricePerMile = pmMatch ? pmMatch[1].replace(/,/g, "") : null;
        lines.splice(pmIdx, 1);
    }

    let price = null;
    const priceIdx = lines.findIndex(l => /\$\s*[\d,]+(?:\.\d{2})?/.test(l));
    if (priceIdx !== -1) {
        const priceMatch = lines[priceIdx].match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        price = priceMatch ? priceMatch[1].replace(/,/g, "") : null;
        lines.splice(priceIdx, 1);
    }

    // Whatever's left: Trip ID first, then Sub Load ID / route lines
    // interleaved in original order. Only the route lines matter from
    // here — a Sub Load ID line is just skipped over.
    const tripId = lines[0] || null;
    const rest = lines.slice(1);

    const stops = [];
    rest.forEach(line => {
        if (!/\s+to\s+/i.test(line)) return; // Sub Load ID line, not a route
        const split = parseFromToSplit(line);
        if (!split) return;
        const lastStop = stops[stops.length - 1];
        if (!lastStop || lastStop.toLowerCase() !== split.from.toLowerCase()) {
            stops.push(split.from);
        }
        stops.push(split.to);
    });

    if (!tripId && !stops.length && !price && !pricePerMile) return null;

    return { tripId, stops, price, pricePerMile };
}

function bindLoadModalRelayImport() {
    loadModalUI.importRelayBtn?.addEventListener("click", async () => {
        if (loadModalUI.importRelayError) loadModalUI.importRelayError.textContent = "";

        let text = "";
        try {
            // Prefer the Electron main-process clipboard (see
            // electron/preload.js) — more reliable in a
            // contextIsolation:true renderer than the browser-only
            // navigator.clipboard.readText(), which this app falls
            // back to when running outside Electron.
            text = window.electronAPI?.isElectron
                ? await window.electronAPI.readClipboardText()
                : await navigator.clipboard.readText();
        } catch (err) {
            console.error("Relay import: couldn't read clipboard:", err);
            if (loadModalUI.importRelayError) {
                loadModalUI.importRelayError.textContent = "Couldn't read the clipboard — copy the Relay messages and try again.";
            }
            return;
        }

        // Trip blobs (2+ route lines) are tried first — a single-load
        // blob only ever has one route line, so this never misfires on
        // the existing single-load format below.
        const trip = parseRelayClipboardTrip(text);
        if (trip) {
            if (trip.tripId && loadModalUI.vridNumber) {
                loadModalUI.vridNumber.value = trip.tripId;
                loadModalUI.vridNumber.dispatchEvent(new Event("input"));
            }
            // Force VRID Type to Trip (and reveal the stops list) here
            // explicitly rather than relying on detectVridTypeFromNumber
            // picking it up from the "T-" prefix — a Trip ID that
            // doesn't start with "T-" would otherwise leave the modal
            // showing From/To instead of the stops it just filled.
            if (loadModalUI.vridType) {
                loadModalUI.vridType.value = "Trip";
                onLoadModalVridTypeChange();
            }
            if (trip.stops.length) {
                loadModalStops = trip.stops.slice();
                renderLoadModalStops();
            }
            if (trip.price && loadModalUI.price) loadModalUI.price.value = trip.price;
            if (trip.pricePerMile && loadModalUI.pricePerMile) loadModalUI.pricePerMile.value = trip.pricePerMile;

            // Roadmap: a Trip import auto-enables "Show these stops in
            // the End-of-Shift Report" — a Trip's report line is always
            // meant to show its stop chain, not a blank From/To, so
            // there's no reason to leave this off after an auto-fill.
            if (loadModalUI.includeStopsToggle) loadModalUI.includeStopsToggle.checked = true;

            return;
        }

        const parsed = parseRelayClipboard(text);
        if (!parsed) {
            if (loadModalUI.importRelayError) {
                loadModalUI.importRelayError.textContent = "Didn't recognize that as a Relay load — copy the BOOKED message block and try again.";
            }
            return;
        }

        if (parsed.loadId && loadModalUI.vridNumber) {
            loadModalUI.vridNumber.value = parsed.loadId;
            // Keep the existing VRID-type auto-detect (bindLoadModalVridAutoDetect) in sync.
            loadModalUI.vridNumber.dispatchEvent(new Event("input"));
        }
        if (parsed.from && loadModalUI.from) loadModalUI.from.value = parsed.from;
        if (parsed.to && loadModalUI.to) loadModalUI.to.value = parsed.to;
        if (parsed.price && loadModalUI.price) loadModalUI.price.value = parsed.price;
        if (parsed.pricePerMile && loadModalUI.pricePerMile) loadModalUI.pricePerMile.value = parsed.pricePerMile;
    });
}



function openLoadModal(load) {

    if (load && !window.hasPermission?.("canEditLoads")) {
        alert(window.I18N ? window.I18N.t("workspace.noPermissionEditLoad") : "You don't have permission to edit loads.");
        return;
    }

    bindLoadModal();
    if (!loadModalUI.overlay) return;

    loadModalEditingId = load ? load.id : null;

    if (loadModalUI.title) {
        loadModalUI.title.textContent = load ? "✏️ Edit Load" : "📦 Add Load";
    }

    // New load: default the date picker to today (same idiom already
    // used by the Report Generator's date input) so booking a load
    // doesn't require touching the calendar field for the common case
    // of same-day loads — still fully editable for a load booked a few
    // days out. Editing an existing load keeps its saved date, never
    // overwritten with today's date.
    if (loadModalUI.date) loadModalUI.date.value = load?.date || new Date().toISOString().split("T")[0];
    if (loadModalUI.price) loadModalUI.price.value = load?.price || "";
    if (loadModalUI.pricePerMile) loadModalUI.pricePerMile.value = load?.pricePerMile || "";
    if (loadModalUI.department) loadModalUI.department.value = load?.division || "";
    if (loadModalUI.from) loadModalUI.from.value = load?.from || "";
    if (loadModalUI.to) loadModalUI.to.value = load?.to || "";

    // Driver combobox: reload the dropdown for whatever department this
    // load already has (or "" for a brand-new load, which leaves the
    // field disabled until Department is picked), THEN seed the
    // visible/hidden values from the existing load, if any. Order
    // matters — reloadDriverOptionsForDepartment() enables/disables the
    // input and would otherwise stomp on the value set here.
    reloadDriverOptionsForDepartment(loadModalUI.department?.value || "");
    if (loadModalUI.driver) loadModalUI.driver.value = load?.driver || "";
    if (loadModalUI.driverInput) loadModalUI.driverInput.value = load?.driver || "";

    if (loadModalUI.vridType) loadModalUI.vridType.value = load?.vridType || "";
    if (loadModalUI.vridNumber) loadModalUI.vridNumber.value = load?.vrid || "";
    if (loadModalUI.note) loadModalUI.note.value = load?.note || "";

    // Auto-detect only kicks in for a brand-new load with nothing typed
    // yet — an existing load already has a deliberate VRID Type saved,
    // so re-typing its VRID Number during an edit must never silently
    // swap the type out from under it.
    loadModalVridTypeManualOverride = !!load;

    loadModalStops = Array.isArray(load?.stops) ? [...load.stops] : [];
    if (loadModalUI.includeStopsToggle) loadModalUI.includeStopsToggle.checked = !!load?.includeStopsInReport;
    renderLoadModalStops();
    onLoadModalVridTypeChange();

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
    loadModalStops = [];
    loadModalVridTypeManualOverride = false;
}

function clearLoadModalErrors() {

    [loadModalUI.date, loadModalUI.price, loadModalUI.department, loadModalUI.vridNumber, loadModalUI.driverInput].forEach(el =>
        el?.classList.remove("fieldError"));

    [loadModalUI.dateError, loadModalUI.priceError, loadModalUI.departmentError, loadModalUI.vridNumberError, loadModalUI.driverError].forEach(el => {
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

    // Driver combobox (V52 rework of Phase 2 item 4): the driver is
    // still optional overall — an "Unassigned" load is fine, same as
    // before — but if the user typed or picked *something*, it has to
    // resolve to a real, confirmed driver that belongs to the selected
    // department. loadModalUI.driver (hidden) only ever holds a
    // confirmed pick (see bindDriverCombobox), so:
    //   - typed text with no confirmed pick -> blocked, "pick from the list"
    //   - a confirmed pick that's somehow not in this department's list
    //     (e.g. stale data from before a department switch) -> blocked too
    const driverTyped = loadModalUI.driverInput?.value?.trim() || "";
    const driverValue = loadModalUI.driver?.value?.trim() || "";

    if (driverTyped && !driverValue) {
        loadModalUI.driverInput?.classList.add("fieldError");
        if (loadModalUI.driverError) loadModalUI.driverError.textContent = "Select a driver from the list.";
        valid = false;
    } else if (driverValue) {
        const validDrivers = getDriverListForDepartment(department);
        if (!validDrivers.some(name => name.toLowerCase() === driverValue.toLowerCase())) {
            loadModalUI.driverInput?.classList.add("fieldError");
            if (loadModalUI.driverError) loadModalUI.driverError.textContent = "Selected driver doesn't belong to this department.";
            valid = false;
        }
    }

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
    const pricePerMile = loadModalUI.pricePerMile?.value?.trim() || "";
    const division = loadModalUI.department.value;
    const vridType = loadModalUI.vridType?.value || "";
    // From/To are hidden for Trip loads (the multi-stop list replaces
    // them) — ignore whatever's still sitting in those hidden inputs
    // rather than saving stale text left over from before the type was
    // switched to Trip.
    let from = vridType === "Trip" ? "" : (loadModalUI.from?.value?.trim() || "");
    let to = vridType === "Trip" ? "" : (loadModalUI.to?.value?.trim() || "");

    // QoL: "ORIGIN to DESTINATION" pasted/typed into From — only kicks
    // in when To is still empty, so a user who already filled both
    // fields deliberately never gets overwritten.
    if (from && !to) {
        const split = parseFromToSplit(from);
        if (split) {
            from = split.from;
            to = split.to;
        }
    }

    const note = loadModalUI.note?.value?.trim() || "";
    // V52: loadModalUI.driver (hidden) already holds the exact,
    // department-validated driver name confirmed by the combobox — see
    // validateLoadModal() above and bindDriverCombobox() — so no more
    // "For <name>" free-text parsing is needed here.
    const driver = loadModalUI.driver?.value?.trim() || "";
    const vrid = loadModalUI.vridNumber?.value?.trim() || "";
    // Multi-stop list only makes sense for Trip-type VRIDs — empty
    // entries dropped so a stray "+ Add Stop" click with nothing typed
    // never gets saved as a blank stop.
    const stops = vridType === "Trip" ? loadModalStops.map(s => s.trim()).filter(Boolean) : [];
    // Optional per-load toggle: pulls this load's stops into the
    // End-of-Shift Report as an extra line (see formatLoadsForTemplate
    // above). Only meaningful for a Trip load that actually has stops.
    const includeStopsInReport = vridType === "Trip" && stops.length ? !!loadModalUI.includeStopsToggle?.checked : false;

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

        editLoad(loadModalEditingId, { date, price, pricePerMile, division, from, to, note, driver, vridType, vrid, stops, includeStopsInReport, editedAt: Date.now() });

    } else {

        saveLoad({
            id: Date.now(),
            date,
            price,
            pricePerMile,
            division,
            from,
            to,
            driver,
            vridType,
            vrid,
            stops,
            includeStopsInReport,
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