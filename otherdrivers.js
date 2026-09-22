// ===========================================
// ESM — Dynamic "Other" Department Drivers
// ===========================================

(function () {
    const DOC = { collection: "system", id: "otherDrivers" };
    let current = [];
    let initialized = false;

    function clean(list) {
        return [...new Set((Array.isArray(list) ? list : [])
            .map(v => String(v || "").trim())
            .filter(Boolean))];
    }

    function fallback() {
        return clean(window.DRIVER_LISTS?.Other || []);
    }

    function apply(list) {
        current = clean(list);
        window.DRIVER_LISTS = window.DRIVER_LISTS || {};
        window.DRIVER_LISTS.Other = current.slice();
        document.dispatchEvent(new CustomEvent("otherDriversChanged", {
            detail: { drivers: current.slice() }
        }));
    }

    async function init() {
        if (initialized || typeof db === "undefined") return;
        initialized = true;

        try {
            const ref = db.collection(DOC.collection).doc(DOC.id);
            const snap = await ref.get();

            if (!snap.exists || !Array.isArray(snap.data()?.drivers)) {
                const seed = fallback();
                await ref.set({
                    drivers: seed,
                    updatedAt: Date.now(),
                    updatedBy: RelayDesk?.currentUser || null
                }, { merge: true });
                apply(seed);
            } else {
                apply(snap.data().drivers);
            }

            ref.onSnapshot(doc => {
                if (doc.exists) apply(doc.data()?.drivers || []);
            });
        } catch (err) {
            console.error("Other-driver list initialization failed:", err);
            apply(fallback());
        }
    }

    async function save(list) {
        if (!window.hasPermission?.("canManageEmployees")) {
            throw new Error("You don't have permission to edit Other drivers.");
        }

        const cleaned = clean(list);
        if (!cleaned.length) {
            throw new Error("Other must have at least one driver.");
        }

        await db.collection(DOC.collection).doc(DOC.id).set({
            drivers: cleaned,
            updatedAt: Date.now(),
            updatedBy: RelayDesk?.currentUser || null
        }, { merge: true });

        apply(cleaned);
        if (typeof logAudit === "function") {
            await logAudit(
                RelayDesk.currentUser,
                "OTHER_DRIVERS_UPDATED",
                cleaned.length + " drivers"
            );
        }
    }

    function renderEditor() {
        const list = document.getElementById("otherDriversEditorList");
        if (!list) return;
        list.innerHTML = current.map(function (name, index) {
            return '<div class="otherDriverEditorRow">' +
                '<input type="text" class="otherDriverEditorInput" data-index="' + index + '" value="' +
                name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '">' +
                '<button type="button" class="dangerButton otherDriverRemoveBtn" data-index="' + index + '">🗑</button>' +
                '</div>';
        }).join("") || '<div class="workspaceEmpty">No drivers yet.</div>';
    }

    window.openOtherDriversEditor = function () {
        if (!window.hasPermission?.("canManageEmployees")) {
            alert("You don't have permission to edit Other drivers.");
            return;
        }
        renderEditor();
        document.getElementById("otherDriversModal")?.classList.remove("hidden");
    };

    function closeEditor() {
        document.getElementById("otherDriversModal")?.classList.add("hidden");
    }

    function bindEditor() {
        const modal = document.getElementById("otherDriversModal");
        if (!modal) return;

        document.getElementById("otherDriversAddBtn")?.addEventListener("click", function () {
            current.push("");
            renderEditor();
            const inputs = document.querySelectorAll(".otherDriverEditorInput");
            inputs[inputs.length - 1]?.focus();
        });

        document.getElementById("otherDriversCancelBtn")?.addEventListener("click", closeEditor);

        document.getElementById("otherDriversSaveBtn")?.addEventListener("click", async function () {
            const inputs = Array.from(document.querySelectorAll(".otherDriverEditorInput"));
            const names = inputs.map(input => input.value.trim()).filter(Boolean);

            if (!names.length) {
                alert("Add at least one driver.");
                return;
            }

            try {
                await save(names);
                closeEditor();
                alert("Other drivers updated ✔");
            } catch (err) {
                console.error("Other driver save failed:", err);
                alert(err.message || "Failed to save Other drivers.");
            }
        });

        modal.addEventListener("click", function (e) {
            if (e.target === modal) closeEditor();
        });
    }

    window.OtherDrivers = {
        init,
        get: () => current.slice(),
        save,
        canEdit: () => !!window.hasPermission?.("canManageEmployees")
    };

    window.addEventListener("DOMContentLoaded", function () {
        setTimeout(function () {
            init();
            bindEditor();
        }, 500);
    });
})();
