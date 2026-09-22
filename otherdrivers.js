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

    window.OtherDrivers = {
        init,
        get: () => current.slice(),
        save,
        canEdit: () => !!window.hasPermission?.("canManageEmployees")
    };

    window.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
})();
