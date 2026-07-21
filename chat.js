// ===========================================
// RelayDesk
// chat.js
// Colleague Messaging (DMs + Group Chats)
// ===========================================
//
// Firestore shape:
//   chats/{chatId}                -> { id, members:[codes], type:"dm"|"group",
//                                       name, createdBy, createdAt,
//                                       lastMessage, lastTime, lastFrom,
//                                       lastMessageId,
//                                       typing: { [code]: timestamp|null } }
//   chats/{chatId}/messages/{id}  -> { from, text, time,
//                                       deliveredTo:[codes], readBy:[codes],
//                                       reactions: { [emoji]: [codes] },
//                                       replyTo: { id, from, text } | null }
//   users/{code}                  -> (existing fields) + lastSeen, online
//
// DM chatId = the two member codes, sorted, joined with "__"
// Group chatId = "group_<timestamp>_<creatorCode>"

(function () {

    if (!window.RelayDesk) window.RelayDesk = {};

    // Phase 11, batch 3: confirm() dialog strings via shared I18N.
    if (window.I18N) {
        window.I18N.register("chat", {
            en: {
                confirmDeleteChat: "Permanently delete this chat for ALL members? This can't be undone.",
                confirmDeleteMessage: "Delete this message? This can't be undone."
            },
            ar: {
                confirmDeleteChat: "حذف هذه المحادثة نهائيًا لجميع الأعضاء؟ لا يمكن التراجع عن هذا الإجراء.",
                confirmDeleteMessage: "حذف هذه الرسالة؟ لا يمكن التراجع عن هذا الإجراء."
            }
        });
    }

    const REACTION_EMOJIS = ["👍", "😂", "❤️", "👀", "😭", "💀", "😏", "👋", "🫂", "🔥"];
    const TYPING_WRITE_THROTTLE_MS = 1200;
    const TYPING_CLEAR_AFTER_MS = 2500;
    const TYPING_STALE_MS = 3000;
    const PRESENCE_HEARTBEAT_MS = 20000;
    const ONLINE_WINDOW_MS = 25000;
    const SEARCH_DEBOUNCE_MS = 350;
    const SEARCH_PER_CHAT_LIMIT = 200;
    const SEARCH_RESULT_LIMIT = 50;

    // ---- image attachments (screenshots / drag-drop / file picker) ----
    const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — generous for a screenshot
    const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

    const Chat = {
        chats: {},
        openChatId: null,
        lastOpenedChatId: null,
        messagesUnsub: null,
        chatsUnsub: null,
        colleaguesUnsub: null,
        lastSeenUnsub: null,
        seenTimestamps: {},
        colleagueCodes: [],
        initialized: false,
        UI: {},

        // ---- new state for this feature set ----
        replyingTo: null,          // { id, from, text }
        lastMessagesSnapshotDocs: [],
        typingClearTimer: null,
        lastTypingSentAt: 0,
        typingDisplayInterval: null,
        presenceHeartbeatInterval: null,
        searchDebounceTimer: null,
        openReactionPickerFor: null,

        // ---- chat/message deletion state ----
        selectMode: false,
        selectedIds: new Set(),

        // ---- message edit state ----
        editingMessage: null, // { chatId, messageId }

        // ---- image attachment composer state ----
        pendingImageFile: null,       // File awaiting Send/Cancel in the preview bar
        pendingImagePreviewUrl: null  // local object URL shown in the preview + optimistic bubble
    };

    RelayDesk.chat = Chat;

    // ===========================================
    // INIT
    // ===========================================

    window.initializeChat = function () {

        if (!RelayDesk.currentUser) {
            setTimeout(initializeChat, 300);
            return;
        }

        if (Chat.initialized) return;
        Chat.initialized = true;

        cacheUI();
        ensureExtraUI();
        cacheExtraUI();
        bindUI();
        bindExtraUI();
        initChatWindowDrag();
        listenToChats();
        listenToColleagues();
        startPresenceHeartbeat();

        console.log("💬 Chat initialized for", RelayDesk.currentUser);
    };

    function cacheUI() {

        Chat.UI = {
            list: document.getElementById("chatList"),
            newBtn: document.getElementById("newChatBtn"),
            window: document.getElementById("chatWindow"),
            title: document.getElementById("chatWindowTitle"),
            messages: document.getElementById("chatMessages"),
            input: document.getElementById("chatInput"),
            sendBtn: document.getElementById("chatSendBtn"),
            attachBtn: document.getElementById("chatAttachBtn"),
            imageFileInput: document.getElementById("chatImageFileInput"),
            closeBtn: document.getElementById("chatCloseBtn"),
            pickerModal: document.getElementById("chatPickerModal"),
            pickerList: document.getElementById("chatPickerList"),
            pickerStart: document.getElementById("chatPickerStart"),
            pickerCancel: document.getElementById("chatPickerCancel"),
            pickerNameWrap: document.getElementById("chatGroupNameWrap"),
            pickerName: document.getElementById("chatGroupNameInput"),
            header: document.querySelector(".chatWindowHeader")
        };
    }

    // Builds any DOM this feature set needs that isn't already in the
    // page: the typing/last-seen header lines, the reply preview bar,
    // and the search button + modal. If the host page already defines
    // an element with a given id, that one is reused untouched.
    function ensureExtraUI() {

        // --- typing indicator + last seen, under the chat title ---
        if (Chat.UI.window && !document.getElementById("chatSubHeader")) {

            const subHeader = document.createElement("div");
            subHeader.id = "chatSubHeader";
            subHeader.className = "chatSubHeader";
            subHeader.innerHTML = `
                <span id="chatLastSeen" class="chatLastSeen"></span>
                <span id="chatTypingIndicator" class="chatTypingIndicator"></span>
            `;

            const titleEl = document.getElementById("chatWindowTitle");
            titleEl?.parentElement?.insertBefore(subHeader, titleEl.nextSibling);
        }

        // --- static/floating toggle. Checked (default) = the window
        // stays anchored in its usual fixed bottom-right corner spot,
        // same as it's always behaved. Unchecked = the window can be
        // dragged anywhere by its header, mirroring the Today's Timers
        // drag pattern (timers.js). Re-checking snaps it back home. ---
        if (Chat.UI.header && !document.getElementById("chatStaticToggle")) {

            const toggleWrap = document.createElement("label");
            toggleWrap.id = "chatStaticToggleWrap";
            toggleWrap.className = "chatStaticToggleWrap";
            toggleWrap.title = "Uncheck to drag this window by its header";
            toggleWrap.innerHTML = `
                <input type="checkbox" id="chatStaticToggle" checked>
                📌 Static
            `;

            Chat.UI.header.appendChild(toggleWrap);
        }

        // --- reply preview bar, just above the message input ---
        if (Chat.UI.input && !document.getElementById("chatReplyPreview")) {

            const replyBar = document.createElement("div");
            replyBar.id = "chatReplyPreview";
            replyBar.className = "chatReplyPreview hidden";
            replyBar.innerHTML = `
                <div class="chatReplyPreviewBody">
                    <div class="chatReplyPreviewLabel">↪ Replying to <span id="chatReplyPreviewFrom"></span></div>
                    <div class="chatReplyPreviewText" id="chatReplyPreviewText"></div>
                </div>
                <button id="chatReplyPreviewCancel" class="chatReplyPreviewCancel" type="button">✕</button>
            `;

            Chat.UI.input.parentElement?.insertBefore(replyBar, Chat.UI.input);
        }

        // --- edit preview bar, same slot/style as the reply bar above,
        // mutually exclusive with it (starting an edit cancels any
        // in-progress reply and vice versa) ---
        if (Chat.UI.input && !document.getElementById("chatEditPreview")) {

            const editBar = document.createElement("div");
            editBar.id = "chatEditPreview";
            editBar.className = "chatReplyPreview hidden";
            editBar.innerHTML = `
                <div class="chatReplyPreviewBody">
                    <div class="chatReplyPreviewLabel">✏️ Editing message</div>
                </div>
                <button id="chatEditPreviewCancel" class="chatReplyPreviewCancel" type="button">✕</button>
            `;

            Chat.UI.input.parentElement?.insertBefore(editBar, Chat.UI.input);
        }

        // --- image preview bar, same slot as the reply/edit bars above.
        // Shown after a screenshot paste / drag-drop / file-pick, before
        // anything is uploaded. Cancel here uploads nothing. ---
        if (Chat.UI.input && !document.getElementById("chatImagePreviewBar")) {

            const imageBar = document.createElement("div");
            imageBar.id = "chatImagePreviewBar";
            imageBar.className = "chatImagePreviewBar hidden";
            imageBar.innerHTML = `
                <img id="chatImagePreviewThumb" class="chatImagePreviewThumb" alt="">
                <div class="chatImagePreviewBody">
                    <div class="chatImagePreviewLabel">🖼 Image ready to send</div>
                    <input id="chatImageCaptionInput" type="text" class="chatImageCaptionInput"
                        placeholder="Add a caption (optional)...">
                </div>
                <div class="chatImagePreviewActions">
                    <button id="chatImageSendBtn" class="smallButton" type="button">Send</button>
                    <button id="chatImageCancelBtn" class="chatReplyPreviewCancel" type="button">✕</button>
                </div>
            `;

            Chat.UI.input.parentElement?.parentElement?.insertBefore(imageBar, Chat.UI.input.parentElement);
        }

        // --- image viewer (lightbox) modal — click any chat image to open it ---
        if (!document.getElementById("chatImageViewerModal")) {

            const viewerModal = document.createElement("div");
            viewerModal.id = "chatImageViewerModal";
            viewerModal.className = "chatModal chatImageViewerModal hidden";
            viewerModal.innerHTML = `
                <div class="chatImageViewerInner">
                    <button id="chatImageViewerClose" class="chatReplyPreviewCancel chatImageViewerCloseBtn" type="button">✕</button>
                    <img id="chatImageViewerImg" class="chatImageViewerImg" alt="">
                    <a id="chatImageViewerDownload" class="smallButton chatImageViewerDownload" download target="_blank" rel="noopener">⬇ Download</a>
                </div>
            `;

            document.body.appendChild(viewerModal);
        }

        // --- search button next to "new chat" ---
        if (Chat.UI.newBtn && !document.getElementById("chatSearchBtn")) {

            const searchBtn = document.createElement("button");
            searchBtn.id = "chatSearchBtn";
            searchBtn.className = "smallButton";
            searchBtn.type = "button";
            searchBtn.textContent = "🔎 Search";

            Chat.UI.newBtn.parentElement?.insertBefore(searchBtn, Chat.UI.newBtn.nextSibling);
        }

        // --- select-mode toggle + delete-chat + close buttons, tucked away
        // behind a single "⋮" more-options button in the header corner ---
        if (Chat.UI.header && !document.getElementById("chatSelectBtn")) {

            const closeBtn = document.getElementById("chatCloseBtn");

            const selectBtn = document.createElement("button");
            selectBtn.id = "chatSelectBtn";
            selectBtn.type = "button";
            selectBtn.title = "Select messages";
            selectBtn.textContent = "☑ Select messages";

            const deleteChatBtn = document.createElement("button");
            deleteChatBtn.id = "chatDeleteChatBtn";
            deleteChatBtn.type = "button";
            deleteChatBtn.title = "Delete chat";
            deleteChatBtn.textContent = "🗑 Delete chat";

            const moreBtn = document.createElement("button");
            moreBtn.id = "chatMoreBtn";
            moreBtn.className = "chatMoreBtn";
            moreBtn.type = "button";
            moreBtn.title = "More options";
            moreBtn.textContent = "⋮";
            // bumped up from the default size so it's an easier tap target
            moreBtn.style.fontSize = "24px";
            moreBtn.style.lineHeight = "1";
            moreBtn.style.padding = "4px 10px";

            const moreMenu = document.createElement("div");
            moreMenu.id = "chatMoreMenu";
            moreMenu.className = "chatMoreMenu hidden";

            // relabel the existing close button so it reads sensibly as a
            // menu row instead of a lone icon
            if (closeBtn) closeBtn.textContent = "✖ Close chat";

            moreMenu.appendChild(selectBtn);
            moreMenu.appendChild(deleteChatBtn);
            if (closeBtn) moreMenu.appendChild(closeBtn);

            const moreWrap = document.createElement("div");
            moreWrap.className = "chatMoreWrap";
            moreWrap.appendChild(moreBtn);
            moreWrap.appendChild(moreMenu);

            Chat.UI.header.appendChild(moreWrap);

            moreBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                moreMenu.classList.toggle("hidden");
            });

            // close the menu after picking any action inside it
            moreMenu.addEventListener("click", (e) => {
                if (e.target.closest("button")) {
                    setTimeout(() => moreMenu.classList.add("hidden"), 0);
                }
            });

            // close the menu when clicking anywhere else on the page
            document.addEventListener("click", (e) => {
                if (!moreMenu.classList.contains("hidden") && !moreWrap.contains(e.target)) {
                    moreMenu.classList.add("hidden");
                }
            });
        }

        // --- select-mode bar (select all / delete selected / cancel) ---
        if (!document.getElementById("chatSelectBar")) {

            const selectBar = document.createElement("div");
            selectBar.id = "chatSelectBar";
            selectBar.className = "chatSelectBar hidden";
            selectBar.innerHTML = `
                <span id="chatSelectCount">0 selected</span>
                <div class="chatSelectBarActions">
                    <button id="chatSelectAllBtn" type="button">Select All</button>
                    <button id="chatDeleteSelectedBtn" type="button">Delete Selected</button>
                    <button id="chatSelectCancelBtn" type="button">Cancel</button>
                </div>
            `;

            const messagesEl = document.getElementById("chatMessages");
            messagesEl?.parentElement?.insertBefore(selectBar, messagesEl);
        }

        // --- delete-chat confirm modal (branches on group creator/Admin) ---
        if (!document.getElementById("chatDeleteModal")) {

            const modal = document.createElement("div");
            modal.id = "chatDeleteModal";
            modal.className = "chatModal hidden";
            modal.innerHTML = `
                <div class="chatModalInner">
                    <div class="chatModalHeader">
                        <b>Delete Chat</b>
                        <button id="chatDeleteModalClose" class="chatReplyPreviewCancel" type="button">✕</button>
                    </div>
                    <p id="chatDeleteModalText" class="chatDeleteModalText"></p>
                    <div class="modalButtons">
                        <button id="chatDeleteForMeBtn">Delete for Me</button>
                        <button id="chatDeleteForEveryoneBtn" class="hidden">Delete for Everyone</button>
                        <button id="chatDeleteModalCancel">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
        }

        // --- search modal ---
        if (!document.getElementById("chatSearchModal")) {

            const modal = document.createElement("div");
            modal.id = "chatSearchModal";
            modal.className = "chatModal hidden";
            modal.innerHTML = `
                <div class="chatModalInner">
                    <div class="chatModalHeader">
                        <b>Search Messages</b>
                        <button id="chatSearchClose" class="chatReplyPreviewCancel" type="button">✕</button>
                    </div>
                    <input id="chatSearchInput" type="text"
                        placeholder="Search by keyword: driver, date, load ID..." />
                    <div id="chatSearchResults" class="chatSearchResults"></div>
                </div>
            `;

            document.body.appendChild(modal);
        }
    }

    function cacheExtraUI() {

        Chat.UI.subHeader = document.getElementById("chatSubHeader");
        Chat.UI.lastSeen = document.getElementById("chatLastSeen");
        Chat.UI.typingIndicator = document.getElementById("chatTypingIndicator");

        Chat.UI.staticToggle = document.getElementById("chatStaticToggle");

        Chat.UI.replyPreview = document.getElementById("chatReplyPreview");
        Chat.UI.replyPreviewFrom = document.getElementById("chatReplyPreviewFrom");
        Chat.UI.replyPreviewText = document.getElementById("chatReplyPreviewText");
        Chat.UI.replyPreviewCancel = document.getElementById("chatReplyPreviewCancel");

        Chat.UI.editPreview = document.getElementById("chatEditPreview");
        Chat.UI.editPreviewCancel = document.getElementById("chatEditPreviewCancel");

        Chat.UI.imagePreviewBar = document.getElementById("chatImagePreviewBar");
        Chat.UI.imagePreviewThumb = document.getElementById("chatImagePreviewThumb");
        Chat.UI.imageCaptionInput = document.getElementById("chatImageCaptionInput");
        Chat.UI.imageSendBtn = document.getElementById("chatImageSendBtn");
        Chat.UI.imageCancelBtn = document.getElementById("chatImageCancelBtn");

        Chat.UI.imageViewerModal = document.getElementById("chatImageViewerModal");
        Chat.UI.imageViewerImg = document.getElementById("chatImageViewerImg");
        Chat.UI.imageViewerDownload = document.getElementById("chatImageViewerDownload");
        Chat.UI.imageViewerClose = document.getElementById("chatImageViewerClose");

        Chat.UI.searchBtn = document.getElementById("chatSearchBtn");
        Chat.UI.searchModal = document.getElementById("chatSearchModal");
        Chat.UI.searchInput = document.getElementById("chatSearchInput");
        Chat.UI.searchResults = document.getElementById("chatSearchResults");
        Chat.UI.searchClose = document.getElementById("chatSearchClose");

        Chat.UI.selectBtn = document.getElementById("chatSelectBtn");
        Chat.UI.deleteChatBtn = document.getElementById("chatDeleteChatBtn");
        Chat.UI.selectBar = document.getElementById("chatSelectBar");
        Chat.UI.selectCount = document.getElementById("chatSelectCount");
        Chat.UI.selectAllBtn = document.getElementById("chatSelectAllBtn");
        Chat.UI.deleteSelectedBtn = document.getElementById("chatDeleteSelectedBtn");
        Chat.UI.selectCancelBtn = document.getElementById("chatSelectCancelBtn");

        Chat.UI.deleteModal = document.getElementById("chatDeleteModal");
        Chat.UI.deleteModalText = document.getElementById("chatDeleteModalText");
        Chat.UI.deleteModalClose = document.getElementById("chatDeleteModalClose");
        Chat.UI.deleteForMeBtn = document.getElementById("chatDeleteForMeBtn");
        Chat.UI.deleteForEveryoneBtn = document.getElementById("chatDeleteForEveryoneBtn");
        Chat.UI.deleteModalCancel = document.getElementById("chatDeleteModalCancel");
    }

    function bindUI() {

        if (Chat.UI.newBtn) Chat.UI.newBtn.onclick = openPicker;
        if (Chat.UI.pickerCancel) Chat.UI.pickerCancel.onclick = closePicker;
        if (Chat.UI.pickerStart) Chat.UI.pickerStart.onclick = startChatFromPicker;
        if (Chat.UI.closeBtn) Chat.UI.closeBtn.onclick = closeChatWindow;
        if (Chat.UI.sendBtn) Chat.UI.sendBtn.onclick = sendCurrentMessage;

        if (Chat.UI.input) {
            Chat.UI.input.addEventListener("keydown", (e) => {
                // Shift+Enter always inserts a newline, regardless of settings.
                if (e.key !== "Enter" || e.shiftKey) return;

                const isCtrlCombo = e.ctrlKey || e.metaKey;

                // Settings feature: Chat > "Enter to Send" and "Ctrl+Enter to
                // Send". These are independent toggles — plain Enter only
                // sends if enterToSendMessages is on, Ctrl/Cmd+Enter only
                // sends if ctrlEnterToSend is on. Whichever combo was
                // pressed falls back to a normal newline if its toggle is off.
                const enterToSend = window.ESMSettings?.get("enterToSendMessages") !== false;
                const ctrlEnterToSend = window.ESMSettings?.get("ctrlEnterToSend") === true;

                const shouldSend = isCtrlCombo ? ctrlEnterToSend : enterToSend;
                if (!shouldSend) return;

                e.preventDefault();
                sendCurrentMessage();
            });
        }

        if (Chat.UI.pickerList) {
            Chat.UI.pickerList.addEventListener("change", updateGroupNameVisibility);
        }
    }

    function bindExtraUI() {

        if (Chat.UI.input) {
            Chat.UI.input.addEventListener("input", handleTypingInput);
            Chat.UI.input.addEventListener("input", autoGrowChatInput);
            // keydown already sends on Enter (see bindUI); shift+Enter still
            // inserts a newline in the textarea by default, and this keeps
            // the box sized to whatever the newline just added
            Chat.UI.input.addEventListener("keydown", () => {
                requestAnimationFrame(autoGrowChatInput);
            });
        }

        if (Chat.UI.replyPreviewCancel) {
            Chat.UI.replyPreviewCancel.onclick = cancelReply;
        }

        if (Chat.UI.editPreviewCancel) {
            Chat.UI.editPreviewCancel.onclick = cancelEditMessage;
        }

        if (Chat.UI.searchBtn) {
            Chat.UI.searchBtn.onclick = openSearch;
        }

        if (Chat.UI.searchClose) {
            Chat.UI.searchClose.onclick = closeSearch;
        }

        if (Chat.UI.searchInput) {
            Chat.UI.searchInput.addEventListener("input", () => {
                clearTimeout(Chat.searchDebounceTimer);
                Chat.searchDebounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
            });
        }

        if (Chat.UI.selectBtn) Chat.UI.selectBtn.onclick = toggleSelectMode;
        if (Chat.UI.selectAllBtn) Chat.UI.selectAllBtn.onclick = selectAllMine;
        if (Chat.UI.deleteSelectedBtn) Chat.UI.deleteSelectedBtn.onclick = deleteSelectedMessages;
        if (Chat.UI.selectCancelBtn) Chat.UI.selectCancelBtn.onclick = exitSelectMode;

        if (Chat.UI.deleteChatBtn) Chat.UI.deleteChatBtn.onclick = openDeleteChatModal;
        if (Chat.UI.deleteModalClose) Chat.UI.deleteModalClose.onclick = closeDeleteChatModal;
        if (Chat.UI.deleteModalCancel) Chat.UI.deleteModalCancel.onclick = closeDeleteChatModal;
        if (Chat.UI.deleteForMeBtn) Chat.UI.deleteForMeBtn.onclick = () => {
            deleteChatForMe(Chat.openChatId);
            closeDeleteChatModal();
        };
        if (Chat.UI.deleteForEveryoneBtn) Chat.UI.deleteForEveryoneBtn.onclick = () => {
            const chatId = Chat.openChatId;
            closeDeleteChatModal();
            if (confirm(window.I18N ? window.I18N.t("chat.confirmDeleteChat") : "Permanently delete this chat for ALL members? This can't be undone.")) {
                deleteChatForEveryone(chatId);
            }
        };

        // ---- image attachments: file picker + clipboard paste ----
        if (Chat.UI.attachBtn) Chat.UI.attachBtn.onclick = () => Chat.UI.imageFileInput?.click();

        if (Chat.UI.imageFileInput) {
            Chat.UI.imageFileInput.addEventListener("change", (e) => {
                const file = e.target.files?.[0];
                if (file) handleIncomingImageFile(file);
            });
        }

        // Ctrl+V with a Windows Snipping Tool screenshot (or any image)
        // on the clipboard while the message box is focused.
        if (Chat.UI.input) {
            Chat.UI.input.addEventListener("paste", handleChatImagePaste);
        }

        if (Chat.UI.imageSendBtn) Chat.UI.imageSendBtn.onclick = sendPendingImage;
        if (Chat.UI.imageCancelBtn) Chat.UI.imageCancelBtn.onclick = cancelPendingImage;

        // ---- image viewer (lightbox) ----
        if (Chat.UI.imageViewerClose) Chat.UI.imageViewerClose.onclick = closeImageViewer;

        if (Chat.UI.imageViewerModal) {
            // clicking the dark backdrop (not the image/inner card) closes it
            Chat.UI.imageViewerModal.addEventListener("click", (e) => {
                if (e.target === Chat.UI.imageViewerModal) closeImageViewer();
            });
        }

        if (Chat.UI.imageViewerImg) {
            // simple click-to-zoom, no pan/drag — keeps this from turning
            // into a full image-editor widget
            Chat.UI.imageViewerImg.addEventListener("click", (e) => {
                e.stopPropagation();
                Chat.UI.imageViewerImg.classList.toggle("zoomed");
            });
        }

        bindImageDragDrop();
    }

    // ===========================================
    // DRAG AND DROP + STATIC/FLOATING TOGGLE
    // Mirrors the Today's Timers dropdown pattern (timers.js). Grab
    // anywhere on the header (except the Static checkbox and the ⋮
    // menu button) to move the window while Static is unchecked.
    // Checking Static back snaps it home to its default fixed
    // bottom-right corner spot instead of leaving it wherever it was
    // dropped.
    // ===========================================

    function initChatWindowDrag() {

        const win = Chat.UI.window;
        const header = Chat.UI.header;
        const staticToggle = Chat.UI.staticToggle;

        if (!win || !header) return;
        if (header.dataset.dragBound) return; // never bind twice
        header.dataset.dragBound = "1";

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const isStatic = () => !staticToggle || staticToggle.checked;

        const updateCursor = () => {
            header.classList.toggle("chatDraggable", !isStatic());
        };

        // snaps back to the CSS-default fixed bottom-right spot
        const resetToStaticPosition = () => {
            win.style.position = "";
            win.style.left = "";
            win.style.top = "";
            win.style.right = "";
            win.style.bottom = "";
        };

        staticToggle?.addEventListener("change", () => {
            if (staticToggle.checked) resetToStaticPosition();
            updateCursor();
        });

        header.addEventListener("mousedown", (e) => {

            if (isStatic()) return; // dragging is off while Static is checked
            if (e.target.closest("button, input, label")) return; // don't hijack controls

            dragging = true;
            win.classList.add("dragging");

            const rect = win.getBoundingClientRect();
            win.style.position = "fixed";
            win.style.left = rect.left + "px";
            win.style.top = rect.top + "px";
            win.style.right = "auto";
            win.style.bottom = "auto";

            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {

            if (!dragging) return;

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - win.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - win.offsetHeight));

            win.style.left = newLeft + "px";
            win.style.top = newTop + "px";
        });

        document.addEventListener("mouseup", () => {

            if (!dragging) return;

            dragging = false;
            win.classList.remove("dragging");
            document.body.style.userSelect = "";
        });

        updateCursor();
    }

    function updateGroupNameVisibility() {
        if (!Chat.UI.pickerList || !Chat.UI.pickerNameWrap) return;
        const checked = Chat.UI.pickerList.querySelectorAll("input:checked");
        Chat.UI.pickerNameWrap.classList.toggle("hidden", checked.length <= 1);
    }

    // ===========================================
    // FIRESTORE HELPERS (defensive across SDK setups)
    // ===========================================

    function getFieldValue() {
        return window.firebase?.firestore?.FieldValue || null;
    }

    // Adds `value` to the array at `field` on `ref`, using an atomic
    // arrayUnion when available, falling back to a manual
    // read-modify-write so this still works if the compat FieldValue
    // helper isn't on the page.
    async function arrayUnionSafe(ref, field, value) {

        const FieldValue = getFieldValue();

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

    // ===========================================
    // PRESENCE / LAST SEEN
    // ===========================================

    function startPresenceHeartbeat() {

        markPresence();

        clearInterval(Chat.presenceHeartbeatInterval);
        Chat.presenceHeartbeatInterval = setInterval(markPresence, PRESENCE_HEARTBEAT_MS);

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") markPresence();
        });

        window.addEventListener("beforeunload", () => {
            // best-effort only — browsers don't guarantee this fires
            db.collection("users").doc(RelayDesk.currentUser)
                .set({ lastSeen: Date.now() }, { merge: true })
                .catch(() => {});
        });
    }

    function markPresence() {
        if (!RelayDesk.currentUser) return;

        db.collection("users").doc(RelayDesk.currentUser)
            .set({ lastSeen: Date.now() }, { merge: true })
            .catch(err => console.error("Presence update failed:", err));
    }

    // "Today 8:42 PM" / "Yesterday" / "3 days ago"
    function formatLastSeen(ts) {

        if (!ts) return "Offline";

        if (Date.now() - ts <= ONLINE_WINDOW_MS) return "Online";

        const then = new Date(ts);
        const now = new Date();

        const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);

        const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

        if (dayDiff <= 0) return `Last seen Today ${time}`;
        if (dayDiff === 1) return "Last seen Yesterday";
        return `Last seen ${dayDiff} days ago`;
    }

    function listenToLastSeen(otherCode) {

        if (Chat.lastSeenUnsub) Chat.lastSeenUnsub();

        if (!otherCode || !Chat.UI.lastSeen) return;

        Chat.lastSeenUnsub = db.collection("users").doc(otherCode)
            .onSnapshot(doc => {
                const data = doc.data() || {};
                if (Chat.UI.lastSeen) {
                    Chat.UI.lastSeen.textContent = formatLastSeen(data.lastSeen);
                }
            }, err => console.error("Last-seen listener failed:", err));
    }

    // ===========================================
    // TYPING INDICATOR
    // ===========================================

    function handleTypingInput() {

        if (!Chat.openChatId) return;

        const me = RelayDesk.currentUser;
        const now = Date.now();

        if (Chat.UI.input.value.trim().length === 0) {
            clearTypingFlag();
            return;
        }

        if (now - Chat.lastTypingSentAt > TYPING_WRITE_THROTTLE_MS) {
            Chat.lastTypingSentAt = now;
            db.collection("chats").doc(Chat.openChatId)
                .set({ typing: { [me]: now } }, { merge: true })
                .catch(() => {});
        }

        clearTimeout(Chat.typingClearTimer);
        Chat.typingClearTimer = setTimeout(clearTypingFlag, TYPING_CLEAR_AFTER_MS);
    }

    function clearTypingFlag() {

        clearTimeout(Chat.typingClearTimer);
        Chat.lastTypingSentAt = 0;

        if (!Chat.openChatId) return;

        db.collection("chats").doc(Chat.openChatId)
            .set({ typing: { [RelayDesk.currentUser]: null } }, { merge: true })
            .catch(() => {});
    }

    function updateTypingIndicatorDisplay() {

        if (!Chat.UI.typingIndicator || !Chat.openChatId) return;

        const c = Chat.chats[Chat.openChatId];
        const typing = c?.typing || {};
        const now = Date.now();

        const othersTyping = Object.keys(typing)
            .filter(code => code !== RelayDesk.currentUser)
            .filter(code => typing[code] && (now - typing[code]) < TYPING_STALE_MS);

        if (!othersTyping.length) {
            Chat.UI.typingIndicator.textContent = "";
            return;
        }

        const label = othersTyping.length === 1
            ? `${othersTyping[0]} is typing...`
            : `${othersTyping.join(", ")} are typing...`;

        Chat.UI.typingIndicator.textContent = label;
    }

    // ===========================================
    // COLLEAGUE LIST (for the "start chat" picker)
    // ===========================================

    function listenToColleagues() {

        if (Chat.colleaguesUnsub) Chat.colleaguesUnsub();

        Chat.colleaguesUnsub = db.collection("users").onSnapshot(snapshot => {

            const codes = [];

            snapshot.forEach(doc => {
                if (doc.id === RelayDesk.currentUser) return;
                if (doc.id === "A000") return;
                codes.push(doc.id);
            });

            Chat.colleagueCodes = codes;
        });
    }

    // ===========================================
    // NEW CHAT PICKER
    // ===========================================

    function openPicker() {

        if (!Chat.UI.pickerModal) return;

        Chat.UI.pickerList.innerHTML = Chat.colleagueCodes.length
            ? Chat.colleagueCodes.map(code => `
                <label class="chatPickerRow">
                    <input type="checkbox" value="${code}"> ${code}
                </label>
            `).join("")
            : `<div class="workspaceEmpty">No colleagues yet.</div>`;

        Chat.UI.pickerNameWrap.classList.add("hidden");
        Chat.UI.pickerName.value = "";

        Chat.UI.pickerModal.classList.remove("hidden");
    }

    function closePicker() {
        Chat.UI.pickerModal?.classList.add("hidden");
    }

    async function startChatFromPicker() {

        const checked = Array.from(Chat.UI.pickerList.querySelectorAll("input:checked"))
            .map(i => i.value);

        if (!checked.length) {
            alert("Select at least one colleague");
            return;
        }

        const members = [RelayDesk.currentUser, ...checked].sort();
        const isGroup = checked.length > 1;

        const chatId = isGroup
            ? `group_${Date.now()}_${RelayDesk.currentUser}`
            : members.join("__");

        try {

            const chatRef = db.collection("chats").doc(chatId);
            const existing = await chatRef.get();

            if (!existing.exists) {

                const name = isGroup
                    ? (Chat.UI.pickerName.value.trim() || `Group (${members.length})`)
                    : null;

                await chatRef.set({
                    id: chatId,
                    members,
                    type: isGroup ? "group" : "dm",
                    name,
                    createdBy: RelayDesk.currentUser,
                    createdAt: Date.now(),
                    lastMessage: "",
                    lastTime: Date.now(),
                    lastFrom: null,
                    lastMessageId: null,
                    typing: {}
                });
            }

            closePicker();
            openChat(chatId);

        } catch (err) {
            console.error("Start chat failed:", err);
        }
    }

    // ===========================================
    // CHAT LIST (live)
    // ===========================================

    function listenToChats() {

        if (Chat.chatsUnsub) Chat.chatsUnsub();

        Chat.chatsUnsub = db.collection("chats")
            .where("members", "array-contains", RelayDesk.currentUser)
            .onSnapshot(snapshot => {

                snapshot.docChanges().forEach(change => {

                    const id = change.doc.id;

                    // The chat doc itself was deleted (delete-for-everyone,
                    // possibly triggered by another member) — drop it
                    // locally and back out of it if it was open, instead
                    // of leaving a dangling Chat.chats[id] entry that
                    // would crash the next render.
                    if (change.type === "removed") {
                        delete Chat.chats[id];
                        if (Chat.openChatId === id) {
                            alert("This chat was deleted.");
                            closeChatWindow();
                        }
                        return;
                    }

                    const data = change.doc.data();

                    const previousLastTime = Chat.chats[id]?.lastTime || 0;
                    Chat.chats[id] = data;

                    const isNewIncoming =
                        data.lastTime &&
                        data.lastTime > previousLastTime &&
                        data.lastFrom &&
                        data.lastFrom !== RelayDesk.currentUser;

                    const muteWhileOpen = window.ESMSettings?.get("muteChatWhileOpen") !== false;
                    if (isNewIncoming && (Chat.openChatId !== id || !muteWhileOpen)) {
                        notifyIncomingChat(id, data);
                    }

                    // Mark the newest message "delivered" the moment our
                    // client sees it land in the chat list — this is what
                    // powers the grey double-check even before the chat
                    // is opened.
                    if (isNewIncoming && data.lastMessageId) {
                        arrayUnionSafe(
                            db.collection("chats").doc(id).collection("messages").doc(data.lastMessageId),
                            "deliveredTo",
                            RelayDesk.currentUser
                        ).catch(err => console.error("Delivery mark failed:", err));
                    }

                    if (Chat.openChatId === id) {
                        Chat.seenTimestamps[id] = data.lastTime || Date.now();
                        updateTypingIndicatorDisplay();
                    }
                });

                renderChatList();
            }, err => console.error("Chat list listener failed:", err));
    }

    function playChatPing() {
        try {
            const audio = new Audio("assets/chat.mp3");
            audio.play().catch(() => {});
        } catch (e) {}
    }

    // Phase 4: single entry point for an incoming chat message notification.
    // Desktop / Sound / Badge are each independently gated by
    // Settings > Notifications > Chat through NotificationManager.
    function notifyIncomingChat(chatId, data) {
        const c = Chat.chats[chatId] || {};
        const senderName = data.lastFrom || "Someone";
        const showPreview = window.ESMSettings?.get("showUnreadPreview") !== false;
        const preview = showPreview && data.lastMessage
            ? String(data.lastMessage).slice(0, 120)
            : "sent you a new message";

        window.NotificationManager?.notify(`${senderName}: ${preview}`, "info", {
            category: "chat",
            title: chatDisplayName(c) || "New message",
            tag: `chat-${chatId}`
        }) ?? playChatPing();
    }

    function renderChatList() {

        if (!Chat.UI.list) return;

        const me = RelayDesk.currentUser;

        // "Delete for me" doesn't touch the chat for other members —
        // it just stamps hiddenFor[me] with when I hid it. A chat stays
        // out of my list until a message arrives after that timestamp,
        // at which point it reappears on its own (same idea as
        // WhatsApp's "clear chat").
        const ids = Object.keys(Chat.chats)
            .filter(id => {
                const c = Chat.chats[id];
                const hiddenAt = c?.hiddenFor?.[me];
                if (!hiddenAt) return true;
                return (c.lastTime || 0) > hiddenAt;
            })
            .sort((a, b) =>
                (Chat.chats[b].lastTime || 0) - (Chat.chats[a].lastTime || 0)
            );

        if (!ids.length) {
            Chat.UI.list.innerHTML = `<div class="workspaceEmpty">No chats yet.</div>`;
            return;
        }

        Chat.UI.list.innerHTML = ids.map(id => {

            const c = Chat.chats[id];
            const label = chatDisplayName(c);

            const preview = c.lastMessage
                ? (c.lastMessage.length > 28 ? c.lastMessage.slice(0, 28) + "…" : c.lastMessage)
                : "No messages yet";

            const isUnread =
                c.lastFrom &&
                c.lastFrom !== RelayDesk.currentUser &&
                (Chat.seenTimestamps[id] || 0) < (c.lastTime || 0);

            return `
                <div class="chatListItem${Chat.openChatId === id ? " activeChat" : ""}${isUnread ? " unreadChat" : ""}"
                     onclick="RelayDesk.chat.open('${id}')">
                    <b>${c.type === "group" ? "👥 " : "👤 "}${label}</b>
                    <div class="chatPreview">${preview}</div>
                </div>
            `;
        }).join("");
    }

    function chatDisplayName(c) {
        if (c.type === "group") return c.name || "Group Chat";
        return (c.members || []).find(m => m !== RelayDesk.currentUser) || "Unknown";
    }

    // ===========================================
    // OPEN / CLOSE CHAT WINDOW
    // ===========================================

    function openChat(chatId) {

        Chat.openChatId = chatId;
        Chat.lastOpenedChatId = chatId;
        Chat.seenTimestamps[chatId] = Date.now();
        cancelReply();
        exitSelectMode();
        window.NotificationManager?.clearBadge("chat");

        const c = Chat.chats[chatId];

        if (Chat.UI.window) Chat.UI.window.classList.remove("hidden");
        if (Chat.UI.title) Chat.UI.title.textContent = c ? chatDisplayName(c) : chatId;

        // Last seen only makes sense 1:1
        if (c && c.type !== "group") {
            const other = (c.members || []).find(m => m !== RelayDesk.currentUser);
            listenToLastSeen(other);
        } else {
            if (Chat.lastSeenUnsub) Chat.lastSeenUnsub();
            if (Chat.UI.lastSeen) Chat.UI.lastSeen.textContent = "";
        }

        updateTypingIndicatorDisplay();
        clearInterval(Chat.typingDisplayInterval);
        Chat.typingDisplayInterval = setInterval(updateTypingIndicatorDisplay, 1000);

        if (Chat.messagesUnsub) Chat.messagesUnsub();

        Chat.messagesUnsub = db.collection("chats").doc(chatId)
            .collection("messages")
            .orderBy("time", "asc")
            .limitToLast(150)
            .onSnapshot(snapshot => {

                if (!Chat.UI.messages) return;

                Chat.lastMessagesSnapshotDocs = snapshot.docs;

                Chat.UI.messages.innerHTML = "";

                snapshot.docs.forEach(doc => {
                    Chat.UI.messages.appendChild(buildMessageBubble(chatId, doc, c));
                });

                reattachPendingMessages(chatId);

                if (window.ESMSettings?.get("autoScrollChat") !== false) {
                    Chat.UI.messages.scrollTop = Chat.UI.messages.scrollHeight;
                }

                if (Chat.chats[chatId]) {
                    Chat.seenTimestamps[chatId] = Chat.chats[chatId].lastTime || Date.now();
                }

                markVisibleMessagesRead(chatId, snapshot.docs);

            }, err => console.error("Chat messages listener failed:", err));

        renderChatList();
    }

    function closeChatWindow() {
        Chat.openChatId = null;
        cancelReply();
        exitSelectMode();

        if (Chat.messagesUnsub) Chat.messagesUnsub();
        if (Chat.lastSeenUnsub) Chat.lastSeenUnsub();
        clearInterval(Chat.typingDisplayInterval);
        clearTypingFlag();

        Chat.UI.window?.classList.add("hidden");
        renderChatList();
    }

    // ===========================================
    // KEYBOARD SHORTCUT (Ctrl+K) — reversible chat toggle
    // ===========================================
    // Bound from settings.js's global shortcut handler. Opens whichever
    // chat was last open (not a blank "New Chat" picker), so Ctrl+K
    // resumes the conversation you were just in. Pressing it again
    // closes that chat window — same reversible pattern as the Admin
    // Panel shortcut. Falls back to the New Chat picker if no chat has
    // been opened yet this session (nothing to resume).
    window.toggleChatShortcut = function () {

        if (Chat.openChatId) {
            closeChatWindow();
            return;
        }

        const pickerOpen = Chat.UI.pickerModal && !Chat.UI.pickerModal.classList.contains("hidden");
        if (pickerOpen) {
            closePicker();
            return;
        }

        if (Chat.lastOpenedChatId && Chat.chats[Chat.lastOpenedChatId]) {
            openChat(Chat.lastOpenedChatId);
            return;
        }

        openPicker();
    };

    // ===========================================
    // READ RECEIPTS
    // ===========================================

    // Called every time the open chat's messages re-render — marks
    // any message not from me, that I haven't already marked read,
    // as read (and implicitly delivered).
    function markVisibleMessagesRead(chatId, docs) {

        const me = RelayDesk.currentUser;

        docs.forEach(doc => {

            const m = doc.data();
            if (m.from === me) return;

            const readBy = m.readBy || [];
            if (readBy.includes(me)) return;

            const ref = doc.ref;

            Promise.all([
                arrayUnionSafe(ref, "readBy", me),
                arrayUnionSafe(ref, "deliveredTo", me)
            ]).catch(err => console.error("Read-receipt mark failed:", err));
        });
    }

    // Figures out the tick state for a message I sent.
    // "read" | "delivered" | "sent"
    function receiptStatus(m, chat) {

        const others = (chat?.members || []).filter(code => code !== RelayDesk.currentUser);
        if (!others.length) return "sent";

        const readBy = m.readBy || [];
        const deliveredTo = m.deliveredTo || [];

        const allRead = others.every(code => readBy.includes(code));
        const anyDelivered = others.some(code => deliveredTo.includes(code) || readBy.includes(code));

        if (allRead) return "read";
        if (anyDelivered) return "delivered";
        return "sent";
    }

    function receiptTicksHtml(status) {
        if (status === "read") return `<span class="chatTicks chatTicksRead">✓✓</span>`;
        if (status === "delivered") return `<span class="chatTicks">✓✓</span>`;
        return `<span class="chatTicks">✓</span>`;
    }

    // ===========================================
    // MESSAGE BUBBLE (render + wire up reply/react)
    // ===========================================

    function buildMessageBubble(chatId, doc, chat) {

        const m = doc.data();
        const mine = m.from === RelayDesk.currentUser;

        const selectable = Chat.selectMode && mine;

        const bubble = document.createElement("div");
        bubble.className = `chatBubble${mine ? " mine" : ""}` +
            `${Chat.selectMode ? " selectModeBubble" : ""}` +
            `${selectable ? " selectable" : ""}` +
            `${selectable && Chat.selectedIds.has(doc.id) ? " selected" : ""}`;
        bubble.dataset.msgId = doc.id;

        const replyBlock = m.replyTo ? `
            <div class="chatQuote" data-quote-target="${m.replyTo.id}">
                <div class="chatQuoteFrom">↪ ${escapeHtml(m.replyTo.from)}</div>
                <div class="chatQuoteText">${escapeHtml(truncate(m.replyTo.text, 80))}</div>
            </div>
        ` : "";

        // Image attachment (optional — absent on every pre-existing text
        // message, so this never affects old messages).
        const imageBlock = m.imageUrl ? `
            <img class="chatBubbleImage" src="${m.imageUrl}" alt="${escapeHtml(m.imageName || "image")}">
        ` : "";

        const reactions = m.reactions || {};
        const reactionChips = Object.keys(reactions)
            .filter(emoji => (reactions[emoji] || []).length > 0)
            .map(emoji => {
                const mineReacted = (reactions[emoji] || []).includes(RelayDesk.currentUser);
                return `
                    <button class="chatReactionChip${mineReacted ? " mine" : ""}" data-emoji="${emoji}" type="button">
                        ${emoji} ${reactions[emoji].length}
                    </button>
                `;
            }).join("");

        bubble.innerHTML = `
            ${selectable ? `
                <label class="chatBubbleSelectWrap">
                    <input type="checkbox" class="chatBubbleSelectCheckbox" ${Chat.selectedIds.has(doc.id) ? "checked" : ""}>
                </label>
            ` : ""}
            ${!mine ? `<div class="chatBubbleFrom">${escapeHtml(m.from)}</div>` : ""}
            ${replyBlock}
            ${imageBlock}
            ${m.text ? `<div class="chatBubbleText">${escapeHtml(m.text)}</div>` : ""}
            <div class="chatBubbleFooter">
                <span class="chatBubbleTime">${new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                ${m.edited ? `<span class="chatBubbleEditedTag">(edited)</span>` : ""}
                ${mine ? receiptTicksHtml(receiptStatus(m, chat)) : ""}
            </div>
            ${reactionChips ? `<div class="chatReactionRow">${reactionChips}</div>` : ""}
            <div class="chatBubbleActions">
                <button class="chatBubbleActionBtn chatReplyBtn" type="button" title="Reply">↪</button>
                <button class="chatBubbleActionBtn chatReactBtn" type="button" title="React">🙂</button>
                ${mine ? `<button class="chatBubbleActionBtn chatEditBtn" type="button" title="Edit">✏️</button>` : ""}
                ${mine ? `<button class="chatBubbleActionBtn chatDeleteBtn" type="button" title="Delete">🗑</button>` : ""}
            </div>
        `;

        // click a chat image to open it larger in the viewer
        const imageEl = bubble.querySelector(".chatBubbleImage");
        if (imageEl) {
            imageEl.addEventListener("click", () => openImageViewer(m.imageUrl, m.imageName));
        }

        // reply
        bubble.querySelector(".chatReplyBtn").addEventListener("click", () => {
            startReply({ id: doc.id, from: m.from, text: m.text });
        });

        // open reaction picker
        bubble.querySelector(".chatReactBtn").addEventListener("click", (e) => {
            openReactionPicker(chatId, doc.id, e.currentTarget);
        });

        // toggle a reaction by clicking an existing chip
        bubble.querySelectorAll(".chatReactionChip").forEach(chip => {
            chip.addEventListener("click", () => {
                toggleReaction(chatId, doc.id, chip.dataset.emoji);
            });
        });

        // delete (sender only — button only rendered when mine)
        const deleteBtn = bubble.querySelector(".chatDeleteBtn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => {
                deleteMessage(chatId, doc.id, m.imageUrl);
            });
        }

        // edit (sender only — button only rendered when mine)
        const editBtn = bubble.querySelector(".chatEditBtn");
        if (editBtn) {
            editBtn.addEventListener("click", () => {
                startEditMessage(chatId, doc.id, m.text);
            });
        }

        // select-mode checkbox (sender's own messages only)
        const selectCheckbox = bubble.querySelector(".chatBubbleSelectCheckbox");
        if (selectCheckbox) {
            selectCheckbox.addEventListener("change", () => {
                if (selectCheckbox.checked) Chat.selectedIds.add(doc.id);
                else Chat.selectedIds.delete(doc.id);
                bubble.classList.toggle("selected", selectCheckbox.checked);
                updateSelectBar();
            });
        }

        // clicking a quoted snippet jumps to the original message
        const quoteEl = bubble.querySelector("[data-quote-target]");
        if (quoteEl) {
            quoteEl.addEventListener("click", () => {
                const target = Chat.UI.messages.querySelector(
                    `[data-msg-id="${quoteEl.dataset.quoteTarget}"]`
                );
                target?.scrollIntoView({ behavior: "smooth", block: "center" });
                target?.classList.add("chatBubbleFlash");
                setTimeout(() => target?.classList.remove("chatBubbleFlash"), 1200);
            });
        }

        return bubble;
    }

    // Grows the message textarea to fit whatever the user is typing (up to
    // a max height defined in CSS, after which it scrolls internally) so
    // long messages stay fully visible while composing, WhatsApp-style.
    function autoGrowChatInput() {
        const el = Chat.UI.input;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
    }

    function truncate(text, max) {
        if (!text) return "";
        return text.length > max ? text.slice(0, max) + "…" : text;
    }

    // ===========================================
    // REPLY TO MESSAGE
    // ===========================================

    function startReply(target) {

        // mutually exclusive with an in-progress edit
        cancelEditMessage();

        Chat.replyingTo = target;

        if (Chat.UI.replyPreview) Chat.UI.replyPreview.classList.remove("hidden");
        if (Chat.UI.replyPreviewFrom) Chat.UI.replyPreviewFrom.textContent = target.from;
        if (Chat.UI.replyPreviewText) Chat.UI.replyPreviewText.textContent = truncate(target.text, 120);

        Chat.UI.input?.focus();
    }

    function cancelReply() {
        Chat.replyingTo = null;
        Chat.UI.replyPreview?.classList.add("hidden");
    }

    // ===========================================
    // EDIT MESSAGE
    // ===========================================
    //
    // Reuses the composer itself (same pattern as reply-quoting) rather
    // than an inline per-bubble textarea — the input box is repurposed
    // to hold the message's current text, and sendCurrentMessage() is
    // taught to branch into an update instead of a new message while
    // Chat.editingMessage is set.

    function startEditMessage(chatId, messageId, currentText) {

        // mutually exclusive with an in-progress reply
        cancelReply();

        Chat.editingMessage = { chatId, messageId };

        if (Chat.UI.editPreview) Chat.UI.editPreview.classList.remove("hidden");

        if (Chat.UI.input) {
            Chat.UI.input.value = currentText || "";
            Chat.UI.input.focus();
        }

        autoGrowChatInput();
    }

    function cancelEditMessage() {
        Chat.editingMessage = null;
        Chat.UI.editPreview?.classList.add("hidden");
        if (Chat.UI.input) Chat.UI.input.value = "";
        autoGrowChatInput();
    }

    function submitMessageEdit() {

        const newText = Chat.UI.input?.value.trim();
        const editing = Chat.editingMessage;

        if (!editing) return;

        // an empty edit is treated as "cancel", not "delete" — deleting
        // is its own explicit, confirmed action elsewhere
        if (!newText) {
            cancelEditMessage();
            return;
        }

        const { chatId, messageId } = editing;

        // optimistic: update the bubble on screen immediately instead of
        // waiting on the queue write + the next snapshot round-trip
        const bubbleText = Chat.UI.messages?.querySelector(`[data-msg-id="${messageId}"] .chatBubbleText`);
        if (bubbleText) bubbleText.textContent = newText;

        const bubbleFooter = Chat.UI.messages?.querySelector(`[data-msg-id="${messageId}"] .chatBubbleFooter`);
        if (bubbleFooter && !bubbleFooter.querySelector(".chatBubbleEditedTag")) {
            const tag = document.createElement("span");
            tag.className = "chatBubbleEditedTag";
            tag.textContent = "(edited)";
            bubbleFooter.appendChild(tag);
        }

        RelayDesk.queue.enqueue("EDIT_CHAT_MESSAGE", { chatId, messageId, newText });

        cancelEditMessage();
    }

    // ===========================================
    // MESSAGE REACTIONS
    // ===========================================

    function openReactionPicker(chatId, messageId, anchorEl) {

        closeReactionPicker();

        const picker = document.createElement("div");
        picker.id = "chatReactionPicker";
        picker.className = "chatReactionPicker";

        picker.innerHTML = REACTION_EMOJIS.map(emoji =>
            `<button type="button" class="chatReactionPickerEmoji" data-emoji="${emoji}">${emoji}</button>`
        ).join("");

        document.body.appendChild(picker);

        const rect = anchorEl.getBoundingClientRect();
        picker.style.position = "fixed";
        picker.style.top = `${rect.bottom + 4}px`;
        picker.style.left = `${Math.max(4, rect.left - 100)}px`;

        picker.querySelectorAll(".chatReactionPickerEmoji").forEach(btn => {
            btn.addEventListener("click", () => {
                toggleReaction(chatId, messageId, btn.dataset.emoji);
                closeReactionPicker();
            });
        });

        Chat.openReactionPickerFor = messageId;

        // close on outside click (deferred so this click doesn't close it immediately)
        setTimeout(() => {
            document.addEventListener("click", onOutsideReactionPickerClick);
        }, 0);
    }

    function onOutsideReactionPickerClick(e) {
        const picker = document.getElementById("chatReactionPicker");
        if (picker && !picker.contains(e.target)) closeReactionPicker();
    }

    function closeReactionPicker() {
        document.getElementById("chatReactionPicker")?.remove();
        document.removeEventListener("click", onOutsideReactionPickerClick);
        Chat.openReactionPickerFor = null;
    }

    async function toggleReaction(chatId, messageId, emoji) {

        const me = RelayDesk.currentUser;
        const ref = db.collection("chats").doc(chatId).collection("messages").doc(messageId);

        try {

            const doc = await ref.get();
            const data = doc.data() || {};
            const reactions = { ...(data.reactions || {}) };

            const alreadyHadThisEmoji = (reactions[emoji] || []).includes(me);

            // one reaction per person — clear me out of every emoji first
            Object.keys(reactions).forEach(key => {
                reactions[key] = (reactions[key] || []).filter(code => code !== me);
            });

            if (!alreadyHadThisEmoji) {
                reactions[emoji] = [...(reactions[emoji] || []), me];
            }

            await ref.set({ reactions }, { merge: true });

        } catch (err) {
            console.error("Reaction toggle failed:", err);
        }
    }

    // ===========================================
    // DELETE SINGLE MESSAGE (sender only)
    // ===========================================

    function deleteMessage(chatId, messageId, imageUrl) {

        if (!confirm(window.I18N ? window.I18N.t("chat.confirmDeleteMessage") : "Delete this message? This can't be undone.")) return;

        // optimistic: pull the bubble immediately instead of waiting on
        // the queue write + the next snapshot round-trip
        Chat.UI.messages?.querySelector(`[data-msg-id="${messageId}"]`)?.remove();
        Chat.selectedIds.delete(messageId);

        // imageUrl (only present on image messages) rides along so the
        // queue handler can also clean up the Storage object — Firestore
        // deletion alone would leave the uploaded file orphaned forever.
        RelayDesk.queue.enqueue("DELETE_CHAT_MESSAGE", { chatId, messageId, imageUrl });
    }

    // ===========================================
    // SELECT MODE (multi-select + bulk delete, sender's own messages only)
    // ===========================================

    function toggleSelectMode() {
        Chat.selectMode = !Chat.selectMode;
        Chat.selectedIds.clear();
        refreshOpenChatMessages();
        updateSelectBar();
    }

    function exitSelectMode() {
        Chat.selectMode = false;
        Chat.selectedIds.clear();
        refreshOpenChatMessages();
        updateSelectBar();
    }

    // Re-renders the currently open chat's bubbles from the last known
    // snapshot (no network round trip) — used to add/remove checkboxes
    // when select mode toggles, without waiting for Firestore.
    function refreshOpenChatMessages() {

        if (!Chat.openChatId || !Chat.UI.messages) return;

        const c = Chat.chats[Chat.openChatId];

        Chat.UI.messages.innerHTML = "";
        Chat.lastMessagesSnapshotDocs.forEach(doc => {
            Chat.UI.messages.appendChild(buildMessageBubble(Chat.openChatId, doc, c));
        });

        reattachPendingMessages(Chat.openChatId);
    }

    function selectAllMine() {

        if (!Chat.selectMode) return;

        Chat.lastMessagesSnapshotDocs.forEach(doc => {
            if (doc.data().from === RelayDesk.currentUser) Chat.selectedIds.add(doc.id);
        });

        refreshOpenChatMessages();
        updateSelectBar();
    }

    function deleteSelectedMessages() {

        if (!Chat.selectedIds.size) return;

        const count = Chat.selectedIds.size;
        if (!confirm(`Delete ${count} selected message${count > 1 ? "s" : ""}? This can't be undone.`)) return;

        const chatId = Chat.openChatId;

        Chat.selectedIds.forEach(messageId => {
            Chat.UI.messages?.querySelector(`[data-msg-id="${messageId}"]`)?.remove();

            const snapDoc = Chat.lastMessagesSnapshotDocs.find(d => d.id === messageId);
            const imageUrl = snapDoc?.data()?.imageUrl;

            RelayDesk.queue.enqueue("DELETE_CHAT_MESSAGE", { chatId, messageId, imageUrl });
        });

        Chat.selectedIds.clear();
        Chat.selectMode = false;
        updateSelectBar();
    }

    function updateSelectBar() {

        if (Chat.UI.selectBar) {
            Chat.UI.selectBar.classList.toggle("hidden", !Chat.selectMode);
        }

        if (Chat.UI.selectCount) {
            const n = Chat.selectedIds.size;
            Chat.UI.selectCount.textContent = `${n} selected`;
        }

        if (Chat.UI.selectBtn) {
            Chat.UI.selectBtn.classList.toggle("active", Chat.selectMode);
        }
    }

    // ===========================================
    // DELETE ENTIRE CHAT
    // "Delete for Me" — always available, hides the chat from just my
    //   own list (chats/{id}.hiddenFor[myCode] = timestamp). Nobody
    //   else's copy is touched.
    // "Delete for Everyone" — group chats only, creator or an
    //   Admin-permission user only. Permanently wipes the chat +
    //   every message for all members.
    // ===========================================

    function openDeleteChatModal() {

        if (!Chat.openChatId || !Chat.UI.deleteModal) return;

        const c = Chat.chats[Chat.openChatId];
        const canDeleteForEveryone = canFullyDeleteChat(c);

        if (Chat.UI.deleteModalText) {
            Chat.UI.deleteModalText.textContent = canDeleteForEveryone
                ? "Remove this chat from just your list, or delete it permanently for everyone?"
                : "This removes the chat from your list only. Other members keep their copy, and it'll come back if a new message arrives.";
        }

        Chat.UI.deleteForEveryoneBtn?.classList.toggle("hidden", !canDeleteForEveryone);
        Chat.UI.deleteModal.classList.remove("hidden");
    }

    function closeDeleteChatModal() {
        Chat.UI.deleteModal?.classList.add("hidden");
    }

    // Group chats only — the creator, or anyone with an Admin/Owner
    // permission level, can nuke the whole thing for every member.
    function canFullyDeleteChat(c) {

        if (!c || c.type !== "group") return false;

        const me = RelayDesk.currentUser;
        if (c.createdBy === me) return true;

        const level = RelayDesk.currentUserData?.permissionLevel;
        return level === "Admin" || level === "Owner";
    }

    function deleteChatForMe(chatId) {

        if (!chatId) return;

        const me = RelayDesk.currentUser;
        const hiddenAt = Date.now();

        RelayDesk.queue.enqueue("FIRESTORE_MERGE", {
            collection: "chats",
            docId: chatId,
            data: { hiddenFor: { [me]: hiddenAt } }
        });

        // optimistic: reflect the hide locally right away rather than
        // waiting on the queue write + snapshot round-trip
        if (Chat.chats[chatId]) {
            Chat.chats[chatId].hiddenFor = {
                ...(Chat.chats[chatId].hiddenFor || {}),
                [me]: hiddenAt
            };
        }

        if (Chat.openChatId === chatId) closeChatWindow();
        renderChatList();
    }

    function deleteChatForEveryone(chatId) {

        if (!chatId) return;

        RelayDesk.queue.enqueue("DELETE_CHAT", { chatId });

        delete Chat.chats[chatId];
        if (Chat.openChatId === chatId) closeChatWindow();
        renderChatList();
    }

    // ===========================================
    // SEND MESSAGE
    // ===========================================

    // ===========================================
    // IMAGE ATTACHMENTS (Telegram-style screenshot/image messages)
    // ===========================================
    //
    // One shared pipeline, three entry points:
    //   Ctrl+V paste (handleChatImagePaste) ─┐
    //   Drag & drop (bindImageDragDrop)      ├─► handleIncomingImageFile()
    //   File picker (attachBtn/imageFileInput) ┘        │
    //                                                    ▼
    //                                     preview bar (Send / Cancel)
    //                                                    │ Send
    //                                                    ▼
    //                                            sendPendingImage()
    //                                     uploadChatImage() -> Firebase
    //                                     Storage, then the download URL
    //                                     rides the exact same queued
    //                                     CHAT_MESSAGE write text
    //                                     messages already use.
    //
    // Firestore never sees image bytes — only { imageUrl, imageName }
    // alongside the normal message fields. Old text-only messages have
    // neither field, so every render path below treats them as optional.

    function handleChatImagePaste(e) {

        if (!Chat.openChatId) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                    // stop the browser from also pasting a filename/garbage
                    // text into the textarea alongside the image
                    e.preventDefault();
                    handleIncomingImageFile(file);
                }
                break;
            }
        }
    }

    // Drag & drop anywhere on the open chat window. Mirrors the
    // header-drag binding pattern in initChatWindowDrag() — bound once,
    // guarded by a dataset flag so re-running init() never double-binds.
    function bindImageDragDrop() {

        const zone = Chat.UI.window;
        if (!zone || zone.dataset.imgDropBound) return;
        zone.dataset.imgDropBound = "1";

        ["dragenter", "dragover"].forEach(evt => {
            zone.addEventListener(evt, (e) => {
                if (!Chat.openChatId || !e.dataTransfer?.types?.includes("Files")) return;
                e.preventDefault();
                zone.classList.add("chatDropActive");
            });
        });

        ["dragleave", "dragend"].forEach(evt => {
            zone.addEventListener(evt, () => zone.classList.remove("chatDropActive"));
        });

        zone.addEventListener("drop", (e) => {
            if (!Chat.openChatId || !e.dataTransfer?.files?.length) return;
            e.preventDefault();
            zone.classList.remove("chatDropActive");

            const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
            if (file) handleIncomingImageFile(file);
        });
    }

    // Shared entry point for all three sources above — validates the
    // file and hands it to the preview bar. Nothing is uploaded yet.
    function handleIncomingImageFile(file) {

        if (!file || !Chat.openChatId) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            alert("Unsupported image type. Please use PNG, JPG, GIF or WEBP.");
            return;
        }

        if (file.size > MAX_IMAGE_BYTES) {
            alert("Image is too large (max 8MB).");
            return;
        }

        // a reply or an in-progress edit doesn't make sense alongside
        // attaching a fresh image — same mutual-exclusion the edit bar
        // already applies to the reply bar
        cancelReply();
        cancelEditMessage();

        if (Chat.pendingImagePreviewUrl) URL.revokeObjectURL(Chat.pendingImagePreviewUrl);

        Chat.pendingImageFile = file;
        Chat.pendingImagePreviewUrl = URL.createObjectURL(file);

        if (Chat.UI.imagePreviewThumb) Chat.UI.imagePreviewThumb.src = Chat.pendingImagePreviewUrl;
        Chat.UI.imagePreviewBar?.classList.remove("hidden");
        Chat.UI.imageCaptionInput?.focus();
    }

    // Hides/resets the composer bar. Deliberately does NOT revoke
    // pendingImagePreviewUrl — sendPendingImage() still needs it for the
    // optimistic bubble and revokes it itself once the upload settles.
    function hideImageComposer() {
        Chat.pendingImageFile = null;
        if (Chat.UI.imageCaptionInput) Chat.UI.imageCaptionInput.value = "";
        Chat.UI.imagePreviewBar?.classList.add("hidden");
        if (Chat.UI.imageFileInput) Chat.UI.imageFileInput.value = "";
    }

    // Cancel button — nothing gets uploaded.
    function cancelPendingImage() {
        if (Chat.pendingImagePreviewUrl) URL.revokeObjectURL(Chat.pendingImagePreviewUrl);
        Chat.pendingImagePreviewUrl = null;
        hideImageComposer();
    }

    // Uploads a File to Firebase Storage under a path keyed by the
    // message's own (locally pre-generated) id, then resolves with its
    // public download URL — the only thing that ever reaches Firestore.
    function uploadChatImage(chatId, messageId, file) {

        const nameExt = file.name && file.name.includes(".") ? file.name.split(".").pop() : null;
        const ext = (nameExt || file.type.split("/")[1] || "png").toLowerCase();

        const ref = window.storage.ref(`chatImages/${chatId}/${messageId}.${ext}`);

        return ref.put(file).then(snapshot => snapshot.ref.getDownloadURL());
    }

    async function sendPendingImage() {

        const file = Chat.pendingImageFile;
        const chatId = Chat.openChatId;
        if (!file || !chatId) return;

        const caption = Chat.UI.imageCaptionInput?.value.trim() || "";
        const localPreviewUrl = Chat.pendingImagePreviewUrl;

        // clears the composer bar immediately; localPreviewUrl stays
        // alive below for the optimistic bubble
        hideImageComposer();

        const now = Date.now();
        const messagesRef = db.collection("chats").doc(chatId).collection("messages");
        const messageId = RelayDesk.queue.newFirestoreId(messagesRef);

        // Optimistic bubble, same idea as text's renderOptimisticMessage —
        // shows the local (not-yet-uploaded) image right away so Send
        // feels instant even on a slow connection.
        renderOptimisticMessage(chatId, messageId, {
            from: RelayDesk.currentUser,
            text: caption,
            time: now,
            imageUrl: localPreviewUrl
        });

        try {

            const downloadUrl = await uploadChatImage(chatId, messageId, file);

            const message = {
                from: RelayDesk.currentUser,
                text: caption,
                time: now,
                deliveredTo: [],
                readBy: [],
                reactions: {},
                replyTo: null,
                imageUrl: downloadUrl,
                imageName: file.name || null
            };

            // same offline-safe queued write text messages use — a retry
            // re-writes this exact doc id instead of duplicating it
            RelayDesk.queue.enqueue("CHAT_MESSAGE", {
                chatId,
                messageId,
                message,
                chatMeta: {
                    lastMessage: caption ? `📷 ${caption}` : "📷 Photo",
                    lastTime: now,
                    lastFrom: RelayDesk.currentUser,
                    lastMessageId: messageId
                }
            });

        } catch (err) {
            console.error("Chat image upload failed:", err);
            alert("Image upload failed. Please try again.");
            // drop the optimistic bubble so a failed upload doesn't leave
            // a phantom message stuck on screen
            Chat.UI.messages?.querySelector(`[data-msg-id="${messageId}"]`)?.remove();
        } finally {
            // give the real-time listener a moment to rebuild the message
            // list with the uploaded URL before freeing the local blob
            setTimeout(() => URL.revokeObjectURL(localPreviewUrl), 15000);
        }
    }

    function openImageViewer(url, name) {
        if (!Chat.UI.imageViewerModal) return;
        if (Chat.UI.imageViewerImg) {
            Chat.UI.imageViewerImg.classList.remove("zoomed");
            Chat.UI.imageViewerImg.src = url;
        }
        if (Chat.UI.imageViewerDownload) {
            Chat.UI.imageViewerDownload.href = url;
            Chat.UI.imageViewerDownload.download = name || "image";
        }
        Chat.UI.imageViewerModal.classList.remove("hidden");
    }

    function closeImageViewer() {
        Chat.UI.imageViewerModal?.classList.add("hidden");
        if (Chat.UI.imageViewerImg) Chat.UI.imageViewerImg.src = "";
    }

    function sendCurrentMessage() {

        if (Chat.editingMessage) {
            submitMessageEdit();
            return;
        }

        const text = Chat.UI.input?.value.trim();
        if (!text || !Chat.openChatId) return;

        Chat.UI.input.value = "";
        autoGrowChatInput();
        clearTypingFlag();

        const chatId = Chat.openChatId;
        const now = Date.now();
        const replyTo = Chat.replyingTo;
        cancelReply();

        // Generate the message's Firestore doc id locally — the SDK can
        // mint one without a network round trip, and using it up front
        // means a retry after a dropped connection re-writes the exact
        // same doc instead of creating a duplicate message.
        const messagesRef = db.collection("chats").doc(chatId).collection("messages");
        const messageId = RelayDesk.queue.newFirestoreId(messagesRef);

        const message = {
            from: RelayDesk.currentUser,
            text,
            time: now,
            deliveredTo: [],
            readBy: [],
            reactions: {},
            replyTo: replyTo ? { id: replyTo.id, from: replyTo.from, text: replyTo.text } : null
        };

        // ---- optimistic local render (works fully offline) ----
        // Marked pending; the live onSnapshot listener will quietly
        // reconcile this into a normal bubble once the write lands
        // (same doc id, so no duplicate appears).
        renderOptimisticMessage(chatId, messageId, message);

        // ---- queue the actual write for whenever we're online ----
        RelayDesk.queue.enqueue("CHAT_MESSAGE", {
            chatId,
            messageId,
            message,
            chatMeta: {
                lastMessage: text,
                lastTime: now,
                lastFrom: RelayDesk.currentUser,
                lastMessageId: messageId
            }
        });
    }

    // Called after every snapshot rebuild. The rebuild only knows about
    // messages Firestore has actually confirmed, so any message still
    // sitting in the local activity queue (not yet synced) needs to be
    // re-appended or it would flash away the moment any other message
    // arrives in this chat.
    function reattachPendingMessages(chatId) {

        const pending = (RelayDesk.queue?.items || []).filter(i =>
            i.type === "CHAT_MESSAGE" && i.payload?.chatId === chatId
        );

        pending.forEach(i => renderOptimisticMessage(chatId, i.payload.messageId, i.payload.message));
    }

    // Lightweight optimistic bubble — reuses whatever bubble-rendering
    // the live message listener already does if available, otherwise
    // appends a minimal placeholder. Tagged with data-msg-id so the
    // real-time listener can recognize it's already on screen.
    function renderOptimisticMessage(chatId, messageId, message) {

        if (chatId !== Chat.openChatId || !Chat.UI.messages) return;
        if (Chat.UI.messages.querySelector(`[data-msg-id="${messageId}"]`)) return;

        const bubble = document.createElement("div");
        bubble.className = "chatBubble mine chatBubblePending";
        bubble.dataset.msgId = messageId;

        const imageBlock = message.imageUrl ? `<img class="chatBubbleImage" src="${message.imageUrl}" alt="">` : "";
        const textBlock = message.text ? `<div class="chatBubbleText">${escapeHtml(message.text)}</div>` : "";

        bubble.innerHTML = `
            ${imageBlock}
            ${textBlock}
            <div class="chatBubbleFooter"><span class="chatTicks">⏳ ${message.imageUrl ? "uploading…" : "sending…"}</span></div>
        `;

        Chat.UI.messages.appendChild(bubble);
        Chat.UI.messages.scrollTop = Chat.UI.messages.scrollHeight;
    }

    // ===========================================
    // CHAT SEARCH
    // ===========================================
    //
    // No full-text index available client-side, so this does a
    // best-effort scan: pull the most recent N messages from every
    // chat the employee is part of and filter by substring match.
    // Fine for a small team's message volume; not meant to scale to
    // years of history.

    function openSearch() {
        Chat.UI.searchModal?.classList.remove("hidden");
        Chat.UI.searchInput?.focus();
    }

    function closeSearch() {
        Chat.UI.searchModal?.classList.add("hidden");
        if (Chat.UI.searchInput) Chat.UI.searchInput.value = "";
        if (Chat.UI.searchResults) Chat.UI.searchResults.innerHTML = "";
    }

    async function runSearch() {

        const query = Chat.UI.searchInput?.value.trim().toLowerCase();

        if (!Chat.UI.searchResults) return;

        if (!query || query.length < 2) {
            Chat.UI.searchResults.innerHTML = "";
            return;
        }

        Chat.UI.searchResults.innerHTML = `<div class="workspaceEmpty">Searching…</div>`;

        const chatIds = Object.keys(Chat.chats);

        try {

            const perChatResults = await Promise.all(chatIds.map(async id => {

                const snap = await db.collection("chats").doc(id)
                    .collection("messages")
                    .orderBy("time", "desc")
                    .limit(SEARCH_PER_CHAT_LIMIT)
                    .get();

                const matches = [];

                snap.forEach(doc => {
                    const m = doc.data();
                    if (m.text && m.text.toLowerCase().includes(query)) {
                        matches.push({ chatId: id, id: doc.id, ...m });
                    }
                });

                return matches;
            }));

            const results = perChatResults
                .flat()
                .sort((a, b) => b.time - a.time)
                .slice(0, SEARCH_RESULT_LIMIT);

            renderSearchResults(results, query);

        } catch (err) {
            console.error("Chat search failed:", err);
            Chat.UI.searchResults.innerHTML = `<div class="workspaceEmpty">Search failed.</div>`;
        }
    }

    function renderSearchResults(results, query) {

        if (!Chat.UI.searchResults) return;

        Chat.UI.searchResults.innerHTML = "";

        if (!results.length) {
            Chat.UI.searchResults.innerHTML = `<div class="workspaceEmpty">No matches.</div>`;
            return;
        }

        results.forEach(r => {

            const c = Chat.chats[r.chatId];
            const label = c ? chatDisplayName(c) : r.chatId;

            const row = document.createElement("div");
            row.className = "chatSearchResultRow";
            row.innerHTML = `
                <div class="chatSearchResultChat">${escapeHtml(label)}</div>
                <div class="chatSearchResultSnippet">${highlightMatch(r.text, query)}</div>
                <div class="chatSearchResultTime">${new Date(r.time).toLocaleString()}</div>
            `;

            row.addEventListener("click", () => {
                closeSearch();
                openChat(r.chatId);
                setTimeout(() => {
                    const target = Chat.UI.messages?.querySelector(`[data-msg-id="${r.id}"]`);
                    target?.scrollIntoView({ behavior: "smooth", block: "center" });
                    target?.classList.add("chatBubbleFlash");
                    setTimeout(() => target?.classList.remove("chatBubbleFlash"), 1200);
                }, 400);
            });

            Chat.UI.searchResults.appendChild(row);
        });
    }

    function highlightMatch(text, query) {

        const safe = escapeHtml(text || "");
        const safeQuery = escapeHtml(query || "");

        if (!safeQuery) return safe;

        const idx = safe.toLowerCase().indexOf(safeQuery.toLowerCase());
        if (idx === -1) return safe;

        return safe.slice(0, idx) +
            `<mark>${safe.slice(idx, idx + safeQuery.length)}</mark>` +
            safe.slice(idx + safeQuery.length);
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    Chat.open = openChat;

})();
