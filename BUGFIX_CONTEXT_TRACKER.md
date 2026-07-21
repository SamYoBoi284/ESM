# BUGFIX / Feature Context Tracker

No prior tracker file existed in this project — created fresh with this entry.

---

## Feature: Chat Image / Screenshot Support (Telegram-style)

### Summary
Added image messages to the existing DM/group chat system (`chat.js`).
Users can now attach an image three ways — Ctrl+V paste (e.g. a Windows
Snipping Tool screenshot), drag & drop onto the open chat window, or the
new 📎 file picker button — all funneling into **one shared upload
pipeline**. Before sending, a preview bar shows the image with an
optional caption field and Send/Cancel buttons; Cancel uploads nothing.
Sent images render inline in the conversation (image-only or
image+caption) and can be clicked to open a lightbox viewer with
click-to-zoom and a Download link. Images can be deleted the same way
text messages already could — the existing per-message and bulk-select
delete buttons now also remove the file from Storage, not just the
Firestore doc.

Text messaging is completely unaffected — every field this feature adds
(`imageUrl`, `imageName`) is optional, and old messages simply don't
have them.

### Files modified
- **`chat.js`** — new "IMAGE ATTACHMENTS" section (paste/drop/file-picker
  entry points → `handleIncomingImageFile()` → preview bar →
  `sendPendingImage()` → `uploadChatImage()` → queued `CHAT_MESSAGE`
  write); `buildMessageBubble()` and `renderOptimisticMessage()` now
  render an optional image; `deleteMessage()` / `deleteSelectedMessages()`
  now pass `imageUrl` through so Storage gets cleaned up too;
  `cacheUI()` / `ensureExtraUI()` / `cacheExtraUI()` / `bindExtraUI()`
  extended for the new attach button, preview bar, and viewer modal.
- **`queue.js`** — `DELETE_CHAT_MESSAGE` handler now also deletes the
  associated Storage object (best-effort, non-fatal) when the payload
  includes an `imageUrl`. `CHAT_MESSAGE` handler untouched — it already
  writes whatever's in the `message` object generically, so the new
  `imageUrl`/`imageName` fields needed no handler change.
- **`firebase.js`** — added `window.storage = firebase.storage()` next
  to the existing `window.db` init.
- **`index.html`** — added the `firebase-storage-compat.js` SDK script
  tag; added the 📎 attach button + hidden file input to the chat input
  row.
- **`style.css`** — new styles: attach button, image preview bar,
  chat-window drag-drop highlight, inline image bubble, and the
  fullscreen image viewer/lightbox.
- **`firebase.json`** — registered `storage.rules`.
- **`storage.rules`** *(new file)* — Storage security rules, scoped to
  `chatImages/{chatId}/{fileName}`. Mirrors `firestore.rules`'s
  reasoning: this app has no Firebase Auth layer (custom employee-code +
  PIN login), so it's open and time-boxed the same way as the Firestore
  catch-all — tighten alongside a real auth solution if/when one lands.

### Architecture notes
- **Storage path:** `chatImages/{chatId}/{messageId}.{ext}` — keyed by
  the same client-generated message id text messages already use
  (`RelayDesk.queue.newFirestoreId`), so the Storage object and its
  Firestore doc are always paired 1:1.
- **Firestore shape:** unchanged. A message doc optionally gains
  `imageUrl` (Storage download URL) and `imageName` (original filename,
  for the download link). No new collection, no schema migration.
- **Upload happens outside the offline queue.** The queue persists
  payloads to `localStorage`, which can't hold a `File`/blob — so the
  image is uploaded to Storage *first* (getting a plain URL string),
  and only that URL is queued as part of the normal `CHAT_MESSAGE`
  payload. This keeps the queue's existing retry/dedupe logic (pre-
  generated doc id, idempotent `.set()`) working unmodified for image
  messages.
- **Optimistic UI:** the image bubble appears immediately using a local
  `URL.createObjectURL()` preview while the upload runs in the
  background, mirroring the existing text-message optimistic-render
  pattern. The blob URL is revoked ~15s later (enough time for the
  real-time listener to rebuild the message list with the real
  Storage URL); a failed upload removes the optimistic bubble instead
  of leaving a phantom message.
- **Delete cleans up Storage.** `imageUrl` now rides along inside the
  `DELETE_CHAT_MESSAGE` queue payload so Storage cleanup happens in the
  same offline-safe, retryable flow as the Firestore delete. Storage
  cleanup is best-effort (wrapped in try/catch) so it can never block or
  duplicate the Firestore delete itself.
- **No Electron main-process changes needed.** Unlike the existing
  clipboard *text*-read IPC bridge (`electron/main.js`/`preload.js`,
  used for reliability with `navigator.clipboard.readText()`), the
  standard DOM `paste` event with `clipboardData.items` works natively
  in Electron's Chromium renderer for image data — no IPC round trip
  required.

### Remaining TODOs / known limitations
- **"Delete chat" (whole chat, for everyone/for me)** does not sweep
  the chat's `chatImages/{chatId}/` Storage folder — only per-message
  delete does. Left out of scope for this pass; would need
  `listAll()` + bulk delete on that prefix.
- No client-side image compression/resizing before upload — a full-res
  screenshot uploads as-is (capped at 8MB, checked client-side).
- No multi-image-at-once send (one image per outgoing message, same as
  Telegram's single-paste behavior); a caption can still accompany it.
- Storage rules are open (time-boxed to match `firestore.rules`) since
  this app has no Firebase Auth — same caveat already logged in
  `firestore.rules`, not something this feature introduces.
