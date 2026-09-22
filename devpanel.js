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

    // ===========================================
    // ESM DIAGNOSTICS — read-only developer health checks
    // ===========================================

    function diagnosticRow(label, status, detail) {
        const icon = status === "pass" ? "✅" : status === "warn" ? "⚠️" : "❌";
        return `
            <div class="devDiagnosticRow devDiagnostic-${status}">
                <div class="devDiagnosticIcon">${icon}</div>
                <div class="devDiagnosticContent">
                    <strong>${escapeHtml(label)}</strong>
                    <span>${escapeHtml(detail)}</span>
                </div>
            </div>
        `;
    }

    async function runDevDiagnostics() {
        if (!window.isDeveloperAccount()) return;

        const list = document.getElementById("devDiagnosticsList");
        const summary = document.getElementById("devDiagnosticsSummary");
        const stamp = document.getElementById("devDiagnosticsTimestamp");
        const btn = document.getElementById("devDiagnosticsRunBtn");

        if (!list || !summary) return;

        if (btn) {
            btn.disabled = true;
            btn.textContent = "⏳ Running...";
        }

        const results = [];

        function check(label, ok, detail, warn = false) {
            results.push({
                label,
                status: ok ? "pass" : (warn ? "warn" : "fail"),
                detail
            });
        }

        check(
            "Renderer",
            document.readyState === "complete" || document.readyState === "interactive",
            `DOM is ${document.readyState}.`
        );

        const requiredIds = [
            "dashboardScreen",
            "dashboardDispatchArea",
            "safetyDashboardArea",
            "safetyDashboardBody",
            "devPanelScreen",
            "devPanelSaveBtn",
            "adminPanelAccessBtn"
        ];
        const missingIds = requiredIds.filter(id => !document.getElementById(id));
        check(
            "Core UI",
            missingIds.length === 0,
            missingIds.length ? `Missing: ${missingIds.join(", ")}` : "Required dashboard/admin/developer elements are present."
        );

        check(
            "Firebase / Firestore",
            typeof window.db !== "undefined" && !!window.db,
            typeof window.db !== "undefined" && !!window.db ? "Firestore client is initialized." : "Firestore client is not initialized."
        );

        check(
            "Firebase Auth",
            typeof firebase !== "undefined" && !!firebase.auth,
            typeof firebase !== "undefined" && !!firebase.auth ? "Firebase Auth API is loaded." : "Firebase Auth API is unavailable."
        );

        check(
            "Permissions API",
            typeof window.hasPermission === "function" && typeof window.getEffectivePermissionLevel === "function",
            typeof window.hasPermission === "function" && typeof window.getEffectivePermissionLevel === "function"
                ? "Permission resolver and permission checks are available."
                : "One or more permission APIs are missing."
        );

        check(
            "Settings API",
            !!window.ESMSettings?.get && !!window.ESMSettings?.set,
            window.ESMSettings?.get && window.ESMSettings?.set
                ? "Persistent settings API is available."
                : "ESMSettings API is unavailable."
        );

        check(
            "Safety / HOS",
            !!window.SafetyDashboard && !!window.SafetyHOS,
            window.SafetyDashboard && window.SafetyHOS
                ? "Safety Dashboard and Driver HOS modules are loaded."
                : "Safety Dashboard or Driver HOS module is missing."
        );

        const workspaceScript = !!document.querySelector('script[src="workspace.js"]');
        const loadButton = !!document.getElementById("addLoadBtn");
        check(
            "Workspace / Load Booking",
            workspaceScript && loadButton,
            workspaceScript && loadButton
                ? "Workspace script and Add Load entry point are present."
                : "Workspace script or Add Load entry point is missing."
        );

        const electronApi = !!window.electronAPI;
        check(
            "Electron Runtime",
            electronApi,
            electronApi ? "Electron bridge is available." : "Electron bridge is unavailable (web/PWA mode or preload issue).",
            !electronApi
        );

        if (electronApi && typeof window.electronAPI.getAppInfo === "function") {
            try {
                const info = await window.electronAPI.getAppInfo();
                check(
                    "Installed Version",
                    !!info?.version,
                    info?.version ? `Running ESM v${info.version}.` : "Electron returned no app version."
                );
            } catch (err) {
                check("Installed Version", false, "Could not read Electron app metadata.", true);
            }
        } else {
            check("Installed Version", false, "getAppInfo() is unavailable.", true);
        }

        if (window.db?.collection) {
            try {
                const snap = await db.collection("appConfig").doc("main").get();
                check(
                    "Firestore Read",
                    true,
                    snap.exists ? "appConfig/main is readable." : "Firestore is reachable; appConfig/main does not exist yet.",
                    !snap.exists
                );
            } catch (err) {
                check("Firestore Read", false, err?.message || "Firestore read failed.");
            }
        } else {
            check("Firestore Read", false, "Skipped because Firestore is unavailable.");
        }

        const passCount = results.filter(r => r.status === "pass").length;
        const warnCount = results.filter(r => r.status === "warn").length;
        const failCount = results.filter(r => r.status === "fail").length;

        list.innerHTML = results.map(r => diagnosticRow(r.label, r.status, r.detail)).join("");

        const summaryStatus = failCount ? "fail" : warnCount ? "warn" : "pass";
        const summaryIcon = summaryStatus === "pass" ? "🟢" : summaryStatus === "warn" ? "🟡" : "🔴";
        summary.innerHTML = `
            <span class="permBadge">${summaryIcon} ${passCount} passed</span>
            <span class="permBadge">⚠️ ${warnCount} warnings</span>
            <span class="permBadge">❌ ${failCount} failed</span>
        `;

        if (stamp) stamp.textContent = `Last run: ${formatWhen(Date.now())}`;

        if (btn) {
            btn.disabled = false;
            btn.textContent = "🧪 Run Diagnostics";
        }

        return { results, passCount, warnCount, failCount };
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

        document.getElementById("devDiagnosticsRunBtn")?.addEventListener("click", runDevDiagnostics);

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

        bindDataExportControls();
    }

    // ===========================================
    // PHASE 7: DATA RECOVERY & GITHUB EXPORT
    // (Developer accounts only)
    // ===========================================
    // Full-Firestore export bundler + optional push to a private GitHub
    // repo, mirroring the same Contents-API PUT pattern already used by
    // MonthlyStatsGithubBackup / ViolationsGithubBackup (monthlystats.js /
    // violations.js). Config lives in its own doc (system/devExportConfig)
    // — kept separate from appConfig/main so it's independent of the
    // Version/Credits/Release Notes save flow above.
    //
    // ⚠️ SECURITY NOTE: same caveat as the other GitHub integrations —
    // whatever token is saved here lands in Firestore, which is
    // world-readable/writable under the temporary open rule in
    // firestore.rules until it expires. Use a fine-grained, repo-scoped
    // token.

    const DEV_EXPORT_COLLECTIONS = [
        "announcements", "appConfig", "auditLogs", "chats", "featureRequests",
        "loadChangeNotifications", "loadVridIndex", "monthlyStatsArchive",
        "offDayChangeRequests", "overtimeRequests", "shiftHistory", "shifts",
        "system", "users", "violationLogs", "violationsArchive"
    ];

    window.DevDataExport = {
        enabled: false,
        repo: "",
        path: "esm-backups",
        token: ""
    };

    async function loadDevExportConfig() {
        try {
            const doc = await db.collection("system").doc("devExportConfig").get();
            const cfg = doc.exists ? doc.data() : {};
            window.DevDataExport.enabled = !!cfg.githubBackupEnabled;
            window.DevDataExport.repo = cfg.githubRepo || "";
            window.DevDataExport.path = cfg.githubPath || "esm-backups";
            window.DevDataExport.token = cfg.githubToken || "";
        } catch (err) {
            console.warn("Dev Data Export: could not load config:", err);
        }
    }

    // Pulls every collection in DEV_EXPORT_COLLECTIONS into one bundle,
    // tagged with the metadata the roadmap asked for (month/year/
    // timestamp/ESM version).
    async function buildFullExportBundle() {
        const now = new Date();
        const data = {};

        for (const name of DEV_EXPORT_COLLECTIONS) {
            const snap = await db.collection(name).get();
            const docs = {};
            snap.forEach(d => { docs[d.id] = d.data(); });
            data[name] = docs;
        }

        return {
            meta: {
                exportedAt: now.getTime(),
                year: now.getUTCFullYear(),
                month: now.getUTCMonth() + 1,
                esmVersion: getEffectiveVersion(),
                exportedBy: RelayDesk.currentUser || "system-auto"
            },
            data
        };
    }

    function downloadJsonFile(filename, obj) {
        const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    async function uploadJsonToGithub(filename, obj, commitMessage) {
        const cfg = window.DevDataExport;
        if (!cfg.repo || !cfg.token) throw new Error("GitHub repo/token not configured");

        const path = `${cfg.path.replace(/\/$/, "")}/${filename}`;
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));

        const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
            method: "PUT",
            headers: {
                "Authorization": `token ${cfg.token}`,
                "Accept": "application/vnd.github+json"
            },
            body: JSON.stringify({ message: commitMessage, content })
        });

        if (!res.ok) {
            throw new Error(`GitHub upload failed: ${res.status} ${await res.text()}`);
        }
    }

    // reason: "manual" | "pre-monthly-archive" | "pre-violations-archive".
    // Manual runs always trigger a local download; every reason pushes to
    // GitHub too if that's enabled/configured. Callers that fire this
    // ahead of an archive (monthlystats.js / violations.js) always wrap
    // it in a .catch() — a failed backup export must never block the
    // archive itself.
    window.DevDataExport.runFullExport = async function (reason = "manual") {
        const bundle = await buildFullExportBundle();
        const stamp = new Date(bundle.meta.exportedAt).toISOString().replace(/[:.]/g, "-");
        const filename = `esm-export-${bundle.meta.year}-${String(bundle.meta.month).padStart(2, "0")}-${stamp}.json`;

        if (reason === "manual") {
            downloadJsonFile(filename, bundle);
        }

        if (window.DevDataExport.enabled) {
            await uploadJsonToGithub(filename, bundle, `ESM data export (${reason}) — ${bundle.meta.year}-${String(bundle.meta.month).padStart(2, "0")}`);
        }

        if (typeof window.logAudit === "function") {
            window.logAudit(RelayDesk.currentUser || "system-auto", "EXPORT_DEV_BACKUP", `Reason: ${reason}`);
        }

        return filename;
    };

    // Item 11 — GitHub Export Test: a real upload of a small test file so
    // a developer can confirm repo/token/path are correct before relying
    // on the automatic pre-archive export.
    window.DevDataExport.runExportTest = async function () {
        const testPayload = { test: true, timestamp: Date.now(), esmVersion: getEffectiveVersion() };
        await uploadJsonToGithub("esm_export_test.json", testPayload, "ESM GitHub Export Test");
    };

    function bindDataExportControls() {
        const box = document.getElementById("devDataExportSection");
        if (!box) return;

        const enabledCk = document.getElementById("devExportGithubEnabled");
        const repoInput = document.getElementById("devExportGithubRepo");
        const pathInput = document.getElementById("devExportGithubPath");
        const tokenInput = document.getElementById("devExportGithubToken");
        const saveBtn = document.getElementById("devExportConfigSaveBtn");
        const exportBtn = document.getElementById("devExportNowBtn");
        const exportResult = document.getElementById("devExportNowResult");
        const testBtn = document.getElementById("devExportTestBtn");
        const testResult = document.getElementById("devExportTestResult");

        loadDevExportConfig().then(() => {
            if (enabledCk) enabledCk.checked = window.DevDataExport.enabled;
            if (repoInput) repoInput.value = window.DevDataExport.repo;
            if (pathInput) pathInput.value = window.DevDataExport.path;
        });

        saveBtn?.addEventListener("click", async () => {
            const cfg = {
                githubBackupEnabled: !!enabledCk?.checked,
                githubRepo: repoInput?.value.trim() || "",
                githubPath: pathInput?.value.trim() || "esm-backups",
                githubToken: tokenInput?.value.trim() || window.DevDataExport.token
            };
            await db.collection("system").doc("devExportConfig").set(cfg, { merge: true });
            await loadDevExportConfig();
            if (tokenInput) tokenInput.value = "";
            alert("GitHub export settings saved.");
        });

        exportBtn?.addEventListener("click", async () => {
            if (exportResult) exportResult.textContent = "Exporting...";
            try {
                const filename = await window.DevDataExport.runFullExport("manual");
                if (exportResult) exportResult.textContent = `✅ Exported: ${filename}`;
            } catch (err) {
                console.error("Manual data export failed:", err);
                if (exportResult) exportResult.textContent = `❌ Export failed: ${err.message}`;
            }
        });

        testBtn?.addEventListener("click", async () => {
            if (testResult) testResult.textContent = "Testing...";
            try {
                await window.DevDataExport.runExportTest();
                if (testResult) testResult.textContent = "✅ Test upload succeeded — check the repo for esm_export_test.json";
            } catch (err) {
                console.error("GitHub export test failed:", err);
                if (testResult) testResult.textContent = `❌ Test failed: ${err.message}`;
            }
        });
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
