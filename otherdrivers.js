// ESM shared driver-list manager.
// Driver names are seeded from drivers.js once, then persisted in Firestore
// under system/driverLists so every department can be edited without a rebuild.
// The legacy OtherDrivers API is preserved for existing load-modal callers.

(function () {
    const DOC = { collection: "system", id: "driverLists" };
    let lists = {};
    let initialized = false;

    const clean = list => [...new Set((Array.isArray(list) ? list : [])
        .map(v => String(v || "").trim())
        .filter(Boolean))];

    function departments() {
        const configured = Array.isArray(window.LOAD_DEPARTMENTS)
            ? window.LOAD_DEPARTMENTS
            : ["STS", "iTour", "F&F", "JB Hunt", "MSL", "Shabwah", "Other"];
        return [...new Set(configured)];
    }

    function seedLists() {
        const source = window.DRIVER_LISTS || {};
        const out = {};
        departments().forEach(dept => out[dept] = clean(source[dept] || []));
        return out;
    }

    function apply(next) {
        const source = next || {};
        const merged = {};
        departments().forEach(dept => merged[dept] = clean(source[dept] ?? window.DRIVER_LISTS?.[dept] ?? []));
        lists = merged;
        window.DRIVER_LISTS = window.DRIVER_LISTS || {};
        Object.keys(merged).forEach(dept => window.DRIVER_LISTS[dept] = merged[dept].slice());
        document.dispatchEvent(new CustomEvent("driverListsChanged", { detail: { lists: getAll() } }));
        document.dispatchEvent(new CustomEvent("otherDriversChanged", { detail: { drivers: merged.Other?.slice() || [] } }));
    }

    async function init() {
        if (initialized || typeof db === "undefined") return;
        initialized = true;
        try {
            const ref = db.collection(DOC.collection).doc(DOC.id);
            const snap = await ref.get();
            if (!snap.exists || !snap.data()?.lists || typeof snap.data().lists !== "object") {
                const seed = seedLists();
                await ref.set({ lists: seed, updatedAt: Date.now(), updatedBy: window.RelayDesk?.currentUser || null }, { merge: true });
                apply(seed);
            } else {
                apply(snap.data().lists);
            }
            ref.onSnapshot(doc => {
                if (doc.exists) apply(doc.data()?.lists || {});
            });
        } catch (err) {
            console.error("Driver-list initialization failed:", err);
            apply(seedLists());
        }
    }

    async function saveDepartment(dept, list) {
        if (!window.hasPermission?.("canManageEmployees")) throw new Error("You don't have permission to edit driver lists.");
        if (!departments().includes(dept)) throw new Error("Unknown department.");

        const cleaned = clean(list);
        const next = getAll();
        next[dept] = cleaned;

        await db.collection(DOC.collection).doc(DOC.id).set({
            lists: next,
            updatedAt: Date.now(),
            updatedBy: window.RelayDesk?.currentUser || null
        }, { merge: true });

        apply(next);
        if (typeof logAudit === "function") {
            await logAudit(RelayDesk.currentUser, "DRIVER_LIST_UPDATED", dept + ": " + cleaned.length + " drivers");
        }
    }

    function get(dept) {
        return clean(lists[dept] || window.DRIVER_LISTS?.[dept] || []);
    }

    function getAll() {
        const out = {};
        departments().forEach(dept => out[dept] = get(dept));
        return out;
    }

    function renderEditor() {
        const dept = document.getElementById("driverListEditorDepartment")?.value || "Other";
        const list = document.getElementById("otherDriversEditorList");
        if (!list) return;
        const names = get(dept);
        list.innerHTML = names.map((name, index) =>
            '<div class="otherDriverEditorRow"><input type="text" class="otherDriverEditorInput" data-index="' + index + '" value="' +
            name.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '">' +
            '<button type="button" class="dangerButton otherDriverRemoveBtn" data-index="' + index + '">🗑</button></div>'
        ).join("") || '<div class="workspaceEmpty">No drivers yet.</div>';
    }

    window.openOtherDriversEditor = function (dept) {
        dept = dept || "Other";
        if (!window.hasPermission?.("canManageEmployees")) {
            alert("You don't have permission to edit driver lists.");
            return;
        }
        const modal = document.getElementById("otherDriversModal");
        const select = document.getElementById("driverListEditorDepartment");
        if (select) {
            select.innerHTML = departments().map(d =>
                '<option value="' + String(d).replace(/"/g, "&quot;") + '">' + d + '</option>'
            ).join("");
            select.value = departments().includes(dept) ? dept : "Other";
        }
        renderEditor();
        modal?.classList.remove("hidden");
    };

    function closeEditor() {
        document.getElementById("otherDriversModal")?.classList.add("hidden");
    }

    function bindEditor() {
        const modal = document.getElementById("otherDriversModal");
        if (!modal || modal.dataset.bound) return;
        modal.dataset.bound = "true";

        document.getElementById("driverListEditorDepartment")?.addEventListener("change", renderEditor);
        document.getElementById("otherDriversAddBtn")?.addEventListener("click", function () {
            const container = document.getElementById("otherDriversEditorList");
            const row = document.createElement("div");
            row.className = "otherDriverEditorRow";
            row.innerHTML = '<input type="text" class="otherDriverEditorInput" value=""><button type="button" class="dangerButton otherDriverRemoveBtn">🗑</button>';
            container?.appendChild(row);
            row.querySelector("input")?.focus();
        });

        document.getElementById("otherDriversEditorList")?.addEventListener("click", e => {
            const btn = e.target.closest(".otherDriverRemoveBtn");
            if (btn) btn.closest(".otherDriverEditorRow")?.remove();
        });

        document.getElementById("otherDriversCancelBtn")?.addEventListener("click", closeEditor);
        document.getElementById("otherDriversSaveBtn")?.addEventListener("click", async function () {
            const dept = document.getElementById("driverListEditorDepartment")?.value || "Other";
            const names = Array.from(document.querySelectorAll(".otherDriverEditorInput")).map(i => i.value.trim()).filter(Boolean);
            try {
                await saveDepartment(dept, names);
                closeEditor();
                window.showToast?.(dept + " driver list updated ✔", "success");
            } catch (err) {
                console.error("Driver list save failed:", err);
                alert(err.message || "Failed to save driver list.");
            }
        });

        modal.addEventListener("click", e => {
            if (e.target === modal) closeEditor();
        });
    }

    window.DriverLists = { init, get, getAll, saveDepartment, departments, openEditor: window.openOtherDriversEditor };
    window.OtherDrivers = {
        init,
        get: () => get("Other"),
        save: list => saveDepartment("Other", list),
        canEdit: () => !!window.hasPermission?.("canManageEmployees")
    };

    window.addEventListener("DOMContentLoaded", () => setTimeout(() => { init(); bindEditor(); }, 300));
})();
