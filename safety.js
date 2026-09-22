// ===========================================
// ESM — Safety Dashboard
// ===========================================

(function () {
    const COLLECTION = "safetyDashboard";
    let initialized = false;
    let activeDate = "";

    function todayKey() {
        return new Date().toISOString().split("T")[0];
    }

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function driverList(dept) {
        return (window.DRIVER_LISTS?.[dept] || []).slice();
    }

    function departments() {
        return (window.LOAD_DEPARTMENTS || ["STS", "iTour", "F&F", "JB Hunt", "MSL", "Other"]).slice();
    }

    function makeKey(dept, driver) {
        return (dept + "::" + driver).replace(/[^a-zA-Z0-9:_-]/g, "_");
    }

    function defaultEntry() {
        return { pti: false, load: "", bol: "", trailer: "", truck: "", updatedAt: 0, updatedBy: "" };
    }

    function ensureEntries(existing) {
        const out = { ...(existing || {}) };
        departments().forEach(function (dept) {
            driverList(dept).forEach(function (driver) {
                const key = makeKey(dept, driver);
                out[key] = { ...defaultEntry(), ...(out[key] || {}) };
            });
        });
        return out;
    }

    async function load() {
        activeDate = todayKey();
        const snap = await db.collection(COLLECTION).doc(activeDate).get();
        const data = snap.exists ? (snap.data() || {}) : {};
        return ensureEntries(data.entries || {});
    }

    function canEditSafety() {
        const role = String(window.RelayDesk?.currentUserData?.role || "").toLowerCase();
        return !!window.hasPermission?.("canManageEmployees") ||
            role.includes("safety");
    }

    async function saveEntry(key, patch) {
        if (!canEditSafety()) {
            alert("You don't have permission to update the Safety Dashboard.");
            return;
        }

        const ref = db.collection(COLLECTION).doc(activeDate || todayKey());
        const snap = await ref.get();
        const data = snap.exists ? (snap.data() || {}) : {};
        const entries = ensureEntries(data.entries || {});
        entries[key] = {
            ...entries[key],
            ...patch,
            updatedAt: Date.now(),
            updatedBy: RelayDesk.currentUser || ""
        };

        await ref.set({
            date: activeDate || todayKey(),
            entries: entries
        }, { merge: true });

        render(entries);
    }

    function render(entries) {
        const root = document.getElementById("safetyDashboardBody");
        if (!root) return;

        root.innerHTML = departments().map(function (dept) {
            const drivers = driverList(dept);

            const rows = drivers.map(function (driver) {
                const key = makeKey(dept, driver);
                const e = entries[key] || defaultEntry();

                return [
                    '<div class="safetyDriverCard" data-safety-key="' + escapeHtml(key) + '">',
                    '<div class="safetyDriverHeader">',
                    '<strong>🚚 ' + escapeHtml(driver) + '</strong>',
                    '<label class="safetyPtiToggle"><input type="checkbox" class="safetyPti" ' + (e.pti ? "checked" : "") + '><span>PTI Checked</span></label>',
                    '</div>',
                    '<div class="safetyFields">',
                    '<label>Current Load<input class="safetyField" data-field="load" value="' + escapeHtml(e.load) + '" placeholder="VRID / load"></label>',
                    '<label>BOL<input class="safetyField" data-field="bol" value="' + escapeHtml(e.bol) + '" placeholder="BOL"></label>',
                    '<label>Trailer<input class="safetyField" data-field="trailer" value="' + escapeHtml(e.trailer) + '" placeholder="Trailer"></label>',
                    '<label>Truck<input class="safetyField" data-field="truck" value="' + escapeHtml(e.truck) + '" placeholder="Truck"></label>',
                    '</div></div>'
                ].join("");
            }).join("");

            return '<section class="safetyDepartment"><div class="safetyDepartmentHeader"><h3>🏢 ' +
                escapeHtml(dept) + '</h3><span>' + drivers.length + ' drivers</span></div>' +
                (rows || '<div class="workspaceEmpty">No drivers configured.</div>') +
                '</section>';
        }).join("");

        root.querySelectorAll(".safetyDriverCard").forEach(function (card) {
            const key = card.dataset.safetyKey;

            card.querySelector(".safetyPti")?.addEventListener("change", function (e) {
                saveEntry(key, { pti: e.target.checked }).catch(function (err) {
                    console.error("Safety PTI save failed:", err);
                });
            });

            card.querySelectorAll(".safetyField").forEach(function (input) {
                input.addEventListener("change", function () {
                    const patch = {};
                    patch[input.dataset.field] = input.value.trim();
                    saveEntry(key, patch).catch(function (err) {
                        console.error("Safety field save failed:", err);
                    });
                });
            });
        });
    }

    async function initialize() {
        if (initialized) return;
        initialized = true;

        try {
            const entries = await load();
            render(entries);
        } catch (err) {
            console.error("Safety Dashboard initialization failed:", err);
            const root = document.getElementById("safetyDashboardBody");
            if (root) root.innerHTML = '<div class="workspaceEmpty">Could not load Safety Dashboard data.</div>';
        }
    }

    window.applySafetyDashboard = async function (enabled) {
        const dispatch = document.getElementById("dashboardDispatchArea");
        const safety = document.getElementById("safetyDashboardArea");
        if (!dispatch || !safety) return;

        if (enabled) {
            dispatch.classList.add("hidden");
            safety.classList.remove("hidden");
            await initialize();
        } else {
            dispatch.classList.remove("hidden");
            safety.classList.add("hidden");
        }
    };

    document.addEventListener("otherDriversChanged", function () {
        if (!document.getElementById("safetyDashboardArea")?.classList.contains("hidden")) {
            initialized = false;
            initialize();
        }
    });
})();
