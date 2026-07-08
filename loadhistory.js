// ===========================================
// RelayDesk
// loadhistory.js (NEW FILE)
// Permanent, searchable, cross-shift Load History.
// ===========================================
//
// Does NOT touch the existing live Booked Loads flow
// (workspace.js saveLoad/editLoad/deleteLoad, queue.js's ADD_LOAD/
// EDIT_LOAD/DELETE_LOAD handlers) — this is a separate, additive
// system that sits on top of the same shiftHistory/loadsLog data.
//
// Firestore additions (new collections only, nothing existing is
// restructured):
//
//   loadVridIndex/{normalizedVrid} -> { vrid, loadId, uid, shiftId,
//                                        reservedAt }
//     Tiny uniqueness ledger so two loads can never share a VRID.
//     Never read for display.
//
//   loadChangeNotifications/{id} -> { ownerUid, editorUid, loadId,
//                                      vrid, before, after, reason,
//                                      time, acknowledged }
//     One doc per cross-employee edit, shown as a dismissible card
//     on the original booker's dashboard until acknowledged.
//
// Load fields added (all optional/backward compatible — a load with
// none of these behaves exactly as it always has):
//   status            "Booked" (default/implicit) | "Cancelled" |
//                      "Needs Dispute" | "Disputed - Paid" |
//                      "Disputed - Unpaid" | "Needs Appeal"
//   vridBackfilled    true if `vrid` was auto-generated for a legacy
//                      load that never had one (display-only flag)


// ===========================================
// DISPUTE WORKFLOW STATES
// ===========================================

window.LOAD_STATUSES = [
    "Booked",
    "Cancelled",
    "Needs Dispute",
    "Disputed - Paid",
    "Disputed - Unpaid",
    "Needs Appeal"
];

// Allowed forward moves from each status. Load History's status
// dropdown only ever offers the current status (no-op) plus these.
window.LOAD_STATUS_TRANSITIONS = {
    // "Needs Dispute" is reachable directly from "Booked" too, so a
    // $0 cancellation can be recorded in a single edit instead of
    // forcing Booked -> Cancelled -> (reopen) -> Needs Dispute.
    "Booked":            ["Cancelled", "Needs Dispute"],
    "Cancelled":         ["Needs Dispute"],
    "Needs Dispute":     ["Disputed - Paid", "Disputed - Unpaid"],
    "Disputed - Paid":   [],
    "Disputed - Unpaid": ["Needs Appeal"],
    "Needs Appeal":      ["Disputed - Paid"]
};


// ===========================================
// VRID UNIQUENESS (used by workspace.js's Add/Edit Load modal too)
// ===========================================

window.normalizeVridKey = function (vrid) {
    return encodeURIComponent(String(vrid).trim().toUpperCase()).replace(/[.%]/g, "_");
};

// Returns true if the VRID was successfully reserved (i.e. it was
// free), false if it's already taken by another load.
window.reserveVrid = async function (vrid, meta = {}) {
    const key = window.normalizeVridKey(vrid);
    const ref = db.collection("loadVridIndex").doc(key);
    const existing = await ref.get();
    if (existing.exists) return false;
    await ref.set({ vrid: String(vrid).trim(), ...meta, reservedAt: Date.now() });
    return true;
};

// Called when a load's VRID changes or the load is deleted, so the
// old value becomes available again. Best-effort — a failure here
// just means an old VRID stays reserved, never a data-loss risk.
window.releaseVrid = async function (vrid) {
    if (!vrid) return;
    try {
        await db.collection("loadVridIndex").doc(window.normalizeVridKey(vrid)).delete();
    } catch (e) {
        console.warn("releaseVrid failed:", e);
    }
};


(function () {

    let initialized = false;
    let editingContext = null; // { load, shiftId, owner }
    let unsubscribeLoadsListener = null; // live shiftHistory listener, active only while the modal is open
    const UI = {};

    // Tracks which loadChangeNotifications doc IDs have already either
    // (a) been seen in the very first snapshot on page load (backlog —
    // card only, no toast) or (b) already triggered a toast — so a
    // snapshot re-fire (e.g. from renderNotifications' own re-render)
    // never toasts the same notification twice.
    const notifState = {
        firstSnapshot: true,
        seenIds: new Set()
    };

    window.initializeLoadHistory = function () {

        if (initialized) return;
        initialized = true;

        UI.openBtnDash   = document.getElementById("loadHistoryBtn");
        UI.openBtnAdmin  = document.getElementById("adminLoadHistoryBtn");
        UI.searchOverlay = document.getElementById("loadHistoryModal");
        UI.closeBtn      = document.getElementById("loadHistoryCloseBtn");
        UI.searchInput   = document.getElementById("loadHistorySearchInput");
        UI.searchBtn     = document.getElementById("loadHistorySearchBtn");
        UI.results       = document.getElementById("loadHistoryResults");

        UI.editOverlay      = document.getElementById("loadHistoryEditModal");
        UI.editVrid          = document.getElementById("lhEditVrid");
        UI.editMeta          = document.getElementById("lhEditMeta");
        UI.editStatus        = document.getElementById("lhEditStatus");
        UI.editPrice         = document.getElementById("lhEditPrice");
        UI.editNote          = document.getElementById("lhEditNote");
        UI.editReason        = document.getElementById("lhEditReason");
        UI.editReasonHint    = document.getElementById("lhReasonRequiredHint");
        UI.editReasonError   = document.getElementById("lhEditReasonError");
        UI.editSaveBtn       = document.getElementById("lhEditSaveBtn");
        UI.editCancelBtn     = document.getElementById("lhEditCancelBtn");

        UI.notifications = document.getElementById("loadChangeNotifications");

        [UI.openBtnDash, UI.openBtnAdmin].forEach(btn => {
            if (btn) btn.onclick = openSearch;
        });

        if (UI.closeBtn) UI.closeBtn.onclick = () => {
            UI.searchOverlay?.classList.add("hidden");
            detachLoadsListener();
        };
        if (UI.searchBtn) UI.searchBtn.onclick = runSearch;

        UI.searchInput?.addEventListener("keydown", e => {
            if (e.key === "Enter") runSearch();
        });
        UI.searchInput?.addEventListener("input", runSearch);

        UI.editStatus?.addEventListener("change", updateEditFormForStatus);
        UI.editSaveBtn?.addEventListener("click", submitHistoricalEdit);
        UI.editCancelBtn?.addEventListener("click", () => {
            UI.editOverlay?.classList.add("hidden");
            editingContext = null;
        });

        listenForNotifications();

        console.log("📜 Load History module ready");
    };

    // In-memory cache of every searchable load, loaded fresh each time
    // the modal opens. The search box filters THIS array client-side —
    // it does not re-query Firestore per keystroke.
    let allLoads = [];

    function openSearch() {

        if (!window.hasPermission?.("canEditLoads") && !window.hasAdminAccess?.()) {
            alert("You don't have permission to view Load History.");
            return;
        }

        if (!UI.searchOverlay) return;
        if (UI.searchInput) UI.searchInput.value = "";
        UI.searchOverlay.classList.remove("hidden");
        UI.searchInput?.focus();

        attachLoadsListener();
    }

    // ===========================================
    // DATASET — a LIVE onSnapshot() listener on the ENTIRE shiftHistory
    // collection (this is a permanent, cross-shift ledger by design,
    // not scoped to any date window). Attached the moment the modal
    // opens, detached the moment it closes — so a load added on an
    // active shift, or archived at End Shift, shows up here instantly
    // without needing to close/reopen the modal. Any load found
    // without a VRID gets one generated and permanently saved right
    // here, once, so it's searchable from then on — existing data is
    // never deleted or reshaped, only this one field is filled in
    // when it was missing.
    //
    // NOTE: an earlier version of this fetched the collection with a
    // one-time .get() — that's why new loads never showed up without
    // a full page reload. This replaces that with a real listener.
    // ===========================================

    let loadsSnapshotSeq = 0; // guards against out-of-order snapshot processing below

    function attachLoadsListener() {

        if (UI.results) UI.results.innerHTML = `<div class="workspaceEmpty">Loading loads...</div>`;

        detachLoadsListener(); // never let two listeners stack

        unsubscribeLoadsListener = db.collection("shiftHistory").onSnapshot(async snap => {

            // Firestore typically fires this callback twice on attach
            // (once from local cache, once from the server). Both
            // branches await backfill writes, so they can resolve out
            // of order — without this guard, a slower cache-based pass
            // finishing AFTER a faster server-based pass could stomp
            // fresh data with stale data, which looks like the list
            // "not reacting" or randomly reverting.
            const seq = ++loadsSnapshotSeq;

            console.log(`📜 Load History: shiftHistory snapshot — ${snap.size} shift doc(s)`);

            try {
                const processed = await processShiftHistorySnapshot(snap);
                if (seq !== loadsSnapshotSeq) return; // a newer snapshot already landed
                allLoads = processed;
                console.log(`📜 Load History: ${allLoads.length} searchable load(s) after processing`);
                runSearch(); // re-apply whatever's currently typed, if anything
            } catch (err) {
                console.error("Load History: failed to process live update:", err);
                if (UI.results) UI.results.innerHTML = `<div class="workspaceEmpty">Failed to load — ${escapeLH(err.message || "unknown error")}</div>`;
            }

        }, err => {
            // Surfacing err.message here on purpose — "Missing or
            // insufficient permissions" is the #1 cause of this listener
            // silently coming up empty, and it's otherwise invisible
            // unless someone happens to have DevTools open.
            console.error("Load History: live listener failed:", err);
            if (UI.results) UI.results.innerHTML = `<div class="workspaceEmpty">Failed to load — ${escapeLH(err.message || err.code || "unknown error")}</div>`;
        });
    }

    function detachLoadsListener() {
        if (unsubscribeLoadsListener) {
            unsubscribeLoadsListener();
            unsubscribeLoadsListener = null;
        }
    }

    async function processShiftHistorySnapshot(snap) {

        const out = [];

        for (const doc of snap.docs) {

            const shiftData = doc.data();
            const loadsLog = Array.isArray(shiftData.loadsLog) ? shiftData.loadsLog : [];
            if (!loadsLog.length) continue;

            const { patched, changed } = backfillVrids(loadsLog);

            if (changed) {
                try {
                    await doc.ref.set({ loadsLog: patched }, { merge: true });
                } catch (e) {
                    console.warn("Load History: VRID backfill write failed:", e);
                }
            }

            patched.forEach(l => {
                if (l.active === false) return; // deleted loads stay out of search
                out.push({ load: l, shiftId: doc.id, owner: shiftData.user || l.bookedBy || null });
            });
        }

        return out;
    }

    // ===========================================
    // FILTER — pure client-side filter over the already-loaded
    // dataset. No Firestore round trip per keystroke.
    // ===========================================

    function runSearch() {

        const raw = (UI.searchInput?.value || "").trim();

        if (!raw) {
            renderResults(allLoads);
            return;
        }

        const needle = raw.toUpperCase();

        const filtered = allLoads.filter(m =>
            String(m.load.vrid || "").toUpperCase().includes(needle)
        );

        renderResults(filtered, needle);
    }

    function backfillVrids(loadsLog) {

        let changed = false;

        const patched = loadsLog.map(l => {
            if (l.vrid && String(l.vrid).trim()) return l;
            changed = true;
            return { ...l, vrid: generateFallbackVrid(l), vridBackfilled: true };
        });

        return { patched, changed };
    }

    // Deterministic, readable fallback ID for a legacy load that
    // never had a VRID. Derived from the load's existing permanent
    // internal id, so it's always unique and always the same if a
    // future pass ever re-derives it (it won't need to — it's saved
    // permanently the first time).
    function generateFallbackVrid(load) {
        const base = String(load.id ?? Date.now());
        let hash = 0;
        for (let i = 0; i < base.length; i++) {
            hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
        }
        return "LEG-" + hash.toString(36).toUpperCase().slice(0, 8);
    }

    function renderResults(matches, needle) {

        if (!UI.results) return;

        if (!matches.length) {
            UI.results.innerHTML = needle
                ? `<div class="workspaceEmpty">No matching loads found for "${escapeLH(needle)}".</div>`
                : `<div class="workspaceEmpty">No loads found.</div>`;
            return;
        }

        UI.results.innerHTML = matches.map((m, i) => {
            const l = m.load;
            return `
                <div class="loadHistoryResultCard">
                    <div><b>🔢 ${escapeLH(l.vrid)}</b> ${l.vridBackfilled ? "<small>(auto-generated ID)</small>" : ""}</div>
                    <div>📅 ${escapeLH(l.date)} &nbsp; 💰 $${escapeLH(l.price)}</div>
                    <div>🏷 ${escapeLH(l.status || "Booked")}</div>
                    <div>👤 Booked by ${escapeLH(l.bookedBy)}</div>
                    <button class="smallButton" data-idx="${i}" type="button">Open</button>
                </div>
            `;
        }).join("");

        UI.results.querySelectorAll("button[data-idx]").forEach(btn => {
            btn.onclick = () => openEdit(matches[Number(btn.dataset.idx)]);
        });
    }

    // ===========================================
    // EDIT (cross-shift) — separate code path from the live
    // EDIT_LOAD flow on purpose, so today's Add/Edit Load button
    // never touches this and vice versa.
    // ===========================================

    function openEdit(match) {

        if (!window.hasPermission?.("canEditLoads")) {
            alert("You don't have permission to edit loads.");
            return;
        }

        editingContext = match;
        const l = match.load;

        if (UI.editVrid) UI.editVrid.textContent = "🔢 " + l.vrid;
        if (UI.editMeta) {
            UI.editMeta.textContent = `Booked by ${l.bookedBy || "Unknown"} on ${l.date || "?"}`;
        }

        if (UI.editStatus) {
            const current = l.status || "Booked";
            UI.editStatus.innerHTML = statusOptionsFor(current)
                .map(s => `<option value="${escapeLH(s)}" ${s === current ? "selected" : ""}>${escapeLH(s)}</option>`)
                .join("");
        }

        if (UI.editPrice) UI.editPrice.value = l.price ?? "";
        if (UI.editNote) UI.editNote.value = l.note || "";
        if (UI.editReason) UI.editReason.value = "";
        if (UI.editReasonError) UI.editReasonError.textContent = "";

        UI.searchOverlay?.classList.add("hidden");
        UI.editOverlay?.classList.remove("hidden");

        updateEditFormForStatus();
    }

    function statusOptionsFor(current) {
        const forward = window.LOAD_STATUS_TRANSITIONS[current] || [];
        return [current, ...forward.filter(s => s !== current)];
    }

    function updateEditFormForStatus() {

        const status = UI.editStatus?.value;
        const needsReason = status === "Needs Dispute";

        UI.editReasonHint?.classList.toggle("hidden", !needsReason);
    }

    async function submitHistoricalEdit() {

        if (!editingContext) return;

        const l = editingContext.load;
        const shiftId = editingContext.shiftId;
        const owner = editingContext.owner;

        const newStatus = UI.editStatus?.value || l.status || "Booked";
        const rawPrice = UI.editPrice?.value;
        const newPrice = (rawPrice === "" || rawPrice === undefined) ? l.price : rawPrice;
        const newNote = UI.editNote?.value?.trim() || "";
        const reason = UI.editReason?.value?.trim() || "";

        if (UI.editReasonError) UI.editReasonError.textContent = "";

        // A $0 cancellation always represents a case that needs a
        // dispute — require the status to reflect that, not just the
        // price, so it's never silently left as a plain "Cancelled".
        if (newStatus === "Cancelled" && Number(newPrice) === 0) {
            if (UI.editReasonError) {
                UI.editReasonError.textContent = "A $0 cancellation must be set to \"Needs Dispute\" (with a reason).";
            }
            return;
        }

        if (newStatus === "Needs Dispute" && !reason) {
            if (UI.editReasonError) UI.editReasonError.textContent = "A reason is required for Needs Dispute.";
            return;
        }

        const before = { status: l.status || "Booked", price: l.price, note: l.note || "" };
        const after = { status: newStatus, price: newPrice, note: newNote };

        if (JSON.stringify(before) === JSON.stringify(after)) {
            UI.editOverlay?.classList.add("hidden");
            editingContext = null;
            return;
        }

        const editorUid = RelayDesk.currentUser;

        if (UI.editSaveBtn) UI.editSaveBtn.disabled = true;

        try {

            RelayDesk.queue.enqueue("EDIT_HISTORICAL_LOAD", {
                editorUid,
                ownerUid: owner,
                shiftId,
                loadId: l.id,
                vrid: l.vrid,
                changes: after,
                before,
                after,
                reason: reason || null
            });

            // keep the already-loaded dataset in sync so re-opening the
            // search modal (without a full re-fetch) reflects the edit
            const idx = allLoads.findIndex(m => m.shiftId === shiftId && m.load.id === l.id);
            if (idx !== -1) {
                allLoads[idx] = { ...allLoads[idx], load: { ...allLoads[idx].load, ...after } };
            }

            if (window.NotificationManager) {
                window.NotificationManager.notify("✅ Load updated", "success", { category: "load" });
            } else if (window.showToast) {
                window.showToast("✅ Load updated", "success");
            }

        } catch (err) {
            console.error("Historical load edit failed:", err);
            alert("Failed to save changes.");
        } finally {
            if (UI.editSaveBtn) UI.editSaveBtn.disabled = false;
        }

        UI.editOverlay?.classList.add("hidden");
        editingContext = null;
    }

    // ===========================================
    // OWNER NOTIFICATIONS
    // ===========================================

    function listenForNotifications() {

        // initializeLoadHistory() runs on DOMContentLoaded, which can
        // fire before Firebase auth has resolved RelayDesk.currentUser.
        // Without this retry, that race meant this listener silently
        // never attached at all (nothing ever called it again) — no
        // card, no toast, ever, for that whole page load.
        if (!RelayDesk.currentUser) {
            setTimeout(listenForNotifications, 300);
            return;
        }

        if (RelayDesk.currentUser === "A000") return; // admin has no personal load notifications
        if (!UI.notifications) return;

        db.collection("loadChangeNotifications")
            .where("ownerUid", "==", RelayDesk.currentUser)
            .where("acknowledged", "==", false)
            .onSnapshot(snap => {

                const items = [];
                snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
                renderNotifications(items);

                // ======================
                // TOAST — the persistent card above (UI.notifications) has
                // always worked, but nothing ever alerted the person in the
                // moment. This fires a toast only for notifications that
                // are genuinely new since this listener attached — NOT for
                // whatever backlog of already-unacknowledged notifications
                // existed before the page loaded (those still show up as
                // cards, just without a popup, so re-logging in doesn't
                // dump a wall of toasts).
                // ======================

                if (notifState.firstSnapshot) {
                    items.forEach(n => notifState.seenIds.add(n.id));
                    notifState.firstSnapshot = false;
                    return;
                }

                snap.docChanges().forEach(change => {

                    if (change.type !== "added") return;
                    if (notifState.seenIds.has(change.doc.id)) return;

                    notifState.seenIds.add(change.doc.id);

                    const n = change.doc.data();

                    if (window.NotificationManager) {
                        window.NotificationManager.notify(
                            `📦 Your load ${n.vrid || n.loadId} was updated by ${n.editorUid}`,
                            "warning",
                            { category: "load" }
                        );
                    } else if (window.showToast) {
                        window.showToast(
                            `📦 Your load ${n.vrid || n.loadId} was updated by ${n.editorUid}`,
                            "warn"
                        );
                    }
                });

            }, err => console.error("Load notification listener failed:", err));
    }

    // ===========================================
    // deliverPendingLoadNotifications() — called from status.js on
    // every On Duty transition. This did NOT exist anywhere in the
    // codebase before now; status.js's `typeof === "function"` guard
    // meant that call was silently a no-op the whole time.
    //
    // Purpose: the live listener above deliberately skips toasting
    // whatever backlog already existed the moment it first attaches
    // (so logging in doesn't dump a wall of toasts). This function is
    // the other half of that design — it's the thing that's supposed
    // to surface that backlog, but ONLY at the moment the person
    // actually clocks in, one toast per still-unacknowledged load.
    // ===========================================

    window.deliverPendingLoadNotifications = async function () {

        if (!RelayDesk.currentUser || RelayDesk.currentUser === "A000") return;

        try {

            const snap = await db.collection("loadChangeNotifications")
                .where("ownerUid", "==", RelayDesk.currentUser)
                .where("acknowledged", "==", false)
                .get();

            snap.forEach(doc => {

                if (notifState.seenIds.has(doc.id)) return; // already toasted this session
                notifState.seenIds.add(doc.id);

                const n = doc.data();

                if (window.NotificationManager) {
                    window.NotificationManager.notify(
                        `📦 Your load ${n.vrid || n.loadId} was updated by ${n.editorUid}`,
                        "warning",
                        { category: "load" }
                    );
                } else if (window.showToast) {
                    window.showToast(
                        `📦 Your load ${n.vrid || n.loadId} was updated by ${n.editorUid}`,
                        "warn"
                    );
                }
            });

        } catch (err) {
            console.error("deliverPendingLoadNotifications failed:", err);
        }
    };

    function renderNotifications(items) {

        if (!UI.notifications) return;

        if (!items.length) {
            UI.notifications.innerHTML = "";
            return;
        }

        UI.notifications.innerHTML = items.map(n => `
            <div class="loadNotificationCard">
                <div><b>📦 Load ${escapeLH(n.vrid)} was updated by ${escapeLH(n.editorUid)}</b></div>
                <div class="loadNotificationButtons">
                    <button class="smallButton" data-show="${n.id}" type="button">Show Changes</button>
                    <button class="smallButton" data-ack="${n.id}" type="button">Acknowledge</button>
                </div>
                <div class="loadNotificationDetail hidden" id="lhNotifDetail-${n.id}">
                    <b>Before</b><br>
                    Status: ${escapeLH(n.before?.status)}<br>
                    Price: $${escapeLH(n.before?.price)}
                    <hr>
                    <b>After</b><br>
                    Status: ${escapeLH(n.after?.status)}<br>
                    Price: $${escapeLH(n.after?.price)}<br>
                    ${n.reason ? `<b>Reason:</b> ${escapeLH(n.reason)}<br>` : ""}
                    <small>Modified by ${escapeLH(n.editorUid)}${n.time ? " — " + new Date(n.time).toLocaleString() : ""}</small>
                </div>
            </div>
        `).join("");

        UI.notifications.querySelectorAll("button[data-show]").forEach(btn => {
            btn.onclick = () => {
                document.getElementById(`lhNotifDetail-${btn.dataset.show}`)?.classList.toggle("hidden");
            };
        });

        UI.notifications.querySelectorAll("button[data-ack]").forEach(btn => {
            btn.onclick = async () => {
                try {
                    await db.collection("loadChangeNotifications").doc(btn.dataset.ack)
                        .set({ acknowledged: true }, { merge: true });
                } catch (e) {
                    console.error("Acknowledge failed:", e);
                }
            };
        });
    }

    function escapeLH(v) {
        const div = document.createElement("div");
        div.textContent = (v === undefined || v === null) ? "" : String(v);
        return div.innerHTML;
    }

})();

window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => window.initializeLoadHistory?.(), 0);
});