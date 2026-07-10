// ===========================================
// RelayDesk
// announcements.js
// Announcements System (Admin posts, Employees acknowledge)
// ===========================================
//
// Firestore shape:
//   announcements/{id} -> { title, body, category, postedBy, postedAt,
//                            readBy: [codes] }
//
// Read-receipt model mirrors chat.js's `readBy` array approach exactly:
// employees add themselves to `readBy` via an arrayUnion when they hit
// "Acknowledge". The admin panel diffs `readBy` against the roster of
// employees currently on an active shift (On Duty / Break / Away) to
// show who still needs to acknowledge.

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    // Phase 11, batch 4: toast/alert/confirm strings via shared I18N.
    if (window.I18N) {
        window.I18N.register("announcements", {
            en: {
                acknowledgeFailed: "Couldn't acknowledge — try again.",
                acknowledgedBtn: "✓ Acknowledged",
                noPermissionPost: "You don't have permission to post announcements.",
                titleAndMessageRequired: "Please enter both a title and a message.",
                posted: "Announcement posted ✔",
                postFailed: "Couldn't post announcement — try again.",
                noPermissionDelete: "You don't have permission to delete announcements.",
                confirmDelete: "Delete announcement \"{title}\"?",
                deleteFailed: "Couldn't delete — try again.",
                noAnnouncementsEmployee: "No announcements yet.",
                noAnnouncementsAdmin: "No announcements posted yet.",
                newTag: "NEW",
                readTag: "✓ Read",
                postedBy: "Posted by {name} • {when}",
                noOneOnShift: "No employees currently on shift.",
                acknowledgedCount: "{read}/{total} acknowledged (on-shift)",
                hideReceipts: "▲ Hide read receipts",
                showReceipts: "▼ Show read receipts",
                deleteBtn: "🗑 Delete"
            },
            ar: {
                acknowledgeFailed: "تعذّر تأكيد الاطلاع — يرجى المحاولة مرة أخرى.",
                acknowledgedBtn: "✓ تم الاطلاع",
                noPermissionPost: "ليس لديك صلاحية لنشر الإعلانات.",
                titleAndMessageRequired: "يرجى إدخال العنوان والرسالة كليهما.",
                posted: "تم نشر الإعلان ✔",
                postFailed: "تعذّر نشر الإعلان — يرجى المحاولة مرة أخرى.",
                noPermissionDelete: "ليس لديك صلاحية لحذف الإعلانات.",
                confirmDelete: "حذف الإعلان \"{title}\"؟",
                deleteFailed: "تعذّر الحذف — يرجى المحاولة مرة أخرى.",
                noAnnouncementsEmployee: "لا توجد إعلانات بعد.",
                noAnnouncementsAdmin: "لم يتم نشر أي إعلانات بعد.",
                newTag: "جديد",
                readTag: "✓ تمت القراءة",
                postedBy: "نُشر بواسطة {name} • {when}",
                noOneOnShift: "لا يوجد موظفون في المناوبة حاليًا.",
                acknowledgedCount: "{read}/{total} تم الاطلاع (في المناوبة)",
                hideReceipts: "▲ إخفاء إيصالات القراءة",
                showReceipts: "▼ عرض إيصالات القراءة",
                deleteBtn: "🗑 حذف"
            }
        });
    }

    const ACTIVE_STATUSES = ["On Duty", "Break", "Away"];

    const CATEGORY_META = {
        sop:         { label: "New SOP",            emoji: "📄" },
        maintenance: { label: "System Maintenance", emoji: "🛠" },
        meeting:     { label: "Meeting",             emoji: "📅" },
        policy:      { label: "Policy Change",       emoji: "📜" },
        general:     { label: "Announcement",        emoji: "📢" }
    };

    const Announcements = {
        employeeInitialized: false,
        adminInitialized: false,
        cachedAnnouncements: [],        // for employee view
        cachedAdminAnnouncements: [],   // for admin view
        cachedActiveUsers: [],
        expandedAdminId: null,
        viewingId: null
    };

    RelayDesk.announcements = Announcements;

    // ===========================================
    // HELPERS
    // ===========================================

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    // Adds `value` to the array at `field` on `ref`, using an atomic
    // arrayUnion when available, falling back to a manual
    // read-modify-write. Same approach as chat.js's readBy handling.
    async function arrayUnionSafe(ref, field, value) {

        const FieldValue = window.firebase?.firestore?.FieldValue || null;

        if (FieldValue) {
            await ref.set({ [field]: FieldValue.arrayUnion(value) }, { merge: true });
            return;
        }

        const doc = await ref.get();
        const data = doc.data() || {};
        const arr = Array.isArray(data[field]) ? data[field] : [];

        if (!arr.includes(value)) {
            arr.push(value);
            await ref.set({ [field]: arr }, { merge: true });
        }
    }

    function categoryTag(category) {
        const meta = CATEGORY_META[category] || CATEGORY_META.general;
        return `${meta.emoji} ${meta.label}`;
    }

    function formatWhen(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    // ===========================================
    // EMPLOYEE SIDE
    // ===========================================

    let empUI = {};

    window.initializeAnnouncementsEmployee = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(window.initializeAnnouncementsEmployee, 300);
            return;
        }

        if (Announcements.employeeInitialized) return;
        Announcements.employeeInitialized = true;

        cacheEmployeeUI();
        bindEmployeeUI();
        listenAnnouncementsEmployee();

        console.log("📢 Announcements (employee) initialized for", RelayDesk.currentUser);
    };

    function cacheEmployeeUI() {
        empUI = {
            list: document.getElementById("announcementList"),
            badge: document.getElementById("announcementUnreadBadge"),
            modal: document.getElementById("announcementModal"),
            modalTitle: document.getElementById("announcementModalTitle"),
            modalCategory: document.getElementById("announcementModalCategory"),
            modalBody: document.getElementById("announcementModalBody"),
            modalMeta: document.getElementById("announcementModalMeta"),
            closeBtn: document.getElementById("announcementModalCloseBtn"),
            ackBtn: document.getElementById("announcementAckBtn")
        };
    }

    function bindEmployeeUI() {

        if (empUI.closeBtn) {
            empUI.closeBtn.onclick = closeAnnouncementModal;
        }

        if (empUI.ackBtn) {
            empUI.ackBtn.onclick = acknowledgeCurrent;
        }

        // click on the dark overlay (outside the box) also closes it
        if (empUI.modal) {
            empUI.modal.addEventListener("click", (e) => {
                if (e.target === empUI.modal) closeAnnouncementModal();
            });
        }
    }

    function listenAnnouncementsEmployee() {

        db.collection("announcements")
            .orderBy("postedAt", "desc")
            .onSnapshot(snapshot => {

                const items = [];
                snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

                Announcements.cachedAnnouncements = items;
                renderEmployeeList(items);

                // keep an open modal in sync (e.g. after acknowledging)
                if (Announcements.viewingId) {
                    const still = items.find(a => a.id === Announcements.viewingId);
                    if (still) renderModalAckState(still);
                }

            }, err => console.error("Announcements listener failed:", err));
    }

    function renderEmployeeList(items) {

        if (!empUI.list) return;

        const me = RelayDesk.currentUser;

        if (!items.length) {
            const emptyMsg = window.I18N ? window.I18N.t("announcements.noAnnouncementsEmployee") : "No announcements yet.";
            empUI.list.innerHTML = `<div class="workspaceEmpty">${emptyMsg}</div>`;
            if (empUI.badge) empUI.badge.classList.add("hidden");
            return;
        }

        let unreadCount = 0;
        const newTag = window.I18N ? window.I18N.t("announcements.newTag") : "NEW";
        const readTag = window.I18N ? window.I18N.t("announcements.readTag") : "✓ Read";

        empUI.list.innerHTML = items.map(a => {

            const readBy = a.readBy || [];
            const unread = !readBy.includes(me);
            if (unread) unreadCount++;

            return `
                <div class="announcementItem ${unread ? "unreadAnnouncement" : ""}" data-id="${a.id}">
                    <div class="announcementItemTop">
                        <span class="announcementCategoryTag">${categoryTag(a.category)}</span>
                        ${unread
                            ? `<span class="announcementNewTag">${newTag}</span>`
                            : `<span class="announcementReadTag">${readTag}</span>`}
                    </div>
                    <div class="announcementItemTitle">${escapeHtml(a.title)}</div>
                    <div class="announcementItemMeta">${formatWhen(a.postedAt)}</div>
                </div>
            `;
        }).join("");

        empUI.list.querySelectorAll(".announcementItem").forEach(el => {
            el.onclick = () => openAnnouncementModal(el.dataset.id);
        });

        window.I18N?.apply(empUI.list);

        if (empUI.badge) {
            const badgeEnabled = window.ESMSettings?.get("notifAnnouncementsBadge") !== false;
            if (unreadCount > 0 && badgeEnabled) {
                empUI.badge.textContent = unreadCount;
                empUI.badge.classList.remove("hidden");
            } else {
                empUI.badge.classList.add("hidden");
            }
        }
    }

    function openAnnouncementModal(id) {

        const a = Announcements.cachedAnnouncements.find(x => x.id === id);
        if (!a || !empUI.modal) return;

        Announcements.viewingId = id;

        empUI.modalTitle.textContent = a.title;
        empUI.modalCategory.textContent = categoryTag(a.category);
        empUI.modalBody.textContent = a.body || "";
        empUI.modalMeta.textContent = window.I18N
            ? window.I18N.t("announcements.postedBy", { name: a.postedBy, when: formatWhen(a.postedAt) })
            : `Posted by ${a.postedBy} • ${formatWhen(a.postedAt)}`;

        renderModalAckState(a);

        empUI.modal.classList.remove("hidden");
    }

    function renderModalAckState(a) {

        if (!empUI.ackBtn) return;

        const me = RelayDesk.currentUser;
        const readBy = a.readBy || [];
        const alreadyRead = readBy.includes(me);

        if (alreadyRead) {
            empUI.ackBtn.textContent = "✓ Acknowledged";
            empUI.ackBtn.disabled = true;
        } else {
            empUI.ackBtn.textContent = "✓ Acknowledge";
            empUI.ackBtn.disabled = false;
        }
    }

    function closeAnnouncementModal() {
        if (empUI.modal) empUI.modal.classList.add("hidden");
        Announcements.viewingId = null;
    }

    async function acknowledgeCurrent() {

        const id = Announcements.viewingId;
        if (!id) return;

        try {
            const ref = db.collection("announcements").doc(id);
            await arrayUnionSafe(ref, "readBy", RelayDesk.currentUser);

            if (empUI.ackBtn) {
                empUI.ackBtn.textContent = window.I18N ? window.I18N.t("announcements.acknowledgedBtn") : "✓ Acknowledged";
                empUI.ackBtn.disabled = true;
            }
        } catch (err) {
            console.error("Acknowledge failed:", err);
            alert(window.I18N ? window.I18N.t("announcements.acknowledgeFailed") : "Couldn't acknowledge — try again.");
        }
    }

    // kick off employee-side init the same way chat.js does
    window.addEventListener("DOMContentLoaded", () => {
        window.initializeAnnouncementsEmployee();
    });

    // ===========================================
    // ADMIN SIDE
    // ===========================================

    let adminUI = {};

    function initializeAnnouncementsAdmin() {

        if (Announcements.adminInitialized) return;
        Announcements.adminInitialized = true;

        cacheAdminUI();
        applyComposerVisibility();
        bindAdminUI();
        listenAnnouncementsAdmin();
        listenActiveUsersAdmin();

        console.log("📢 Announcements (admin) initialized");
    }

    // hook into the same startup path admin-extras.js uses
    window.addEventListener("DOMContentLoaded", () => {
        const check = setInterval(() => {
            if (window.hasAdminAccess?.()) {
                initializeAnnouncementsAdmin();
                clearInterval(check);
            }
        }, 400);
    });

    function cacheAdminUI() {
        adminUI = {
            composer: document.getElementById("announcementComposer"),
            titleInput: document.getElementById("announcementTitleInput"),
            categorySelect: document.getElementById("announcementCategorySelect"),
            bodyInput: document.getElementById("announcementBodyInput"),
            postBtn: document.getElementById("announcementPostBtn"),
            list: document.getElementById("announcementAdminList")
        };
    }

    // ===== PERMISSION SYSTEM =====
    // only users granted canAccessAdminPanel (or A000) get the composer;
    // everyone with admin panel access can still see the read-receipt list
    function applyComposerVisibility() {
        if (adminUI.composer) {
            adminUI.composer.classList.toggle("hidden", !window.hasPermission?.("canAccessAdminPanel"));
        }
    }

    function bindAdminUI() {
        if (adminUI.postBtn) {
            adminUI.postBtn.onclick = postAnnouncement;
        }
    }

    async function postAnnouncement() {

        if (!window.hasPermission?.("canAccessAdminPanel")) {
            alert(window.I18N ? window.I18N.t("announcements.noPermissionPost") : "You don't have permission to post announcements.");
            return;
        }

        const title = (adminUI.titleInput?.value || "").trim();
        const body = (adminUI.bodyInput?.value || "").trim();
        const category = adminUI.categorySelect?.value || "general";

        if (!title || !body) {
            alert(window.I18N ? window.I18N.t("announcements.titleAndMessageRequired") : "Please enter both a title and a message.");
            return;
        }

        try {
            await db.collection("announcements").add({
                title,
                body,
                category,
                postedBy: RelayDesk.currentUser,
                postedAt: Date.now(),
                readBy: []
            });

            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "ANNOUNCEMENT_POSTED", `${title} (${category})`);
            }

            if (adminUI.titleInput) adminUI.titleInput.value = "";
            if (adminUI.bodyInput) adminUI.bodyInput.value = "";

            alert(window.I18N ? window.I18N.t("announcements.posted") : "Announcement posted ✔");
        } catch (err) {
            console.error("Post announcement failed:", err);
            alert(window.I18N ? window.I18N.t("announcements.postFailed") : "Couldn't post announcement — try again.");
        }
    }

    function listenAnnouncementsAdmin() {

        if (!adminUI.list) return;

        db.collection("announcements")
            .orderBy("postedAt", "desc")
            .onSnapshot(snapshot => {

                const items = [];
                snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));

                Announcements.cachedAdminAnnouncements = items;
                renderAdminList();

            }, err => console.error("Admin announcements listener failed:", err));
    }

    // roster = employees currently on an active shift (On Duty / Break /
    // Away), excluding the reserved A000 system account — per how
    // "active" is already defined elsewhere in this codebase (see
    // rebuildActiveShiftHistory in admin.js)
    function listenActiveUsersAdmin() {

        db.collection("users")
            .onSnapshot(snapshot => {

                const active = [];

                snapshot.forEach(doc => {
                    if (doc.id === "A000") return;
                    const u = doc.data();
                    if (ACTIVE_STATUSES.includes(u.status)) {
                        active.push(doc.id);
                    }
                });

                Announcements.cachedActiveUsers = active;
                renderAdminList();

            }, err => console.error("Active users listener (announcements) failed:", err));
    }

    function renderAdminList() {

        if (!adminUI.list) return;

        const items = Announcements.cachedAdminAnnouncements || [];
        const roster = Announcements.cachedActiveUsers || [];

        if (!items.length) {
            const emptyMsg = window.I18N ? window.I18N.t("announcements.noAnnouncementsAdmin") : "No announcements posted yet.";
            adminUI.list.innerHTML = `<div class="workspaceEmpty">${emptyMsg}</div>`;
            return;
        }

        const canDelete = window.hasPermission?.("canManageEmployees");
        const noOneOnShift = window.I18N ? window.I18N.t("announcements.noOneOnShift") : "No employees currently on shift.";
        const hideReceipts = window.I18N ? window.I18N.t("announcements.hideReceipts") : "▲ Hide read receipts";
        const showReceipts = window.I18N ? window.I18N.t("announcements.showReceipts") : "▼ Show read receipts";
        const deleteBtnLabel = window.I18N ? window.I18N.t("announcements.deleteBtn") : "🗑 Delete";

        adminUI.list.innerHTML = items.map(a => {

            const readBy = a.readBy || [];
            const readRoster = roster.filter(id => readBy.includes(id));
            const unreadRoster = roster.filter(id => !readBy.includes(id));
            const expanded = Announcements.expandedAdminId === a.id;

            const chips = roster.length
                ? `
                    ${readRoster.map(id => `<span class="ackChip ackRead">✔ ${escapeHtml(id)}</span>`).join("")}
                    ${unreadRoster.map(id => `<span class="ackChip ackUnread">❌ ${escapeHtml(id)}</span>`).join("")}
                  `
                : `<span class="announcementItemMeta">${noOneOnShift}</span>`;

            const ackCountLabel = window.I18N
                ? window.I18N.t("announcements.acknowledgedCount", { read: readRoster.length, total: roster.length })
                : `${readRoster.length}/${roster.length} acknowledged (on-shift)`;

            const postedByLabel = window.I18N
                ? window.I18N.t("announcements.postedBy", { name: escapeHtml(a.postedBy), when: formatWhen(a.postedAt) })
                : `Posted by ${escapeHtml(a.postedBy)} • ${formatWhen(a.postedAt)}`;

            return `
                <div class="announcementAdminItem">
                    <div class="announcementItemTop">
                        <span class="announcementCategoryTag">${categoryTag(a.category)}</span>
                        <span class="announcementItemMeta">${ackCountLabel}</span>
                    </div>
                    <div class="announcementItemTitle">${escapeHtml(a.title)}</div>
                    <div class="announcementItemMeta">${postedByLabel}</div>
                    <div class="announcementAdminBody">${escapeHtml(a.body)}</div>

                    <button class="smallButton announcementExpandBtn" data-id="${a.id}">
                        ${expanded ? hideReceipts : showReceipts}
                    </button>

                    <div class="ackList ${expanded ? "" : "hidden"}">
                        ${chips}
                    </div>

                    ${canDelete ? `
                        <br>
                        <button class="smallButton dangerButton announcementDeleteBtn" data-id="${a.id}" data-title="${escapeHtml(a.title)}">
                            ${deleteBtnLabel}
                        </button>
                    ` : ""}
                </div>
            `;
        }).join("");

        adminUI.list.querySelectorAll(".announcementExpandBtn").forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.id;
                Announcements.expandedAdminId = Announcements.expandedAdminId === id ? null : id;
                renderAdminList();
            };
        });

        adminUI.list.querySelectorAll(".announcementDeleteBtn").forEach(btn => {
            btn.onclick = () => deleteAnnouncement(btn.dataset.id, btn.dataset.title);
        });

        window.I18N?.apply(adminUI.list);
    }

    async function deleteAnnouncement(id, title) {

        if (!window.hasPermission?.("canManageEmployees")) {
            alert(window.I18N ? window.I18N.t("announcements.noPermissionDelete") : "You don't have permission to delete announcements.");
            return;
        }

        if (!confirm(window.I18N ? window.I18N.t("announcements.confirmDelete", { title: title }) : `Delete announcement "${title}"?`)) return;

        try {
            await db.collection("announcements").doc(id).delete();

            if (typeof logAudit === "function") {
                await logAudit(RelayDesk.currentUser, "ANNOUNCEMENT_DELETED", title);
            }
        } catch (err) {
            console.error("Delete announcement failed:", err);
            alert(window.I18N ? window.I18N.t("announcements.deleteFailed") : "Couldn't delete — try again.");
        }
    }

})();
