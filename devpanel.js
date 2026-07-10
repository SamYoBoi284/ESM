// ===========================================
// RelayDesk / ESM
// devpanel.js
// DEVELOPER PANEL — lets a developer account edit Version, Credits,
// Release Notes, and the About text from inside the running app, and
// have it sync live to every user's screen. No rebuild required for a
// version bump, a credits tweak, or a new release-notes entry.
// ===========================================
//
// Firestore shape:
//   appConfig/main -> {
//       version:     string,
//       aboutText:   string,   // shown at the top of Settings > About
//       credits:     string,   // shown in the About ESM modal
//       releaseNotes: [ { id, version, date, notes } ],   // newest first
//       customFields: [ { label, value } ],  // forward-compat, see below
//       updatedBy:   string,   // employee code
//       updatedAt:   number    // Date.now()
//   }
//
// `customFields` exists purely so a future developer can add a new
// labeled bit of info to the About page (a link, a note, whatever)
// without touching this file or index.html at all — just add a row
// in the Developer Panel and it renders everywhere the fixed fields do.
//
// Until this doc exists (fresh install, or before A009 ever hits Save),
// everything falls back to the same static copy that used to be
// hardcoded in index.html, so nothing looks broken or blank.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    // Phase 11, batch 4: toast/alert/confirm strings via shared I18N.
    if (window.I18N) {
        window.I18N.register("devpanel", {
            en: {
                confirmDiscardClose: "You have unsaved changes in the Developer Panel. Discard them?",
                confirmDiscardReload: "Discard your unsaved changes and reload the last-saved version?",
                releaseNotesRequired: "Version and notes are both required for a release notes entry.",
                savedNotify: "💾 Developer Panel changes saved — now live for everyone",
                savedToast: "💾 Changes saved and are now live for everyone"
            },
            ar: {
                confirmDiscardClose: "لديك تغييرات غير محفوظة في لوحة المطور. هل تريد تجاهلها؟",
                confirmDiscardReload: "هل تريد تجاهل تغييراتك غير المحفوظة وإعادة تحميل آخر نسخة محفوظة؟",
                releaseNotesRequired: "الإصدار والملاحظات مطلوبان لإدخال ملاحظات الإصدار.",
                savedNotify: "💾 تم حفظ تغييرات لوحة المطور — أصبحت متاحة الآن للجميع",
                savedToast: "💾 تم حفظ التغييرات وأصبحت متاحة الآن للجميع"
            }
        });
    }

    // ===========================================
    // WHO'S A DEVELOPER
    // ===========================================
    // Plain allow-list, deliberately separate from the permissions.js
    // system (this isn't a work-permission, it's "has a laptop and
    // touches the code"). Add more employee codes here later if more
    // developers come on board — that's the only change needed.

    window.DEVELOPER_ACCOUNTS = ["A009"];

    window.isDeveloperAccount = function (id = null) {
        const code = id || RelayDesk.currentUser;
        return !!code && window.DEVELOPER_ACCOUNTS.includes(code);
    };

    // ===========================================
    // FALLBACK CONTENT
    // (identical to what was previously hardcoded in index.html, so
    // first-run behavior before any Firestore doc exists is unchanged)
    // ===========================================

    const FALLBACK_CONFIG = {
        version: "1.1.5",
        aboutText: "ESM (Employee Status Monitor)",
        credits:
            "Made by A009 through countless sleepless nights, in collaboration with ChatGPT and Claude.\n\n" +
            "Created to simplify daily operations, support dispatchers and Safety personnel, and continuously improve alongside the STS Team.\n\n" +
            "Built for the team. Improved by the team.\n\n" +
            "Special thanks go to A004 and A003 for spotting multiple bugs before the app version released and giving great feedback on the project to shape it as it is now ❤️🫡",
        releaseNotes: [],
        customFields: [],
        updatedBy: null,
        updatedAt: null
    };

    const DevPanel = {
        initialized: false,
        formInitialized: false,
        cachedConfig: { ...FALLBACK_CONFIG },
        draft: null,   // local editable copy, only populated while the panel is open
        dirty: false
    };

    RelayDesk.devPanel = DevPanel;

    // ===========================================
    // LIVE APP VERSION (real installed/running version)
    // ===========================================
    // The Firestore "version" field above is a manual override a
    // developer can type into the panel (release nicknames, "beta",
    // whatever) — it isn't meant to be the *only* source of truth, and
    // leaving it blank (or never having set it) should just show the
    // real version instead of a stale hardcoded fallback. Fetched once
    // and cached; re-renders the public displays as soon as it resolves
    // in case Firestore's snapshot already rendered first.
    let liveAppVersion = null;

    async function loadLiveAppVersion() {
        try {
            if (window.electronAPI?.getAppInfo) {
                const info = await window.electronAPI.getAppInfo();
                liveAppVersion = info?.version || null;
            }
        } catch (err) {
            console.warn("devpanel: could not read live app version:", err);
        }

        if (liveAppVersion) {
            renderPublicDisplays(DevPanel.cachedConfig);
        }
    }

    // Single source of truth for "what version is this, really" — the
    // same fallback chain renderAboutEsmModal/renderSettingsAbout already
    // use (Firestore override -> real installed version -> hardcoded
    // fallback). Exposed on DevPanel so other modules (Release Management
    // in feedback.js) don't have to read cachedConfig.version directly and
    // risk skipping the fallback chain (e.g. if version is ever an empty
    // string in Firestore rather than simply missing).
    function getEffectiveVersion() {
        return DevPanel.cachedConfig.version || liveAppVersion || FALLBACK_CONFIG.version;
    }
    DevPanel.getEffectiveVersion = getEffectiveVersion;

    // ===========================================
    // HELPERS
    // ===========================================

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    // Turns \n\n-separated blocks into <p> tags, single \n into <br>,
    // matching how the credits text used to be laid out as separate
    // hardcoded <p> elements.
    function textToParagraphs(str) {
        const safe = escapeHtml(str || "").trim();
        if (!safe) return "";
        return safe
            .split(/\n{2,}/)
            .map(block => `<p>${block.replace(/\n/g, "<br>")}</p>`)
            .join("");
    }

    function formatWhen(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function cloneConfig(cfg) {
        return {
            version: cfg.version || "",
            aboutText: cfg.aboutText || "",
            credits: cfg.credits || "",
            releaseNotes: Array.isArray(cfg.releaseNotes) ? cfg.releaseNotes.map(n => ({ ...n })) : [],
            customFields: Array.isArray(cfg.customFields) ? cfg.customFields.map(f => ({ ...f })) : [],
            updatedBy: cfg.updatedBy || null,
            updatedAt: cfg.updatedAt || null
        };
    }

    function sortedReleaseNotes(cfg) {
        return [...(cfg.releaseNotes || [])].sort((a, b) => {
            // newest first — by date string if present, else insertion order
            if (a.date && b.date) return b.date.localeCompare(a.date);
            return 0;
        });
    }

    // Release Notes History — search + sort (Automatic Release Notes /
    // Changelog Generator feature). Filters/reorders the same in-memory
    // draft.releaseNotes list the editor already has; no new Firestore reads.
    let devReleaseNotesSearch = "";
    let devReleaseNotesSort = "newest"; // "newest" | "oldest"

    function filteredReleaseNotesForEditor(draft) {
        let notes = sortedReleaseNotes(draft); // newest-first baseline
        if (devReleaseNotesSearch) {
            const q = devReleaseNotesSearch.toLowerCase();
            notes = notes.filter(n => (n.version || "").toLowerCase().includes(q));
        }
        if (devReleaseNotesSort === "oldest") notes = [...notes].reverse();
        return notes;
    }

    // ===========================================
    // LIVE SYNC — everyone reads this
    // ===========================================

    function listenAppConfig() {
        db.collection("appConfig")
            .doc("main")
            .onSnapshot(doc => {

                const data = doc.exists ? doc.data() : {};
                DevPanel.cachedConfig = {
                    ...FALLBACK_CONFIG,
                    ...data,
                    releaseNotes: Array.isArray(data.releaseNotes) ? data.releaseNotes : [],
                    customFields: Array.isArray(data.customFields) ? data.customFields : []
                };

                renderPublicDisplays(DevPanel.cachedConfig);

                // Keep the panel's own footer (last updated by/when) live
                // even while it's open, without clobbering whatever the
                // developer is mid-typing in the form fields.
                if (window.isDeveloperAccount()) {
                    renderDevPanelFooter(DevPanel.cachedConfig);
                }

                // Release Management (Automatic Release Notes / Changelog
                // Generator, feedback.js) shows Current/Previous Version off
                // this same config — keep it live without a second listener.
                window.renderReleaseManagementPanel?.();

            }, err => console.error("appConfig listener failed:", err));
    }

    // ===========================================
    // PUBLIC-FACING RENDER (About modal, Settings > About, Release Notes)
    // ===========================================

    function renderPublicDisplays(cfg) {
        renderAboutEsmModal(cfg);
        renderSettingsAbout(cfg);
        renderReleaseNotesModal(cfg);
    }

    function renderAboutEsmModal(cfg) {
        const label = document.getElementById("aboutEsmVersionLabel");
        const footer = document.getElementById("aboutEsmVersionFooter");
        const body = document.getElementById("aboutEsmCreditsBody");

        const versionText = `Release Version ${getEffectiveVersion()}`;

        if (label) label.textContent = versionText;
        if (footer) footer.textContent = versionText;
        if (body) body.innerHTML = textToParagraphs(cfg.credits || FALLBACK_CONFIG.credits) + customFieldsHtml(cfg);
    }

    function renderSettingsAbout(cfg) {
        const aboutTextEl = document.getElementById("settingsAboutText");
        const versionEl = document.getElementById("settingsVersion");
        const creditsEl = document.getElementById("settingsCreditsText");

        if (aboutTextEl) aboutTextEl.textContent = cfg.aboutText || FALLBACK_CONFIG.aboutText;
        if (versionEl) versionEl.textContent = getEffectiveVersion();
        if (creditsEl) creditsEl.innerHTML = textToParagraphs(cfg.credits || FALLBACK_CONFIG.credits);
    }

    function customFieldsHtml(cfg) {
        if (!cfg.customFields || !cfg.customFields.length) return "";
        return cfg.customFields
            .filter(f => f.label || f.value)
            .map(f => `<p><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.value)}</p>`)
            .join("");
    }

    function renderReleaseNotesModal(cfg) {
        const list = document.getElementById("releaseNotesList");
        if (!list) return;

        const notes = sortedReleaseNotes(cfg);

        if (!notes.length) {
            list.innerHTML = `<div class="workspaceEmpty">No release notes yet.</div>`;
            return;
        }

        list.innerHTML = notes.map(n => `
            <div class="releaseNoteEntry">
                <div class="releaseNoteHeader">
                    <strong>v${escapeHtml(n.version || "")}</strong>
                    <span class="releaseNoteDate">${escapeHtml(n.date || "")}</span>
                </div>
                <div class="releaseNoteBody">${textToParagraphs(n.notes || "")}</div>
            </div>
        `).join("");
    }

    window.openReleaseNotesModal = function () {
        const overlay = document.getElementById("releaseNotesModal");
        if (!overlay) return;
        renderReleaseNotesModal(DevPanel.cachedConfig);
        overlay.classList.remove("hidden");
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden", "false");
    };

    window.closeReleaseNotesModal = function () {
        const overlay = document.getElementById("releaseNotesModal");
        if (!overlay) return;
        overlay.classList.add("hidden");
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
    };

    // ===========================================
    // ACCESS BUTTON (mirrors auth.js's applyAdminPanelButtonVisibility)
    // ===========================================

    window.applyDevPanelButtonVisibility = function () {
        const btn = document.getElementById("devPanelAccessBtn");
        if (!btn) return;

        if (window.isDeveloperAccount()) {
            btn.classList.remove("hidden");
            btn.onclick = () => openDevPanel();
        } else {
            btn.classList.add("hidden");
        }
    };

    // ===========================================
    // DEVELOPER PANEL — FORM
    // ===========================================

    function openDevPanel() {
        if (!window.isDeveloperAccount()) return; // belt & suspenders — button should already be hidden

        DevPanel.draft = cloneConfig(DevPanel.cachedConfig);
        DevPanel.dirty = false;

        showScreen("devPanelScreen");
        populateForm(DevPanel.draft);
    }

    function closeDevPanel() {
        if (DevPanel.dirty && !confirm(window.I18N ? window.I18N.t("devpanel.confirmDiscardClose") : "You have unsaved changes in the Developer Panel. Discard them?")) {
            return;
        }
        DevPanel.draft = null;
        DevPanel.dirty = false;
        showScreen("dashboardScreen");
    }

    function markDirty() {
        DevPanel.dirty = true;
        const saveBtn = document.getElementById("devPanelSaveBtn");
        if (saveBtn) saveBtn.textContent = "💾 Save Changes *";
    }

    function populateForm(draft) {
        const versionInput = document.getElementById("devVersionInput");
        const aboutInput = document.getElementById("devAboutTextInput");
        const creditsInput = document.getElementById("devCreditsInput");

        if (versionInput) versionInput.value = draft.version || "";
        if (aboutInput) aboutInput.value = draft.aboutText || "";
        if (creditsInput) creditsInput.value = draft.credits || "";

        const saveBtn = document.getElementById("devPanelSaveBtn");
        if (saveBtn) saveBtn.textContent = "💾 Save Changes";

        renderReleaseNotesEditor(draft);
        renderCustomFieldsEditor(draft);
        renderDevPanelFooter(draft);
    }

    function renderDevPanelFooter(cfg) {
        const footer = document.getElementById("devPanelFooterInfo");
        if (!footer) return;

        footer.textContent = cfg.updatedBy
            ? `Last updated by ${cfg.updatedBy} • ${formatWhen(cfg.updatedAt)}`
            : "Not yet edited — showing default/fallback content.";
    }

    // --- Release notes editor -----------------------------------

    function renderReleaseNotesEditor(draft) {
        const list = document.getElementById("devReleaseNotesList");
        if (!list) return;

        const notes = filteredReleaseNotesForEditor(draft);

        if (!notes.length) {
            list.innerHTML = `<div class="workspaceEmpty">${devReleaseNotesSearch ? "No versions match your search." : "No entries yet — add one below."}</div>`;
            return;
        }

        list.innerHTML = notes.map(n => `
            <div class="devPanelListItem" data-note-id="${escapeHtml(n.id)}">
                <div class="devPanelListItemHeader">
                    <strong>v${escapeHtml(n.version || "")}</strong>
                    <span class="releaseNoteDate">${escapeHtml(n.date || "")}</span>
                    <button type="button" class="dangerButton devPanelRemoveNoteBtn" data-note-id="${escapeHtml(n.id)}">🗑 Delete</button>
                </div>
                ${n.stats ? `<p class="settingsHint">✨ ${n.stats.newFeatures} New Features · 🐛 ${n.stats.bugFixes} Bug Fixes · 🔧 ${n.stats.improvements} Improvements · 🚧 ${n.stats.inProgress} In Progress</p>` : ""}
                <div class="devPanelListItemBody">${escapeHtml(n.notes || "").replace(/\n/g, "<br>")}</div>
            </div>
        `).join("");

        list.querySelectorAll(".devPanelRemoveNoteBtn").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.noteId;
                DevPanel.draft.releaseNotes = DevPanel.draft.releaseNotes.filter(n => n.id !== id);
                markDirty();
                renderReleaseNotesEditor(DevPanel.draft);
            });
        });
    }

    function bindAddReleaseNote() {
        document.getElementById("devAddReleaseNoteBtn")?.addEventListener("click", () => {
            const versionEl = document.getElementById("devNewNoteVersion");
            const dateEl = document.getElementById("devNewNoteDate");
            const notesEl = document.getElementById("devNewNoteText");

            const version = (versionEl?.value || "").trim();
            const notes = (notesEl?.value || "").trim();
            const date = dateEl?.value || new Date().toISOString().slice(0, 10);

            if (!version || !notes) {
                alert(window.I18N ? window.I18N.t("devpanel.releaseNotesRequired") : "Version and notes are both required for a release notes entry.");
                return;
            }

            if (!DevPanel.draft) return;

            DevPanel.draft.releaseNotes.push({
                id: `rn_${Date.now()}`,
                version,
                date,
                notes
            });

            markDirty();
            renderReleaseNotesEditor(DevPanel.draft);

            if (versionEl) versionEl.value = "";
            if (dateEl) dateEl.value = "";
            if (notesEl) notesEl.value = "";
        });
    }

    // --- Custom fields editor (forward-compat) --------------------

    function renderCustomFieldsEditor(draft) {
        const list = document.getElementById("devCustomFieldsList");
        if (!list) return;

        if (!draft.customFields.length) {
            list.innerHTML = `<div class="workspaceEmpty">No custom fields yet.</div>`;
        } else {
            list.innerHTML = draft.customFields.map((f, i) => `
                <div class="devPanelListItem devCustomFieldRow" data-index="${i}">
                    <input type="text" class="devCustomFieldLabel" placeholder="Label" value="${escapeHtml(f.label)}">
                    <input type="text" class="devCustomFieldValue" placeholder="Value" value="${escapeHtml(f.value)}">
                    <button type="button" class="dangerButton devPanelRemoveFieldBtn" data-index="${i}">🗑</button>
                </div>
            `).join("");
        }

        list.querySelectorAll(".devCustomFieldRow").forEach(row => {
            const i = Number(row.dataset.index);
            row.querySelector(".devCustomFieldLabel")?.addEventListener("input", (e) => {
                DevPanel.draft.customFields[i].label = e.target.value;
                markDirty();
            });
            row.querySelector(".devCustomFieldValue")?.addEventListener("input", (e) => {
                DevPanel.draft.customFields[i].value = e.target.value;
                markDirty();
            });
        });

        list.querySelectorAll(".devPanelRemoveFieldBtn").forEach(btn => {
            btn.addEventListener("click", () => {
                const i = Number(btn.dataset.index);
                DevPanel.draft.customFields.splice(i, 1);
                markDirty();
                renderCustomFieldsEditor(DevPanel.draft);
            });
        });
    }

    function bindAddCustomField() {
        document.getElementById("devAddCustomFieldBtn")?.addEventListener("click", () => {
            if (!DevPanel.draft) return;
            DevPanel.draft.customFields.push({ label: "", value: "" });
            markDirty();
            renderCustomFieldsEditor(DevPanel.draft);
        });
    }

    // --- Save / reload ---------------------------------------------

    async function saveDevPanelConfig() {
        if (!window.isDeveloperAccount() || !DevPanel.draft) return;

        const versionInput = document.getElementById("devVersionInput");
        const aboutInput = document.getElementById("devAboutTextInput");
        const creditsInput = document.getElementById("devCreditsInput");
        const resultEl = document.getElementById("devPanelSaveResult");

        const payload = {
            // Blank means "auto" — Settings > About / the About modal will
            // fall back to the real installed app version. Only a
            // deliberately-typed value here overrides that.
            version: (versionInput?.value || "").trim(),
            aboutText: aboutInput?.value || "",
            credits: creditsInput?.value || "",
            releaseNotes: DevPanel.draft.releaseNotes,
            customFields: DevPanel.draft.customFields.filter(f => f.label || f.value),
            updatedBy: RelayDesk.currentUser,
            updatedAt: Date.now()
        };

        if (resultEl) resultEl.textContent = "Saving...";

        try {
            await db.collection("appConfig").doc("main").set(payload, { merge: true });

            DevPanel.dirty = false;
            const saveBtn = document.getElementById("devPanelSaveBtn");
            if (saveBtn) saveBtn.textContent = "💾 Save Changes";

            if (resultEl) resultEl.textContent = `Saved ✅ (${formatWhen(payload.updatedAt)})`;

            window.NotificationManager?.notify(window.I18N ? window.I18N.t("devpanel.savedNotify") : "💾 Developer Panel changes saved — now live for everyone", "success", { category: "system", desktop: false })
                ?? window.showToast?.(window.I18N ? window.I18N.t("devpanel.savedToast") : "💾 Changes saved and are now live for everyone", "success");
        } catch (err) {
            console.error("Failed to save Developer Panel config:", err);
            if (resultEl) resultEl.textContent = "❌ Save failed — check your connection and try again.";
        }
    }

    function bindReloadButton() {
        document.getElementById("devPanelReloadBtn")?.addEventListener("click", () => {
            if (DevPanel.dirty && !confirm(window.I18N ? window.I18N.t("devpanel.confirmDiscardReload") : "Discard your unsaved changes and reload the last-saved version?")) {
                return;
            }
            DevPanel.draft = cloneConfig(DevPanel.cachedConfig);
            DevPanel.dirty = false;
            populateForm(DevPanel.draft);
        });
    }

    // ===========================================
    // WIRING
    // ===========================================

    function bindStaticUI() {
        if (DevPanel.formInitialized) return;
        DevPanel.formInitialized = true;

        document.getElementById("devPanelBackBtn")?.addEventListener("click", closeDevPanel);
        document.getElementById("devPanelSaveBtn")?.addEventListener("click", saveDevPanelConfig);

        ["devVersionInput", "devAboutTextInput", "devCreditsInput"].forEach(id => {
            document.getElementById(id)?.addEventListener("input", markDirty);
        });

        bindAddReleaseNote();
        bindAddCustomField();
        bindReloadButton();

        const rnSearchInput = document.getElementById("devReleaseNotesSearchInput");
        const rnSortSelect = document.getElementById("devReleaseNotesSortSelect");
        if (rnSearchInput) {
            rnSearchInput.addEventListener("input", () => {
                devReleaseNotesSearch = rnSearchInput.value.trim();
                if (DevPanel.draft) renderReleaseNotesEditor(DevPanel.draft);
            });
        }
        if (rnSortSelect) {
            rnSortSelect.value = devReleaseNotesSort;
            rnSortSelect.addEventListener("change", () => {
                devReleaseNotesSort = rnSortSelect.value;
                if (DevPanel.draft) renderReleaseNotesEditor(DevPanel.draft);
            });
        }

        document.getElementById("viewReleaseNotesBtn")?.addEventListener("click", window.openReleaseNotesModal);
        document.getElementById("aboutEsmReleaseNotesBtn")?.addEventListener("click", window.openReleaseNotesModal);
    }

    window.initDevPanel = function () {
        if (DevPanel.initialized) return;
        DevPanel.initialized = true;

        bindStaticUI();
        listenAppConfig();
        renderPublicDisplays(DevPanel.cachedConfig); // paint fallback immediately, before Firestore responds
        loadLiveAppVersion(); // then swap in the real version once it resolves, if nothing overrides it
    };

})();
