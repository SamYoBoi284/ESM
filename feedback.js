// ===========================================
// RelayDesk / ESM
// feedback.js
// FEEDBACK / FEATURE REQUEST SYSTEM
// ===========================================
//
// Implements the "Feedback / Feature Request System Expansion" spec.
// This file is being built in batches (per the spec's own request to
// implement incrementally). See ESM_Release_Context_Tracker.md for
// which batch shipped what.
//
// BATCH 1 (Foundation) + BATCH 2 (Employee submission flow) + BATCH 3
// (Employee Voting System) + BATCH 4 (Timeline & Notifications) +
// BATCH 5 (Dev Panel core) + BATCH 6 (Dev Panel search & archive) +
// BATCH 7 (Contributor Stats) + BATCH 8 (Release notes integration)
// have shipped:
//   - Firestore schema for featureRequests
//   - Request Type / Priority / Category dropdowns
//   - Automatically-collected metadata (employee code, permission
//     level, shift, app version, current page/panel)
//   - Reproducibility dropdown for Bug Reports
//   - Duplicate detection while typing a title, with "Open" and
//     "Vote for it instead" actions
//   - A minimal "My Submitted Requests" list so an employee can see
//     what they've already sent in and its current status
//   - "Browse & Vote on Ideas" — a live, sortable list of every open
//     request with a "👍 I Also Want This" button, one vote per
//     employee, showing Total Votes + Employees Supporting
//   - Automatic, timestamped Timeline on every request (Submitted /
//     Viewed / status changes), shown in the read-only view modal to
//     both the submitter and the developer
//   - A minimal developer-only status-change control (New -> Pending
//     -> In Progress -> Completed | Rejected) inside that same view
//     modal, just enough to drive the timeline + notifications below.
//     Batch 5 replaces this with the real Dev Panel management UI
//     (labels, planned version, favorites) alongside a proper request
//     list — this control will very likely move/expand there.
//   - Live notification to the original submitter when status changes,
//     via a per-employee onSnapshot listener (see NOTIFICATIONS below
//     for why — this app has no push/inbox system)
//   - Dev Panel request management: labels, planned version,
//     favorites, status changes, all inside a real request list
//   - Dev Panel free-text search (title/description/employee
//     code/category/priority/status/planned version/labels) and an
//     Active <-> Archive (Completed/Rejected) view toggle, both
//     filtering the same in-memory cache — no new Firestore query
//   - Dev Panel Contributor Stats: a summary strip (total requests,
//     contributors, votes cast, completed) plus three top-10
//     leaderboards (Top Submitters, Most Votes Received, Most Active
//     Voters), all computed client-side from the same unfiltered
//     devRequestsCache — no new Firestore reads or fields
//   - "Planned for Upcoming Versions" in Settings > About: every
//     employee (not dev-gated) sees active (non-completed/rejected)
//     requests grouped by `plannedVersion`, live-updated, computed
//     client-side from one unfiltered onSnapshot() started when that
//     Settings tab is opened and stopped when it's left
//
// ===========================================
// FIRESTORE SHAPE
// ===========================================
//   featureRequests/{autoId} -> {
//       title:            string,
//       description:      string,
//       type:             "bug" | "feature" | "improvement" | "ui" | "other",
//       priority:         "low" | "medium" | "high" | "critical",
//       category:         "chat" | "loads" | "dispatch" | "safety" | "ui" |
//                         "notifications" | "login" | "performance" |
//                         "settings" | "localization" | "admin_panel" | "other",
//       reproducibility:  "always" | "sometimes" | "once" | "not_tried_again" | null,
//                         // bug reports only, else null
//
//       // ---- automatically collected (Batch 1, section 4) ----
//       submittedBy:        employee code, e.g. "A004",
//       submittedByPermissionLevel: string,      // permissions.js permissionLevel at submit time
//       submittedByShift:   string,              // assignedShift label at submit time, or "Unassigned"
//       appVersion:         string,              // RelayDesk.devPanel.cachedConfig.version at submit time
//       submittedFrom:      string,              // visible screen id at submit time, e.g. "dashboardScreen"
//
//       status:           "new",   // pipeline lives in Batch 4/5: new -> pending -> in_progress -> completed | rejected
//       createdAt:        number (Date.now()),
//       updatedAt:        number (Date.now()),
//
//       // ---- reserved for later batches (present now so nothing needs migrating later) ----
//       votes:            number,      // Batch 3 (vote count) — actively used by voteForRequest() below
//       voters:           string[],    // employee codes who voted — actively used by voteForRequest() below
//       devLabels:        string[],    // Batch 5
//       plannedVersion:   string|null, // set in Batch 5's Dev Panel UI, surfaced in Batch 8's Settings > About view
//       favorite:         boolean,     // Batch 5
//       timeline:         [ { stage, status, at } ]   // Batch 4 — first entry seeded on submit
//   }
//
// No new Firestore indexes are required for this batch: every query
// this file issues is a single equality filter, sorted client-side,
// specifically to avoid needing a composite index deploy.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    // ===========================================
    // I18N
    // ===========================================
    if (window.I18N) {
        window.I18N.register("feedback", {
            en: {
                titleRequired: "Please enter a title.",
                descriptionRequired: "Please enter a description.",
                submitted: "🧩 Feedback sent — thanks for helping improve ESM!",
                submitFailed: "Failed to send your feedback. Please try again.",
                alreadyVoted: "You've already voted for this one.",
                voteRecorded: "👍 Vote recorded!",
                voteFailed: "Couldn't record your vote — try again.",
                cannotVoteOwn: "You can't vote for your own request.",
                noSimilar: "No similar requests found — you're good to submit.",
                similarFound: "⚠️ Similar requests found — check before submitting a duplicate:",
                loadingMyRequests: "Loading your requests...",
                noMyRequests: "You haven't submitted any feedback yet."
            },
            ar: {
                titleRequired: "يرجى إدخال عنوان.",
                descriptionRequired: "يرجى إدخال وصف.",
                submitted: "🧩 تم إرسال الملاحظات — شكرًا لمساعدتك في تحسين ESM!",
                submitFailed: "فشل إرسال ملاحظاتك. يرجى المحاولة مرة أخرى.",
                alreadyVoted: "لقد قمت بالتصويت لهذا الطلب بالفعل.",
                voteRecorded: "👍 تم تسجيل تصويتك!",
                voteFailed: "تعذر تسجيل تصويتك — حاول مرة أخرى.",
                cannotVoteOwn: "لا يمكنك التصويت لطلبك الخاص.",
                noSimilar: "لم يتم العثور على طلبات مشابهة — يمكنك المتابعة للإرسال.",
                similarFound: "⚠️ تم العثور على طلبات مشابهة — راجعها قبل إرسال طلب مكرر:",
                loadingMyRequests: "جارٍ تحميل طلباتك...",
                noMyRequests: "لم ترسل أي ملاحظات بعد."
            }
        });
    }

    function t(key, fallback) {
        return window.I18N ? window.I18N.t(`feedback.${key}`) : fallback;
    }

    // ===========================================
    // CONSTANTS (Batch 1, sections 1-3 & 5)
    // ===========================================

    const REQUEST_TYPES = [
        { value: "bug", label: "🐞 Bug Report" },
        { value: "feature", label: "💡 Feature Request" },
        { value: "improvement", label: "⚡ Improvement" },
        { value: "ui", label: "🎨 UI Suggestion" },
        { value: "other", label: "❓ Other" }
    ];

    const PRIORITIES = [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
        { value: "critical", label: "Critical" }
    ];

    const CATEGORIES = [
        { value: "chat", label: "Chat" },
        { value: "loads", label: "Loads" },
        { value: "dispatch", label: "Dispatch" },
        { value: "safety", label: "Safety" },
        { value: "ui", label: "UI" },
        { value: "notifications", label: "Notifications" },
        { value: "login", label: "Login" },
        { value: "performance", label: "Performance" },
        { value: "settings", label: "Settings" },
        { value: "localization", label: "Localization" },
        { value: "admin_panel", label: "Admin Panel" },
        { value: "other", label: "Other" }
    ];

    const REPRODUCIBILITY = [
        { value: "always", label: "Always" },
        { value: "sometimes", label: "Sometimes" },
        { value: "once", label: "Once" },
        { value: "not_tried_again", label: "Didn't Try Again" }
    ];

    const STATUS_LABELS = {
        new: "🆕 New",
        pending: "⏳ Pending",
        in_progress: "🚧 In Progress",
        completed: "✅ Completed",
        rejected: "🚫 Rejected"
    };

    // Order matters here — it's the pipeline from spec section 9:
    // New -> Pending -> In Progress -> Completed OR Rejected.
    const STATUS_OPTIONS = ["new", "pending", "in_progress", "completed", "rejected"];

    // Batch 6: which statuses count as "still active" vs "archived".
    // Completed/Rejected are terminal states in the pipeline above, so
    // they're what the Dev Panel's Archive view surfaces, keeping the
    // default (Active) list focused on things still in flight.
    const ACTIVE_STATUSES = ["new", "pending", "in_progress"];
    const ARCHIVE_STATUSES = ["completed", "rejected"];

    window.FEEDBACK_REQUEST_TYPES = REQUEST_TYPES;
    window.FEEDBACK_PRIORITIES = PRIORITIES;
    window.FEEDBACK_CATEGORIES = CATEGORIES;
    window.FEEDBACK_REPRODUCIBILITY = REPRODUCIBILITY;
    window.FEEDBACK_STATUS_LABELS = STATUS_LABELS;

    let initialized = false;
    let duplicateDebounceHandle = null;
    let duplicateCache = null;          // cached read of featureRequests for client-side fuzzy matching
    let duplicateCacheAt = 0;
    const DUPLICATE_CACHE_TTL = 60000;  // 1 minute — this is a low-write-volume internal tool, no need to re-fetch on every keystroke

    let myRequestsUnsubscribe = null;   // Batch 4: drives status-change notifications
    let myRequestsKnownStatus = null;   // Map<requestId, status> — lets us tell "changed" from "first load"

    // ===========================================
    // HELPERS
    // ===========================================

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    function getCurrentPanelName() {
        const visible = document.querySelector(".screen:not(.hidden)");
        return visible?.id || "unknown";
    }

    function getAppVersion() {
        return window.RelayDesk?.devPanel?.cachedConfig?.version || "unknown";
    }

    // Pulls the bits of "automatically collected information" (spec
    // section 4) that don't live in a cheap-to-read global already —
    // permissionLevel comes straight from the user's own Firestore
    // doc, same read disputes.js already does for the off-day flow.
    // STEP 5 CUTOVER: shiftLabel now resolved via the new Shift
    // Management system (window.getEmployeeAssignedShift — reads the
    // already-live window.SHIFTS_LIST cache, no extra Firestore read
    // needed) instead of the old assignedShift field + SHIFT_CYCLES
    // lookup.
    async function getSubmitterMetadata() {
        const code = RelayDesk.currentUser;

        let permissionLevel = "Employee";

        const resolvedShift = window.getEmployeeAssignedShift?.(code);
        const shiftLabel = resolvedShift ? resolvedShift.name : "Unassigned";

        try {
            const doc = await db.collection("users").doc(code).get();
            if (doc.exists) {
                const data = doc.data();
                permissionLevel = data.permissionLevel || "Employee";
            }
        } catch (err) {
            console.error("Feedback: couldn't read submitter metadata:", err);
        }

        return {
            submittedBy: code,
            submittedByPermissionLevel: permissionLevel,
            submittedByShift: shiftLabel,
            appVersion: getAppVersion(),
            submittedFrom: getCurrentPanelName()
        };
    }

    function optionsHtml(list) {
        return list.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("");
    }

    function populateDropdowns() {
        const typeSelect = document.getElementById("feedbackTypeSelect");
        const prioritySelect = document.getElementById("feedbackPrioritySelect");
        const categorySelect = document.getElementById("feedbackCategorySelect");
        const reproSelect = document.getElementById("feedbackReproSelect");

        if (typeSelect && !typeSelect.dataset.populated) {
            typeSelect.innerHTML = optionsHtml(REQUEST_TYPES);
            typeSelect.dataset.populated = "true";
        }
        if (prioritySelect && !prioritySelect.dataset.populated) {
            prioritySelect.innerHTML = optionsHtml(PRIORITIES);
            prioritySelect.value = "medium";
            prioritySelect.dataset.populated = "true";
        }
        if (categorySelect && !categorySelect.dataset.populated) {
            categorySelect.innerHTML = optionsHtml(CATEGORIES);
            categorySelect.dataset.populated = "true";
        }
        if (reproSelect && !reproSelect.dataset.populated) {
            reproSelect.innerHTML = optionsHtml(REPRODUCIBILITY);
            reproSelect.dataset.populated = "true";
        }
    }

    // ===========================================
    // DUPLICATE DETECTION (Batch 2, section 11)
    // ===========================================
    //
    // Internal tool, small dataset — instead of standing up a search
    // index (Algolia, Firestore array-contains tokens, etc.) for what
    // is realistically a few hundred documents, this does a plain
    // client-side fuzzy match: normalize both strings, score on shared
    // word overlap, and surface the top matches. Good enough to catch
    // "Arabic Localization" vs "arabic localisation" style near-dupes
    // without any extra Firestore index.

    function normalizeTitle(str) {
        return (str || "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter(Boolean);
    }

    function similarityScore(queryWords, candidateWords) {
        if (!queryWords.length || !candidateWords.length) return 0;
        const candidateSet = new Set(candidateWords);
        const shared = queryWords.filter(w => candidateSet.has(w)).length;
        return shared / Math.max(queryWords.length, candidateWords.length);
    }

    async function getDuplicateCandidatePool() {
        const now = Date.now();
        if (duplicateCache && (now - duplicateCacheAt) < DUPLICATE_CACHE_TTL) {
            return duplicateCache;
        }

        // Archived/completed requests are still worth surfacing here —
        // an employee typing a title for something already shipped
        // should see that too, not just re-file it. (Batch 6 will move
        // completed items into a dedicated archive collection view,
        // but they'll stay readable from here the same way.)
        const snapshot = await db.collection("featureRequests")
            .limit(300)
            .get();

        duplicateCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        duplicateCacheAt = now;
        return duplicateCache;
    }

    async function findSimilarRequests(title) {
        const queryWords = normalizeTitle(title);
        if (queryWords.length < 1) return [];

        const pool = await getDuplicateCandidatePool();

        return pool
            .map(req => ({ req, score: similarityScore(queryWords, normalizeTitle(req.title)) }))
            .filter(({ score }) => score >= 0.34)
            .sort((a, b) => b.score - a.score || (b.req.votes || 0) - (a.req.votes || 0))
            .slice(0, 5)
            .map(({ req }) => req);
    }

    function renderDuplicateSuggestions(matches) {
        const box = document.getElementById("feedbackDuplicateBox");
        if (!box) return;

        if (!matches.length) {
            box.classList.add("hidden");
            box.innerHTML = "";
            return;
        }

        box.classList.remove("hidden");
        box.innerHTML = `
            <div class="feedbackDuplicateHeader">${t("similarFound", "⚠️ Similar requests found — check before submitting a duplicate:")}</div>
            ${matches.map(req => `
                <div class="feedbackDuplicateCard" data-request-id="${req.id}">
                    <div class="feedbackDuplicateTitle">${escapeHtml(req.title)}</div>
                    <div class="feedbackDuplicateMeta">
                        👍 ${req.votes || 0} Votes · ${(req.voters || []).length} Employees Supporting &nbsp;·&nbsp; ${STATUS_LABELS[req.status] || req.status}
                    </div>
                    <div class="feedbackDuplicateActions">
                        <button type="button" class="smallButton feedbackDupOpenBtn" data-request-id="${req.id}">Open</button>
                        <button type="button" class="smallButton feedbackDupVoteBtn" data-request-id="${req.id}">👍 I Also Want This</button>
                    </div>
                </div>
            `).join("")}
        `;

        box.querySelectorAll(".feedbackDupOpenBtn").forEach(btn => {
            btn.onclick = () => openFeedbackViewModal(btn.dataset.requestId, "feedbackModal");
        });
        box.querySelectorAll(".feedbackDupVoteBtn").forEach(btn => {
            btn.onclick = () => voteForRequest(btn.dataset.requestId);
        });
    }

    function bindDuplicateDetection() {
        const titleInput = document.getElementById("feedbackTitleInput");
        if (!titleInput) return;

        titleInput.addEventListener("input", () => {
            clearTimeout(duplicateDebounceHandle);
            const value = titleInput.value.trim();

            if (value.length < 3) {
                renderDuplicateSuggestions([]);
                return;
            }

            duplicateDebounceHandle = setTimeout(async () => {
                try {
                    const matches = await findSimilarRequests(value);
                    renderDuplicateSuggestions(matches);
                } catch (err) {
                    console.error("Feedback duplicate check failed:", err);
                }
            }, 400);
        });
    }

    // ===========================================
    // VOTING (core function only — Batch 3 builds the full UI)
    // ===========================================

    async function voteForRequest(requestId) {
        const code = RelayDesk.currentUser;
        const ref = db.collection("featureRequests").doc(requestId);

        try {
            await db.runTransaction(async (tx) => {
                const doc = await tx.get(ref);
                if (!doc.exists) throw new Error("not-found");

                const data = doc.data();

                if (data.submittedBy === code) {
                    throw new Error("own-request");
                }

                const voters = Array.isArray(data.voters) ? data.voters : [];
                if (voters.includes(code)) {
                    throw new Error("already-voted");
                }

                tx.update(ref, {
                    votes: (data.votes || 0) + 1,
                    voters: [...voters, code],
                    updatedAt: Date.now()
                });
            });

            notify(t("voteRecorded", "👍 Vote recorded!"), "success");
            duplicateCache = null; // force a fresh read next time so vote counts stay accurate

        } catch (err) {
            if (err.message === "already-voted") {
                notify(t("alreadyVoted", "You've already voted for this one."), "warning");
            } else if (err.message === "own-request") {
                notify(t("cannotVoteOwn", "You can't vote for your own request."), "warning");
            } else {
                console.error("Vote failed:", err);
                notify(t("voteFailed", "Couldn't record your vote — try again."), "error");
            }
        }
    }
    window.voteForFeatureRequest = voteForRequest;

    function notify(message, type) {
        if (typeof window.NotificationManager === "object") {
            window.NotificationManager.notify(message, type, { category: "system" });
        } else if (typeof window.showToast === "function") {
            window.showToast(message, type);
        }
    }

    // ===========================================
    // VIEW MODAL (read-only detail — used by Duplicate Detection's
    // "Open" action and by "My Submitted Requests")
    // ===========================================

    // ===========================================
    // TIMELINE & STATUS CHANGES (Batch 4, sections 9 & 13)
    // ===========================================
    //
    // `timeline` is an append-only array of { stage, status, at }.
    // Submitted is seeded at creation time (see submitFeedback below).
    // "Viewed" is appended automatically the first time a developer
    // opens the detail view. Every status change appends its own
    // stage using that status's display label, so the timeline always
    // reads as a plain chronological log — no separate vocabulary to
    // keep in sync with STATUS_LABELS.

    function formatTimelineWhen(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    async function appendTimelineStage(requestId, stage, status) {
        const ref = db.collection("featureRequests").doc(requestId);
        try {
            await ref.update({
                timeline: firebase.firestore.FieldValue.arrayUnion({ stage, status: status || null, at: Date.now() })
            });
        } catch (err) {
            console.error("Failed to append timeline stage:", err);
        }
    }

    async function markViewedIfNeeded(req, requestId) {
        if (!window.isDeveloperAccount?.()) return;

        const timeline = Array.isArray(req.timeline) ? req.timeline : [];
        const alreadyViewed = timeline.some(entry => entry.stage === "Viewed");
        if (alreadyViewed) return;

        await appendTimelineStage(requestId, "Viewed", req.status);
    }

    async function changeRequestStatus(requestId, newStatus) {
        const ref = db.collection("featureRequests").doc(requestId);

        try {
            await ref.update({
                status: newStatus,
                updatedAt: Date.now(),
                timeline: firebase.firestore.FieldValue.arrayUnion({
                    stage: STATUS_LABELS[newStatus] || newStatus,
                    status: newStatus,
                    at: Date.now()
                })
            });

            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "FEEDBACK_STATUS_CHANGED", `${requestId} -> ${newStatus}`);
            }

            duplicateCache = null;
            openFeedbackViewModal(requestId); // refresh with the new status + timeline entry

        } catch (err) {
            console.error("Status change failed:", err);
            alert("Failed to update status — try again.");
        }
    }
    window.changeFeedbackRequestStatus = changeRequestStatus;

    function renderTimelineHtml(req) {
        const timeline = Array.isArray(req.timeline) ? req.timeline : [];
        if (!timeline.length) return "";

        return `
            <div class="feedbackTimeline">
                <h4 class="feedbackTimelineHeading">Timeline</h4>
                ${timeline.map(entry => `
                    <div class="feedbackTimelineRow">
                        <span class="feedbackTimelineStage">${escapeHtml(entry.stage)}</span>
                        <span class="feedbackTimelineWhen">${formatTimelineWhen(entry.at)}</span>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderDevStatusControlHtml(req, requestId) {
        if (!window.isDeveloperAccount?.()) return "";

        const options = STATUS_OPTIONS.map(s =>
            `<option value="${s}" ${s === req.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`
        ).join("");

        return `
            <div class="feedbackDevStatusRow">
                <label for="feedbackViewStatusSelect">Change Status (Developer)</label>
                <div class="feedbackDevStatusControls">
                    <select id="feedbackViewStatusSelect">${options}</select>
                    <button type="button" id="feedbackViewStatusApplyBtn" class="smallButton">Apply</button>
                </div>
            </div>
        `;
    }


    // When the view modal is opened from on top of another modal (My
    // Requests, Browse & Vote, or the submit form's duplicate check), we
    // hide that parent modal first and restore it on close. Otherwise both
    // overlays render at the same z-index and the one later in the DOM
    // (My Requests) visually wins, leaving the detail modal trapped behind it.
    let feedbackViewReturnToId = null;

    function closeFeedbackViewModal() {
        const modal = document.getElementById("feedbackViewModal");
        if (modal) {
            modal.classList.add("hidden");
            modal.remove();
        }

        if (feedbackViewReturnToId) {
            const returnModal = document.getElementById(feedbackViewReturnToId);
            if (returnModal) {
                returnModal.classList.remove("hidden");
                returnModal.style.display = "flex";
            }
            feedbackViewReturnToId = null;
        }
    }
    window.closeFeedbackViewModal = closeFeedbackViewModal;

    async function openFeedbackViewModal(requestId, returnToModalId) {
        const modal = document.getElementById("feedbackViewModal");
        const body = document.getElementById("feedbackViewBody");
        if (!modal || !body) return;

        if (returnToModalId) {
            feedbackViewReturnToId = returnToModalId;
            const parentModal = document.getElementById(returnToModalId);
            if (parentModal) {
                parentModal.classList.add("hidden");
                parentModal.style.display = "none";
            }
        }

        body.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;
        modal.classList.remove("hidden");
        modal.style.display = "flex";

        try {
            const doc = await db.collection("featureRequests").doc(requestId).get();
            if (!doc.exists) {
                body.innerHTML = `<div class="workspaceEmpty">This request no longer exists.</div>`;
                return;
            }

            const req = doc.data();
            const isOwn = req.submittedBy === RelayDesk.currentUser;
            const alreadyVoted = Array.isArray(req.voters) && req.voters.includes(RelayDesk.currentUser);

            body.innerHTML = `
                <h3>${escapeHtml(req.title)}</h3>
                <p class="feedbackViewDescription">${escapeHtml(req.description)}</p>
                <div class="feedbackViewMetaRow">
                    <span class="permBadge">${STATUS_LABELS[req.status] || req.status}</span>
                    <span class="permBadge">${escapeHtml(req.priority || "")}</span>
                    <span class="permBadge">${escapeHtml(req.category || "")}</span>
                </div>
                <p class="settingsHint">Submitted by ${escapeHtml(req.submittedBy)} · 👍 ${req.votes || 0} Votes · ${(req.voters || []).length} Employees Supporting</p>

                ${renderDevStatusControlHtml(req, requestId)}
                ${renderTimelineHtml(req)}

                <div class="modalButtons">
                    <button type="button" id="feedbackViewVoteBtn" ${(isOwn || alreadyVoted) ? "disabled" : ""}>
                        ${alreadyVoted ? "✅ You Voted" : "👍 I Also Want This"}
                    </button>
                    <button type="button" id="feedbackViewCloseBtn">Close</button>
                </div>
            `;

            const voteBtn = document.getElementById("feedbackViewVoteBtn");
            if (voteBtn && !voteBtn.disabled) {
                voteBtn.onclick = async () => {
                    await voteForRequest(requestId);
                    openFeedbackViewModal(requestId); // refresh with updated vote state
                };
            }

            const closeBtn = document.getElementById("feedbackViewCloseBtn");
            if (closeBtn) {
                closeBtn.onclick = closeFeedbackViewModal;
            }

            const statusApplyBtn = document.getElementById("feedbackViewStatusApplyBtn");
            if (statusApplyBtn) {
                statusApplyBtn.onclick = () => {
                    const select = document.getElementById("feedbackViewStatusSelect");
                    if (select && select.value !== req.status) {
                        changeRequestStatus(requestId, select.value);
                    }
                };
            }

            // Auto-track "Viewed" (Batch 4, section 13) — fire-and-forget,
            // doesn't block rendering, and only actually writes once.
            markViewedIfNeeded(req, requestId);

        } catch (err) {
            console.error("Failed to load feedback request:", err);
            body.innerHTML = `<div class="workspaceEmpty">Failed to load this request.</div>`;
        }
    }
    window.openFeedbackViewModal = openFeedbackViewModal;

    // ===========================================
    // DEV PANEL — REQUEST MANAGEMENT (Batch 5)
    // ===========================================
    // A live-listened list of every featureRequest, rendered inside
    // devPanelScreen (gated by window.isDeveloperAccount(), same as
    // everything else developer-only in this file). Reuses
    // changeRequestStatus() from Batch 4 rather than duplicating it.
    // Only listens while devPanelScreen is actually open — started on
    // devPanelAccessBtn click, stopped on devPanelBackBtn click, via
    // addEventListener (not .onclick) so it doesn't clobber devpanel.js's
    // own handlers on those same buttons.

    let devRequestsUnsubscribe = null;
    let devRequestsCache = [];
    let devFilterStatus = "all";
    let devFilterSort = "votes";
    let devViewMode = "active";   // Batch 6: "active" (new/pending/in_progress) or "archive" (completed/rejected)
    let devSearchQuery = "";      // Batch 6: free-text search over the same cache, no new query

    async function toggleRequestFavorite(requestId, current) {
        try {
            await db.collection("featureRequests").doc(requestId).update({
                favorite: !current,
                updatedAt: Date.now()
            });
            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "FEEDBACK_FAVORITE_TOGGLED", `${requestId} -> ${!current}`);
            }
        } catch (err) {
            console.error("Failed to toggle favorite:", err);
            alert("Failed to update favorite — try again.");
        }
    }

    async function addDevLabel(requestId, label) {
        const clean = (label || "").trim();
        if (!clean) return;
        try {
            await db.collection("featureRequests").doc(requestId).update({
                devLabels: firebase.firestore.FieldValue.arrayUnion(clean),
                updatedAt: Date.now()
            });
            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "FEEDBACK_LABEL_ADDED", `${requestId}: ${clean}`);
            }
        } catch (err) {
            console.error("Failed to add label:", err);
            alert("Failed to add label — try again.");
        }
    }

    async function removeDevLabel(requestId, label) {
        try {
            await db.collection("featureRequests").doc(requestId).update({
                devLabels: firebase.firestore.FieldValue.arrayRemove(label),
                updatedAt: Date.now()
            });
            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "FEEDBACK_LABEL_REMOVED", `${requestId}: ${label}`);
            }
        } catch (err) {
            console.error("Failed to remove label:", err);
            alert("Failed to remove label — try again.");
        }
    }

    async function setPlannedVersion(requestId, version) {
        try {
            await db.collection("featureRequests").doc(requestId).update({
                plannedVersion: (version || "").trim() || null,
                updatedAt: Date.now()
            });
            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "FEEDBACK_PLANNED_VERSION_SET", `${requestId}: ${version || "(cleared)"}`);
            }
        } catch (err) {
            console.error("Failed to set planned version:", err);
            alert("Failed to save planned version — try again.");
        }
    }

    // ===========================================
    // GLOBAL SEARCH + ARCHIVE (Batch 6)
    // ===========================================
    // Both features read from `devRequestsCache` — the same fully
    // unfiltered onSnapshot() Batch 5 already set up — so neither one
    // needs a new Firestore query, and therefore no composite index,
    // despite what Batch 1's notes flagged as likely. Since the whole
    // collection is already live in memory for the Dev Panel list, a
    // plain client-side substring search + status-group filter is all
    // this needs; revisit only if the collection grows enough that an
    // unfiltered onSnapshot() itself becomes the bottleneck.
    //
    // Archive is not a separate Firestore collection — it's a second
    // way of slicing the same `featureRequests` data (status is
    // "completed"/"rejected" vs everything else), exactly like the
    // comment in getDuplicateCandidatePool() anticipated.

    function matchesDevSearch(req, query) {
        if (!query) return true;
        const haystack = [
            req.title,
            req.description,
            req.submittedBy,
            req.category,
            req.priority,
            STATUS_LABELS[req.status] || req.status,
            req.plannedVersion,
            ...(Array.isArray(req.devLabels) ? req.devLabels : [])
        ].filter(Boolean).join(" ").toLowerCase();

        return haystack.includes(query);
    }

    // Rebuilds the status dropdown's options to match the current view
    // mode, so "Archive" only ever offers Completed/Rejected and
    // "Active" only ever offers New/Pending/In Progress — no picking a
    // status that view mode has already filtered out from underneath you.
    function updateDevStatusFilterOptions() {
        const select = document.getElementById("devFeedbackFilterStatus");
        if (!select) return;

        const statuses = devViewMode === "archive" ? ARCHIVE_STATUSES : ACTIVE_STATUSES;
        const previousValue = select.value;

        select.innerHTML = `<option value="all">All Statuses</option>` +
            statuses.map(s => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join("");

        // Keep the previous choice if it's still valid in the new mode, else reset to "all".
        select.value = statuses.includes(previousValue) ? previousValue : "all";
        devFilterStatus = select.value;
    }

    function renderDevRequestsList() {
        const list = document.getElementById("devFeedbackList");
        const heading = document.getElementById("devFeedbackListHeading");
        if (!list) return;

        const modeStatuses = devViewMode === "archive" ? ARCHIVE_STATUSES : ACTIVE_STATUSES;
        let rows = devRequestsCache.filter(r => modeStatuses.includes(r.status));

        if (devFilterStatus !== "all") {
            rows = rows.filter(r => r.status === devFilterStatus);
        }
        if (devSearchQuery) {
            rows = rows.filter(r => matchesDevSearch(r, devSearchQuery));
        }

        rows = [...rows].sort((a, b) => {
            if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
            if (devFilterSort === "newest") return (b.createdAt || 0) - (a.createdAt || 0);
            return (b.votes || 0) - (a.votes || 0);
        });

        if (heading) {
            const modeLabel = devViewMode === "archive" ? "Archive (Completed / Rejected)" : "Active Requests";
            heading.textContent = `${modeLabel} — ${rows.length} of ${devRequestsCache.filter(r => modeStatuses.includes(r.status)).length}`;
        }

        if (!rows.length) {
            const emptyMsg = devSearchQuery
                ? "No requests match your search."
                : (devViewMode === "archive" ? "Archive is empty — nothing Completed or Rejected yet." : "No active requests match this filter.");
            list.innerHTML = `<div class="workspaceEmpty">${emptyMsg}</div>`;
            return;
        }

        const statusOptionsHtml = (req) => STATUS_OPTIONS.map(s =>
            `<option value="${s}" ${s === req.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`
        ).join("");

        const labelsHtml = (req) => (Array.isArray(req.devLabels) ? req.devLabels : []).map(label => `
            <span class="devFeedbackLabelChip" data-label="${escapeHtml(label)}">
                ${escapeHtml(label)}
                <button type="button" class="devFeedbackRemoveLabelBtn" data-request-id="${req.id}" data-label="${escapeHtml(label)}">✕</button>
            </span>
        `).join("");

        const controlsHtml = (req) => req.locked ? `
                <div class="devFeedbackControlsRow">
                    <span class="settingsHint">🔒 Locked — released in v${escapeHtml(req.versionCompleted || "")}. Unlock to edit again.</span>
                    <button type="button" class="smallButton devFeedbackUnlockBtn" data-request-id="${req.id}">🔓 Unlock</button>
                </div>
            ` : `
                <div class="devFeedbackControlsRow">
                    <div>
                        <select class="devFeedbackStatusSelect" data-request-id="${req.id}">${statusOptionsHtml(req)}</select>
                        <button type="button" class="smallButton devFeedbackStatusApplyBtn" data-request-id="${req.id}">Apply</button>
                    </div>
                    <div>
                        <input type="text" class="devFeedbackVersionInput" data-request-id="${req.id}" placeholder="Planned version, e.g. 1.3.0" value="${escapeHtml(req.plannedVersion || "")}">
                        <button type="button" class="smallButton devFeedbackVersionSaveBtn" data-request-id="${req.id}">Save</button>
                    </div>
                </div>

                <div class="devFeedbackLabels">${labelsHtml(req)}</div>
                <div class="devFeedbackAddLabelRow">
                    <input type="text" class="devFeedbackNewLabelInput" data-request-id="${req.id}" placeholder="Add a label, e.g. backend">
                    <button type="button" class="smallButton devFeedbackAddLabelBtn" data-request-id="${req.id}">➕ Add Label</button>
                </div>
            `;

        list.innerHTML = rows.map(req => `
            <div class="devFeedbackRow" data-request-id="${req.id}">
                <div class="devFeedbackRowHeader">
                    <span class="devFeedbackTitle" data-request-id="${req.id}">${req.favorite ? "⭐ " : ""}${escapeHtml(req.title)}</span>
                    <button type="button" class="devFeedbackFavoriteBtn" data-request-id="${req.id}" data-current="${!!req.favorite}" title="Toggle favorite">${req.favorite ? "⭐" : "☆"}</button>
                </div>
                <div class="devFeedbackMeta">
                    <span class="permBadge">${STATUS_LABELS[req.status] || req.status}</span>
                    <span class="permBadge">${escapeHtml(req.type || "")}</span>
                    <span class="permBadge">${escapeHtml(req.priority || "")}</span>
                    <span class="permBadge">${escapeHtml(req.category || "")}</span>
                    <span class="permBadge">👍 ${req.votes || 0}</span>
                    ${req.includedInRelease ? `<span class="permBadge">📦 Released v${escapeHtml(req.versionCompleted || "")}</span>` : ""}
                    ${req.locked ? `<span class="permBadge">🔒 Locked</span>` : ""}
                </div>
                <p class="settingsHint">Submitted by ${escapeHtml(req.submittedBy)}${req.plannedVersion ? ` · Planned for v${escapeHtml(req.plannedVersion)}` : ""}</p>

                ${controlsHtml(req)}
            </div>
        `).join("");

        list.querySelectorAll(".devFeedbackTitle").forEach(el => {
            el.onclick = () => openFeedbackViewModal(el.dataset.requestId);
        });

        list.querySelectorAll(".devFeedbackFavoriteBtn").forEach(btn => {
            btn.onclick = () => toggleRequestFavorite(btn.dataset.requestId, btn.dataset.current === "true");
        });

        list.querySelectorAll(".devFeedbackStatusApplyBtn").forEach(btn => {
            btn.onclick = () => {
                const select = list.querySelector(`.devFeedbackStatusSelect[data-request-id="${btn.dataset.requestId}"]`);
                if (select) changeRequestStatus(btn.dataset.requestId, select.value);
            };
        });

        list.querySelectorAll(".devFeedbackVersionSaveBtn").forEach(btn => {
            btn.onclick = () => {
                const input = list.querySelector(`.devFeedbackVersionInput[data-request-id="${btn.dataset.requestId}"]`);
                if (input) setPlannedVersion(btn.dataset.requestId, input.value);
            };
        });

        list.querySelectorAll(".devFeedbackAddLabelBtn").forEach(btn => {
            btn.onclick = () => {
                const input = list.querySelector(`.devFeedbackNewLabelInput[data-request-id="${btn.dataset.requestId}"]`);
                if (input && input.value.trim()) {
                    addDevLabel(btn.dataset.requestId, input.value);
                    input.value = "";
                }
            };
        });

        list.querySelectorAll(".devFeedbackRemoveLabelBtn").forEach(btn => {
            btn.onclick = () => removeDevLabel(btn.dataset.requestId, btn.dataset.label);
        });

        list.querySelectorAll(".devFeedbackUnlockBtn").forEach(btn => {
            btn.onclick = () => unlockFeedbackItem(btn.dataset.requestId);
        });
    }

    // Manually reopen a request that was auto-locked by Finalize Release.
    // Only flips `locked` back to false — versionCompleted/includedInRelease
    // are left untouched so release history stays accurate; the item is
    // simply editable again (e.g. to fix a status/label typo after the fact).
    async function unlockFeedbackItem(requestId) {
        if (!confirm("Unlock this item for editing? It stays marked as released, but its status/labels/version become editable again.")) return;
        try {
            await db.collection("featureRequests").doc(requestId).update({
                locked: false,
                updatedAt: Date.now()
            });
            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "FEEDBACK_UNLOCKED", requestId);
            }
        } catch (err) {
            console.error("Failed to unlock item:", err);
            alert("Failed to unlock — try again.");
        }
    }

    // ===========================================
    // CONTRIBUTOR STATS (Batch 7)
    // ===========================================
    // Deliberately computed from the FULL `devRequestsCache` — the same
    // unfiltered onSnapshot() Batch 5 already set up — never from
    // whatever renderDevRequestsList() last filtered down to. Search
    // text and the Active/Archive toggle are view concerns for the
    // request list; stats should always reflect every request, active
    // or archived, per the running theme in this file of not adding a
    // second query for something the existing cache already answers.
    //
    // Three leaderboards, each capped at the top 10 so this stays a
    // quick glance rather than another full list to scroll:
    //   - Top Submitters      — most requests filed (by submittedBy)
    //   - Most Votes Received — sum of `votes` across a submitter's own requests
    //   - Most Active Voters  — how many times an employee code appears
    //                           across every request's `voters` array
    // Plus a one-line summary strip above them (totals, not top-N).
    //
    // No new Firestore reads and no new fields — this reuses `votes`,
    // `voters`, `submittedBy`, and `status`, all already on every doc
    // since Batch 1/2/3.

    function computeContributorStats() {
        const submitters = new Map(); // code -> { submitted, completed, votesReceived }
        const voters = new Map();     // code -> votesCast

        devRequestsCache.forEach(req => {
            const code = req.submittedBy || "Unknown";
            if (!submitters.has(code)) {
                submitters.set(code, { submitted: 0, completed: 0, votesReceived: 0 });
            }
            const entry = submitters.get(code);
            entry.submitted += 1;
            if (req.status === "completed") entry.completed += 1;
            entry.votesReceived += (req.votes || 0);

            (Array.isArray(req.voters) ? req.voters : []).forEach(voterCode => {
                voters.set(voterCode, (voters.get(voterCode) || 0) + 1);
            });
        });

        return { submitters, voters };
    }

    function statsRowHtml(rank, name, valueText) {
        return `
            <div class="devStatsRow">
                <span class="devStatsRank">#${rank}</span>
                <span class="devStatsName">${escapeHtml(name)}</span>
                <span class="devStatsValue">${valueText}</span>
            </div>
        `;
    }

    function renderContributorStats() {
        const summaryEl = document.getElementById("devContributorStatsSummary");
        const topSubmittersEl = document.getElementById("devTopSubmittersList");
        const topVotedEl = document.getElementById("devTopVotedList");
        const topVotersEl = document.getElementById("devTopVotersList");

        // Section isn't in the DOM (e.g. not built yet) — nothing to do.
        if (!summaryEl && !topSubmittersEl && !topVotedEl && !topVotersEl) return;

        const { submitters, voters } = computeContributorStats();

        if (summaryEl) {
            const totalRequests = devRequestsCache.length;
            const totalCompleted = devRequestsCache.filter(r => r.status === "completed").length;
            const totalVotesCast = devRequestsCache.reduce(
                (sum, r) => sum + (Array.isArray(r.voters) ? r.voters.length : 0), 0
            );
            summaryEl.innerHTML = `
                <span class="permBadge">📋 ${totalRequests} Total Requests</span>
                <span class="permBadge">👥 ${submitters.size} Contributors</span>
                <span class="permBadge">👍 ${totalVotesCast} Votes Cast</span>
                <span class="permBadge">✅ ${totalCompleted} Completed</span>
            `;
        }

        if (topSubmittersEl) {
            const rows = [...submitters.entries()]
                .sort((a, b) => b[1].submitted - a[1].submitted)
                .slice(0, 10);
            topSubmittersEl.innerHTML = rows.length
                ? rows.map(([code, s], i) => statsRowHtml(
                    i + 1, code,
                    `${s.submitted} submitted${s.completed ? ` · ${s.completed} shipped` : ""}`
                )).join("")
                : `<div class="workspaceEmpty">No submissions yet.</div>`;
        }

        if (topVotedEl) {
            const rows = [...submitters.entries()]
                .filter(([, s]) => s.votesReceived > 0)
                .sort((a, b) => b[1].votesReceived - a[1].votesReceived)
                .slice(0, 10);
            topVotedEl.innerHTML = rows.length
                ? rows.map(([code, s], i) => statsRowHtml(i + 1, code, `👍 ${s.votesReceived} votes received`)).join("")
                : `<div class="workspaceEmpty">No votes yet.</div>`;
        }

        if (topVotersEl) {
            const rows = [...voters.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            topVotersEl.innerHTML = rows.length
                ? rows.map(([code, count], i) => statsRowHtml(i + 1, code, `${count} votes cast`)).join("")
                : `<div class="workspaceEmpty">No votes cast yet.</div>`;
        }
    }

    function startDevRequestsListener() {
        if (!window.isDeveloperAccount?.()) return;
        if (devRequestsUnsubscribe) return; // already listening

        const list = document.getElementById("devFeedbackList");
        if (list) list.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;

        ["devTopSubmittersList", "devTopVotedList", "devTopVotersList"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;
        });

        devRequestsUnsubscribe = db.collection("featureRequests")
            .onSnapshot(snapshot => {
                devRequestsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderDevRequestsList();
                renderContributorStats();
                renderReleaseManagementPanel();
            }, err => {
                console.error("Dev Panel feedback listener failed:", err);
                if (list) list.innerHTML = `<div class="workspaceEmpty">Failed to load requests.</div>`;
            });
    }

    function stopDevRequestsListener() {
        if (devRequestsUnsubscribe) {
            devRequestsUnsubscribe();
            devRequestsUnsubscribe = null;
        }
    }

    // ===========================================
    // AUTOMATIC RELEASE NOTES / CHANGELOG GENERATOR (Batch 9)
    // ===========================================
    // Reads straight off `devRequestsCache` (same unfiltered onSnapshot
    // Batch 5 already set up) — no new Firestore query.
    //
    // "Completed but not yet released" = status === "completed" AND
    // includedInRelease !== true. "In Progress" section of the generated
    // notes is informational only (status === "in_progress") — those
    // items are never marked included/locked by Finalize.
    //
    // Grouping uses the existing `type` field ("feature"/"bug"/
    // "improvement"/"ui"/"other") — this is the field the original
    // submission form actually populates as Feature/Bug/Improvement.
    // `category` is a separate topic tag (chat/loads/dispatch/...) and is
    // NOT used for grouping. "ui" and "other" fold into "Improvements".

    const RELEASE_TYPE_TO_SECTION = {
        feature: "New Features",
        bug: "Bug Fixes",
        improvement: "Improvements",
        ui: "Improvements",
        other: "Improvements"
    };
    const RELEASE_SECTION_ORDER = ["New Features", "Bug Fixes", "Improvements"];
    const RELEASE_SECTION_MARKDOWN_HEADERS = {
        "New Features": "## ✨ New Features",
        "Bug Fixes": "## 🐛 Bug Fixes",
        "Improvements": "## 🔧 Improvements",
        "In Progress": "## 🚧 In Progress"
    };

    let releaseMgmtLastItems = [];       // completed items used by the last Generate — Finalize marks exactly these
    let releaseMgmtLastInProgress = [];  // in_progress items snapshot at last Generate — informational only
    let releaseMgmtLastVersion = "";
    let releaseMgmtLastStats = null;     // { newFeatures, bugFixes, improvements, inProgress, totalCompleted }

    function getUnreleasedCompletedItems() {
        return devRequestsCache.filter(r => r.status === "completed" && !r.includedInRelease);
    }

    function getInProgressItems() {
        return devRequestsCache.filter(r => r.status === "in_progress");
    }

    function groupItemsBySection(items) {
        const groups = { "New Features": [], "Bug Fixes": [], "Improvements": [] };
        items.forEach(item => {
            const section = RELEASE_TYPE_TO_SECTION[item.type] || "Improvements";
            groups[section].push(item);
        });
        return groups;
    }

    // Computed fresh every Generate click — never recalculated later. Once
    // a release is finalized, these numbers are copied verbatim onto the
    // release-notes snapshot (see handleFinalizeRelease) so History always
    // shows the count as of finalization, even if items are later edited.
    function computeReleaseStats(groups, inProgressItems) {
        const newFeatures = groups["New Features"].length;
        const bugFixes = groups["Bug Fixes"].length;
        const improvements = groups["Improvements"].length;
        const inProgress = inProgressItems.length;
        return {
            newFeatures,
            bugFixes,
            improvements,
            inProgress,
            totalCompleted: newFeatures + bugFixes + improvements
        };
    }

    function buildReleaseNotesText(version, groups, inProgressItems) {
        let out = `Version ${version}\n`;
        RELEASE_SECTION_ORDER.forEach(section => {
            if (groups[section].length) {
                out += `\n${section}\n\n`;
                groups[section].forEach(item => { out += `• ${item.title}\n`; });
            }
        });
        if (inProgressItems.length) {
            out += `\nIn Progress\n\n`;
            inProgressItems.forEach(item => { out += `• ${item.title}\n`; });
        }
        return out.trim() + "\n";
    }

    // Converts the (possibly hand-edited) plain-text notes into GitHub
    // Markdown by recognizing the same section header lines and bullet
    // ("•") lines Generate Release Notes produces. This is deliberately a
    // text transform of the edited textarea, not a re-derivation from
    // feedback data — so manual wording edits carry through into the
    // Markdown too, per the spec's "edit before generating Markdown" flow.
    function notesTextToMarkdown(notesText, version) {
        const lines = notesText.split("\n");
        const out = [`# ESM v${version}`, ""];
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed === `Version ${version}`) return;
            if (RELEASE_SECTION_MARKDOWN_HEADERS[trimmed]) {
                out.push("", RELEASE_SECTION_MARKDOWN_HEADERS[trimmed], "");
            } else if (trimmed.startsWith("•")) {
                out.push(`- ${trimmed.slice(1).trim()}`);
            } else if (trimmed) {
                out.push(trimmed);
            }
        });
        return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    }

    // Renders the auto-calculated stats badges inside Release Management
    // (item 3). Purely a display of `releaseMgmtLastStats`, populated by
    // Generate Release Notes — not recalculated anywhere else live.
    function renderReleaseStatsSummary(stats) {
        const el = document.getElementById("releaseMgmtStatsSummary");
        if (!el) return;
        if (!stats) {
            el.classList.add("hidden");
            el.innerHTML = "";
            return;
        }
        el.classList.remove("hidden");
        el.innerHTML = `
            <span class="permBadge">✨ New Features: ${stats.newFeatures}</span>
            <span class="permBadge">🐞 Bug Fixes: ${stats.bugFixes}</span>
            <span class="permBadge">🔧 Improvements: ${stats.improvements}</span>
            <span class="permBadge">🚧 In Progress: ${stats.inProgress}</span>
            <span class="permBadge">📦 Total Completed This Release: ${stats.totalCompleted}</span>
        `;
    }

    // Prepends a "## Release Summary" block (item 4) ahead of the section
    // headers already produced by notesTextToMarkdown — built straight from
    // the stored stats snapshot, not re-parsed from the notes text, so it's
    // always accurate regardless of wording edits.
    function buildMarkdownWithSummary(version, notesText, stats) {
        const sectionsMarkdown = notesTextToMarkdown(notesText, version);
        const withoutTitle = sectionsMarkdown.replace(/^# ESM v[^\n]*\n*/, "");

        const summaryLines = [
            `# ESM v${version}`,
            "",
            "## Release Summary",
            "",
            `✨ ${stats.newFeatures} New Features`,
            "",
            `🐞 ${stats.bugFixes} Bug Fixes`,
            "",
            `🔧 ${stats.improvements} Improvements`,
            "",
            `🚧 ${stats.inProgress} In Progress`,
            "",
            "---",
            ""
        ];

        return summaryLines.join("\n") + withoutTitle;
    }

    function renderReleaseManagementPanel() {
        const curEl = document.getElementById("releaseMgmtCurrentVersion");
        const prevEl = document.getElementById("releaseMgmtPreviousVersion");
        const countEl = document.getElementById("releaseMgmtUnreleasedCount");
        if (!curEl && !prevEl && !countEl) return; // panel not in DOM / not open yet

        const cfg = window.RelayDesk?.devPanel?.cachedConfig || {};
        const currentVersion = window.RelayDesk?.devPanel?.getEffectiveVersion?.() || cfg.version || "—";
        const notes = Array.isArray(cfg.releaseNotes) ? cfg.releaseNotes : [];
        const sorted = [...notes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const previous = sorted.find(n => n.version !== currentVersion);

        if (curEl) curEl.textContent = currentVersion;
        if (prevEl) prevEl.textContent = previous ? previous.version : "—";
        if (countEl) countEl.textContent = String(getUnreleasedCompletedItems().length);
    }
    window.renderReleaseManagementPanel = renderReleaseManagementPanel;

    function handleGenerateReleaseNotes() {
        if (!window.isDeveloperAccount?.()) return;

        const version = window.RelayDesk?.devPanel?.getEffectiveVersion?.() || window.RelayDesk?.devPanel?.cachedConfig?.version || "unknown";
        const completed = getUnreleasedCompletedItems();
        const inProgress = getInProgressItems();
        const groups = groupItemsBySection(completed);
        const text = buildReleaseNotesText(version, groups, inProgress);
        const stats = computeReleaseStats(groups, inProgress);

        releaseMgmtLastItems = completed;
        releaseMgmtLastInProgress = inProgress;
        releaseMgmtLastVersion = version;
        releaseMgmtLastStats = stats;

        const ta = document.getElementById("releaseMgmtNotesTextarea");
        if (ta) ta.value = text;
        const mdTa = document.getElementById("releaseMgmtMarkdownTextarea");
        if (mdTa) mdTa.value = "";

        renderReleaseStatsSummary(stats);

        const resultEl = document.getElementById("releaseMgmtResult");
        if (resultEl) resultEl.textContent = `Generated from ${completed.length} completed item(s) for v${version}. Edit above, then Generate Markdown.`;
    }

    function handleGenerateMarkdown() {
        const ta = document.getElementById("releaseMgmtNotesTextarea");
        const mdTa = document.getElementById("releaseMgmtMarkdownTextarea");
        if (!ta || !ta.value.trim()) {
            alert("Generate Release Notes first.");
            return;
        }
        if (!releaseMgmtLastStats) {
            alert("Generate Release Notes again first — the summary stats weren't captured (e.g. after a page reload).");
            return;
        }
        const version = releaseMgmtLastVersion || window.RelayDesk?.devPanel?.getEffectiveVersion?.() || window.RelayDesk?.devPanel?.cachedConfig?.version || "unknown";
        if (mdTa) mdTa.value = buildMarkdownWithSummary(version, ta.value, releaseMgmtLastStats);
    }

    async function handleFinalizeRelease() {
        if (!window.isDeveloperAccount?.()) return;

        const version = releaseMgmtLastVersion || window.RelayDesk?.devPanel?.getEffectiveVersion?.() || window.RelayDesk?.devPanel?.cachedConfig?.version;
        const ta = document.getElementById("releaseMgmtNotesTextarea");
        const notesText = (ta?.value || "").trim();

        if (!version) { alert("No version available — set one in Version & About first."); return; }
        if (!notesText) { alert("Generate (and optionally edit) Release Notes before finalizing."); return; }
        if (!releaseMgmtLastStats) { alert("Generate Release Notes again first — stats weren't captured."); return; }

        // Prevent duplicate release entries (item 6): don't silently create
        // a second History entry for a version that's already finalized.
        const existingNotes = Array.isArray(window.RelayDesk?.devPanel?.cachedConfig?.releaseNotes)
            ? window.RelayDesk.devPanel.cachedConfig.releaseNotes : [];
        if (existingNotes.some(n => n.version === version)) {
            alert(`Version ${version} has already been finalized. Bump the version in "Version & About" before finalizing a new release.`);
            return;
        }

        // Re-verify every item captured at Generate time still qualifies
        // (completed && not yet included) right before writing anything.
        // If anything changed underneath (someone else marked it included,
        // reopened it, etc.) refuse and ask for a fresh Generate instead of
        // finalizing a stale/partial snapshot (item 1 + item 6 safety net).
        const idsAtGenerate = new Set(releaseMgmtLastItems.map(i => i.id));
        const stillQualifying = devRequestsCache.filter(r => idsAtGenerate.has(r.id) && r.status === "completed" && !r.includedInRelease);
        if (stillQualifying.length !== releaseMgmtLastItems.length) {
            alert("Some items changed since you generated these notes (status changed or already released elsewhere). Please click \"Generate Release Notes\" again to refresh, then Finalize.");
            return;
        }

        if (!confirm(`Finalize version ${version}?`)) return;

        const items = releaseMgmtLastItems;
        const stats = releaseMgmtLastStats;
        const now = Date.now();
        const today = new Date().toISOString().slice(0, 10);
        const mdTa = document.getElementById("releaseMgmtMarkdownTextarea");
        const resultEl = document.getElementById("releaseMgmtResult");

        if (resultEl) resultEl.textContent = "Finalizing...";

        try {
            // Write the permanent snapshot FIRST. This is the source of
            // truth for release history — notes/markdown/stats are copied
            // in verbatim and never recalculated later (item 2 + item 5),
            // so later edits to feedback items can't change this record.
            // If this write fails, nothing below runs, so no item ever
            // gets silently locked out of future releases without a
            // matching history entry.
            await db.collection("appConfig").doc("main").set({
                releaseNotes: firebase.firestore.FieldValue.arrayUnion({
                    id: `rn_${now}`,
                    version,
                    date: today,
                    notes: notesText,
                    markdown: (mdTa?.value || "").trim() || null,
                    stats
                })
            }, { merge: true });

            // Only now mark the items included/locked so they can never be
            // picked up by a future Generate Release Notes call (item 1).
            const batch = db.batch();
            items.forEach(item => {
                batch.update(db.collection("featureRequests").doc(item.id), {
                    includedInRelease: true,
                    versionCompleted: version,
                    locked: true,
                    updatedAt: now
                });
            });
            await batch.commit();

            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "RELEASE_FINALIZED", `v${version}: ${items.length} item(s)`);
            }

            if (resultEl) resultEl.textContent = `✅ Finalized v${version} — ${items.length} item(s) locked & added to Release Notes History.`;

            releaseMgmtLastItems = [];
            releaseMgmtLastInProgress = [];
            releaseMgmtLastVersion = "";
            releaseMgmtLastStats = null;
            if (ta) ta.value = "";
            if (mdTa) mdTa.value = "";
            renderReleaseStatsSummary(null);

            window.NotificationManager?.notify(`🚀 Release v${version} finalized`, "success", { category: "system", desktop: false })
                ?? window.showToast?.(`🚀 Release v${version} finalized`, "success");
        } catch (err) {
            console.error("Failed to finalize release:", err);
            if (resultEl) resultEl.textContent = "❌ Failed to finalize — check your connection and try again.";
        }
    }

    function bindReleaseManagementUI() {
        document.getElementById("releaseMgmtGenerateNotesBtn")?.addEventListener("click", handleGenerateReleaseNotes);
        document.getElementById("releaseMgmtGenerateMarkdownBtn")?.addEventListener("click", handleGenerateMarkdown);
        document.getElementById("releaseMgmtFinalizeBtn")?.addEventListener("click", handleFinalizeRelease);
        document.getElementById("releaseMgmtCopyMarkdownBtn")?.addEventListener("click", () => {
            const mdTa = document.getElementById("releaseMgmtMarkdownTextarea");
            if (!mdTa || !mdTa.value) return;
            navigator.clipboard?.writeText(mdTa.value)
                .then(() => window.showToast?.("📋 Markdown copied", "success"))
                .catch(() => {
                    mdTa.select();
                    document.execCommand("copy");
                });
        });
    }

    function bindDevPanelFeedbackUI() {
        const accessBtn = document.getElementById("devPanelAccessBtn");
        const backBtn = document.getElementById("devPanelBackBtn");
        const filterStatus = document.getElementById("devFeedbackFilterStatus");
        const filterSort = document.getElementById("devFeedbackFilterSort");
        const searchInput = document.getElementById("devFeedbackSearchInput");
        const archiveToggleBtn = document.getElementById("devFeedbackArchiveToggleBtn");

        // addEventListener (not .onclick) — devpanel.js already assigns
        // its own .onclick to these same buttons; this must not clobber it.
        if (accessBtn) accessBtn.addEventListener("click", () => {
            updateDevStatusFilterOptions();
            startDevRequestsListener();
            renderReleaseManagementPanel();
        });
        if (backBtn) backBtn.addEventListener("click", stopDevRequestsListener);

        if (filterStatus) {
            filterStatus.addEventListener("change", () => {
                devFilterStatus = filterStatus.value;
                renderDevRequestsList();
            });
        }
        if (filterSort) {
            filterSort.addEventListener("change", () => {
                devFilterSort = filterSort.value;
                renderDevRequestsList();
            });
        }

        // Batch 6: free-text search — no debounce needed, this only
        // ever filters the already-in-memory cache, never Firestore.
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                devSearchQuery = searchInput.value.trim().toLowerCase();
                renderDevRequestsList();
            });
        }

        // Batch 6: Active <-> Archive toggle. Switching modes resets the
        // status filter's own options (see updateDevStatusFilterOptions)
        // so it always reflects only the statuses reachable in that mode.
        if (archiveToggleBtn) {
            archiveToggleBtn.onclick = () => {
                devViewMode = devViewMode === "archive" ? "active" : "archive";
                archiveToggleBtn.dataset.mode = devViewMode;
                archiveToggleBtn.textContent = devViewMode === "archive" ? "◀️ Back to Active" : "📦 View Archive";
                updateDevStatusFilterOptions();
                renderDevRequestsList();
            };
        }
    }

    // ===========================================
    // MY SUBMITTED REQUESTS (minimal list for Batch 2 — full
    // timeline view comes in Batch 4)
    // ===========================================

    async function loadMyRequests() {
        const list = document.getElementById("feedbackMyRequestsList");
        if (!list) return;

        list.innerHTML = `<div class="workspaceEmpty">${t("loadingMyRequests", "Loading your requests...")}</div>`;

        try {
            const snapshot = await db.collection("featureRequests")
                .where("submittedBy", "==", RelayDesk.currentUser)
                .get();

            const requests = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            if (!requests.length) {
                list.innerHTML = `<div class="workspaceEmpty">${t("noMyRequests", "You haven't submitted any feedback yet.")}</div>`;
                return;
            }

            list.innerHTML = requests.map(req => `
                <div class="feedbackMyRequestRow" data-request-id="${req.id}">
                    <div class="feedbackMyRequestTitle">${escapeHtml(req.title)}</div>
                    <div class="feedbackMyRequestMeta">
                        <span class="permBadge">${STATUS_LABELS[req.status] || req.status}</span>
                        <span class="permBadge">👍 ${req.votes || 0}</span>
                    </div>
                </div>
            `).join("");

            list.querySelectorAll(".feedbackMyRequestRow").forEach(row => {
                row.onclick = () => openFeedbackViewModal(row.dataset.requestId, "feedbackMyRequestsModal");
            });

        } catch (err) {
            console.error("Failed to load my feedback requests:", err);
            list.innerHTML = `<div class="workspaceEmpty">Failed to load your requests.</div>`;
        }
    }

    // ===========================================
    // BROWSE & VOTE (Batch 3, section 6)
    // ===========================================
    // Live-listened so vote counts update for everyone with the modal
    // open, without a manual refresh — consistent with how the rest
    // of the app (offDayChangeRequests, appConfig, etc.) stays in sync.

    let browseUnsubscribe = null;
    let browseSort = "votes";
    let browseRequestsCache = [];

    function renderBrowseList() {
        const list = document.getElementById("feedbackBrowseList");
        if (!list) return;

        if (!browseRequestsCache.length) {
            list.innerHTML = `<div class="workspaceEmpty">No requests yet — be the first to submit one!</div>`;
            return;
        }

        const sorted = [...browseRequestsCache].sort((a, b) => {
            if (browseSort === "newest") return (b.createdAt || 0) - (a.createdAt || 0);
            return (b.votes || 0) - (a.votes || 0);
        });

        const code = RelayDesk.currentUser;

        list.innerHTML = sorted.map(req => {
            const isOwn = req.submittedBy === code;
            const alreadyVoted = Array.isArray(req.voters) && req.voters.includes(code);
            const supporters = Array.isArray(req.voters) ? req.voters.length : 0;

            return `
                <div class="feedbackMyRequestRow feedbackBrowseRow" data-request-id="${req.id}">
                    <div>
                        <div class="feedbackMyRequestTitle">${escapeHtml(req.title)}</div>
                        <div class="feedbackDuplicateMeta">
                            👍 ${req.votes || 0} Votes · ${supporters} Employees Supporting &nbsp;·&nbsp; ${STATUS_LABELS[req.status] || req.status}
                        </div>
                    </div>
                    <div class="feedbackMyRequestMeta">
                        <button type="button" class="smallButton feedbackBrowseVoteBtn" data-request-id="${req.id}" ${(isOwn || alreadyVoted) ? "disabled" : ""}>
                            ${alreadyVoted ? "✅ Voted" : (isOwn ? "Your request" : "👍 I Also Want This")}
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        list.querySelectorAll(".feedbackBrowseRow > div:first-child").forEach(el => {
            el.onclick = () => openFeedbackViewModal(el.closest(".feedbackBrowseRow").dataset.requestId, "feedbackBrowseModal");
            el.style.cursor = "pointer";
        });

        list.querySelectorAll(".feedbackBrowseVoteBtn").forEach(btn => {
            if (btn.disabled) return;
            btn.onclick = (e) => {
                e.stopPropagation();
                voteForRequest(btn.dataset.requestId);
            };
        });
    }

    function startBrowseListener() {
        if (browseUnsubscribe) return; // already listening

        const list = document.getElementById("feedbackBrowseList");
        if (list) list.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;

        browseUnsubscribe = db.collection("featureRequests")
            .onSnapshot(snapshot => {
                browseRequestsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderBrowseList();
            }, err => {
                console.error("Browse & Vote listener failed:", err);
                if (list) list.innerHTML = `<div class="workspaceEmpty">Failed to load requests.</div>`;
            });
    }

    function stopBrowseListener() {
        if (browseUnsubscribe) {
            browseUnsubscribe();
            browseUnsubscribe = null;
        }
    }

    // ===========================================
    // SUBMISSION (Batch 2)
    // ===========================================

    function resetForm() {
        const titleInput = document.getElementById("feedbackTitleInput");
        const descInput = document.getElementById("feedbackDescriptionInput");
        const prioritySelect = document.getElementById("feedbackPrioritySelect");
        const categorySelect = document.getElementById("feedbackCategorySelect");
        const typeSelect = document.getElementById("feedbackTypeSelect");
        const reproSelect = document.getElementById("feedbackReproSelect");

        if (titleInput) titleInput.value = "";
        if (descInput) descInput.value = "";
        if (prioritySelect) prioritySelect.value = "medium";
        if (categorySelect) categorySelect.value = "other";
        if (typeSelect) typeSelect.value = "bug";
        if (reproSelect) reproSelect.value = "always";

        renderDuplicateSuggestions([]);
        toggleReproVisibility();
    }

    function toggleReproVisibility() {
        const typeSelect = document.getElementById("feedbackTypeSelect");
        const reproRow = document.getElementById("feedbackReproRow");
        if (!typeSelect || !reproRow) return;

        reproRow.classList.toggle("hidden", typeSelect.value !== "bug");
    }

    async function submitFeedback() {
        const titleInput = document.getElementById("feedbackTitleInput");
        const descInput = document.getElementById("feedbackDescriptionInput");
        const typeSelect = document.getElementById("feedbackTypeSelect");
        const prioritySelect = document.getElementById("feedbackPrioritySelect");
        const categorySelect = document.getElementById("feedbackCategorySelect");
        const reproSelect = document.getElementById("feedbackReproSelect");
        const submitBtn = document.getElementById("feedbackSubmitBtn");

        const title = (titleInput?.value || "").trim();
        const description = (descInput?.value || "").trim();

        if (!title) {
            alert(t("titleRequired", "Please enter a title."));
            return;
        }
        if (!description) {
            alert(t("descriptionRequired", "Please enter a description."));
            return;
        }

        const type = typeSelect?.value || "other";

        if (submitBtn) submitBtn.disabled = true;

        try {
            const meta = await getSubmitterMetadata();
            const now = Date.now();

            await db.collection("featureRequests").add({
                title,
                description,
                type,
                priority: prioritySelect?.value || "medium",
                category: categorySelect?.value || "other",
                reproducibility: type === "bug" ? (reproSelect?.value || "always") : null,

                ...meta,

                status: "new",
                createdAt: now,
                updatedAt: now,

                // reserved for later batches — see header comment
                votes: 0,
                voters: [],
                devLabels: [],
                plannedVersion: null,
                favorite: false,
                timeline: [{ stage: "Submitted", status: "new", at: now }],

                // Release Notes / Changelog Generator (Batch 9)
                versionCompleted: null,
                includedInRelease: false,
                locked: false
            });

            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "FEEDBACK_SUBMITTED", `${type}: ${title}`);
            }

            notify(t("submitted", "🧩 Feedback sent — thanks for helping improve ESM!"), "success");

            const modal = document.getElementById("feedbackModal");
            if (modal) {
                modal.classList.add("hidden");
                modal.remove();
            }
            resetForm();
            duplicateCache = null;

        } catch (err) {
            console.error("Feedback submission failed:", err);
            alert(t("submitFailed", "Failed to send your feedback. Please try again."));
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // ===========================================
    // NOTIFICATIONS ON STATUS CHANGE (Batch 4, section 9)
    // ===========================================
    // This app has no server-side push/inbox — NotificationManager.notify()
    // only shows a toast to whoever calls it, right now, on their own
    // screen (same conclusion disputes.js's off-day listener reached).
    // So: every logged-in employee listens to their OWN submitted
    // requests live. The first snapshot just seeds the "last known
    // status" map silently; any snapshot after that where a doc's
    // status differs from what we had cached is a real change, and
    // gets a toast via the existing notification system.
    function startMyStatusNotificationListener() {
        if (myRequestsUnsubscribe) return; // already listening

        myRequestsKnownStatus = new Map();
        let firstSnapshot = true;

        myRequestsUnsubscribe = db.collection("featureRequests")
            .where("submittedBy", "==", RelayDesk.currentUser)
            .onSnapshot(snapshot => {

                snapshot.docs.forEach(doc => {
                    const req = doc.data();
                    const previousStatus = myRequestsKnownStatus.get(doc.id);

                    if (!firstSnapshot && previousStatus && previousStatus !== req.status) {
                        notify(
                            `🧩 "${req.title}" is now ${STATUS_LABELS[req.status] || req.status}`,
                            "info"
                        );
                    }

                    myRequestsKnownStatus.set(doc.id, req.status);
                });

                firstSnapshot = false;

            }, err => console.error("Feedback status listener failed:", err));
    }

    // ===========================================
    // PLANNED FOR UPCOMING VERSIONS (Batch 8 — "Release notes integration")
    // ===========================================
    // Surfaces `plannedVersion` (settable per-request since Batch 5's
    // Dev Panel UI, section: Version & About) to every employee in
    // Settings > About, grouped by target version. This is
    // deliberately separate from devpanel.js's own Release Notes,
    // which documents what's already SHIPPED — this is "here's what's
    // coming." Only active-pipeline requests (new/pending/in_progress)
    // are shown: a completed request belongs in the real release notes
    // instead, and a rejected one was never going to ship regardless
    // of whatever plannedVersion it picked up along the way.
    //
    // Same reasoning as Browse & Vote (Batch 3) and the Dev Panel
    // (Batch 5/6/7): one unfiltered onSnapshot() on featureRequests,
    // filtered/grouped client-side — no composite index needed. The
    // listener starts when the Settings "About" tab is opened and
    // stops when the user leaves that tab or leaves Settings
    // entirely, mirroring the Browse modal's open/close-scoped
    // listener rather than running in the background all the time.

    let plannedVersionsUnsubscribe = null;
    let plannedVersionsCache = [];

    // Loose semver-ish comparator so "1.10.0" sorts after "1.9.0"
    // instead of before it (plain string compare would get this
    // wrong). Falls back to a string compare for anything that isn't
    // dotted numbers, so a non-standard version label can't crash
    // this — it'll just sort in a reasonable-enough spot.
    function compareVersions(a, b) {
        const partsA = String(a).split(".").map(n => parseInt(n, 10));
        const partsB = String(b).split(".").map(n => parseInt(n, 10));
        const len = Math.max(partsA.length, partsB.length);
        for (let i = 0; i < len; i++) {
            const numA = partsA[i];
            const numB = partsB[i];
            if (Number.isNaN(numA) || Number.isNaN(numB)) {
                return String(a).localeCompare(String(b));
            }
            if (numA !== numB) return numA - numB;
        }
        return 0;
    }

    function renderPlannedVersions() {
        const list = document.getElementById("settingsPlannedVersionsList");
        if (!list) return; // About tab isn't open / this build predates the section

        const groups = new Map(); // plannedVersion -> requests[]

        plannedVersionsCache
            .filter(req => req.plannedVersion && ACTIVE_STATUSES.includes(req.status))
            .forEach(req => {
                if (!groups.has(req.plannedVersion)) groups.set(req.plannedVersion, []);
                groups.get(req.plannedVersion).push(req);
            });

        if (!groups.size) {
            list.innerHTML = `<div class="workspaceEmpty">Nothing scheduled for a future version yet.</div>`;
            return;
        }

        const sortedVersions = [...groups.keys()].sort(compareVersions);

        list.innerHTML = sortedVersions.map(version => {
            const items = [...groups.get(version)].sort((a, b) => (b.votes || 0) - (a.votes || 0));
            return `
                <div class="plannedVersionGroup">
                    <div class="plannedVersionHeader">📅 <strong>Planned for Version ${escapeHtml(version)}</strong></div>
                    ${items.map(req => `
                        <div class="plannedVersionItem">
                            <span>${escapeHtml(req.title)}</span>
                            <span class="plannedVersionMeta">${STATUS_LABELS[req.status] || req.status} · 👍 ${req.votes || 0}</span>
                        </div>
                    `).join("")}
                </div>
            `;
        }).join("");
    }

    function startPlannedVersionsListener() {
        if (plannedVersionsUnsubscribe) return; // already listening

        const list = document.getElementById("settingsPlannedVersionsList");
        if (list) list.innerHTML = `<div class="workspaceEmpty">Loading...</div>`;

        plannedVersionsUnsubscribe = db.collection("featureRequests")
            .onSnapshot(snapshot => {
                plannedVersionsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPlannedVersions();
            }, err => {
                console.error("Planned Versions listener failed:", err);
                if (list) list.innerHTML = `<div class="workspaceEmpty">Failed to load.</div>`;
            });
    }

    function stopPlannedVersionsListener() {
        if (plannedVersionsUnsubscribe) {
            plannedVersionsUnsubscribe();
            plannedVersionsUnsubscribe = null;
        }
    }

    // ===========================================
    // INIT
    // ===========================================

    window.initializeFeedback = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeFeedback, 300);
            return;
        }

        if (initialized) return;
        initialized = true;

        populateDropdowns();

        const openBtn = document.getElementById("feedbackOpenBtn");
        const modal = document.getElementById("feedbackModal");
        const cancelBtn = document.getElementById("feedbackCancelBtn");
        const submitBtn = document.getElementById("feedbackSubmitBtn");
        const typeSelect = document.getElementById("feedbackTypeSelect");

        if (openBtn && modal) {
            openBtn.onclick = () => {
                resetForm();
                modal.classList.remove("hidden");
                modal.style.display = "flex";
            };
        }

        if (cancelBtn && modal) {
            cancelBtn.onclick = () => {
                modal.classList.add("hidden");
                modal.remove();
            };
        }

        if (submitBtn) {
            submitBtn.onclick = submitFeedback;
        }

        if (typeSelect) {
            typeSelect.addEventListener("change", toggleReproVisibility);
        }

        bindDuplicateDetection();

        const myRequestsBtn = document.getElementById("feedbackMyRequestsBtn");
        const myRequestsModal = document.getElementById("feedbackMyRequestsModal");
        const myRequestsCloseBtn = document.getElementById("feedbackMyRequestsCloseBtn");

        if (myRequestsBtn && myRequestsModal) {
            myRequestsBtn.onclick = () => {
                myRequestsModal.classList.remove("hidden");
                myRequestsModal.style.display = "flex";
                loadMyRequests();
            };
        }
        if (myRequestsCloseBtn && myRequestsModal) {
            myRequestsCloseBtn.onclick = () => {
                myRequestsModal.classList.add("hidden");
                myRequestsModal.style.display = "none";
            };
        }

        const viewCloseXBtn = document.getElementById("feedbackViewCloseXBtn");
        if (viewCloseXBtn) {
            viewCloseXBtn.onclick = closeFeedbackViewModal;
        }

        const browseBtn = document.getElementById("feedbackBrowseBtn");
        const browseModal = document.getElementById("feedbackBrowseModal");
        const browseCloseBtn = document.getElementById("feedbackBrowseCloseBtn");
        const browseSortSelect = document.getElementById("feedbackBrowseSort");

        if (browseBtn && browseModal) {
            browseBtn.onclick = () => {
                browseModal.classList.remove("hidden");
                browseModal.style.display = "flex";
                startBrowseListener();
            };
        }
        if (browseCloseBtn && browseModal) {
            browseCloseBtn.onclick = () => {
                browseModal.classList.add("hidden");
                browseModal.style.display = "none";
                stopBrowseListener();
            };
        }
        if (browseSortSelect) {
            browseSortSelect.value = browseSort;
            browseSortSelect.addEventListener("change", () => {
                browseSort = browseSortSelect.value;
                renderBrowseList();
            });
        }

        startMyStatusNotificationListener();
        bindDevPanelFeedbackUI();
        bindReleaseManagementUI();

        // Batch 8: "Planned for Upcoming Versions" — addEventListener
        // (not .onclick), same reasoning as the Dev Panel buttons above:
        // app.js already owns .onclick on these for tab switching / screen
        // navigation, so this just piggybacks without clobbering it.
        const settingsTabBtns = document.querySelectorAll(".settingsTab");
        settingsTabBtns.forEach(btn => {
            if (btn.dataset.section === "about") {
                btn.addEventListener("click", startPlannedVersionsListener);
            } else {
                btn.addEventListener("click", stopPlannedVersionsListener);
            }
        });
        const settingsBackBtn = document.getElementById("settingsBackBtn");
        if (settingsBackBtn) settingsBackBtn.addEventListener("click", stopPlannedVersionsListener);

        console.log("🧩 Feedback / Feature Request module ready (Batch 1+2+3+4+5+6+7+8)");
    };

})();
