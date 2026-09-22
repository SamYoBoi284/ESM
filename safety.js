// ESM Safety Dashboard with integrated Dispatch/Safety dashboard switching
(function () {
    const COLLECTION = "safetyDashboard";
    const ACTIVE_VIEW_KEY = "esm_active_dashboard_view";
    let initialized = false;
    let activeDate = "";

    const todayKey = () => new Date().toISOString().split("T")[0];

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
        return {
            pti: false,
            load: "",
            bol: "",
            trailer: "",
            truck: "",
            hos: window.SafetyHOS?.normalize?.({}) || null,
            updatedAt: 0,
            updatedBy: ""
        };
    }

    function ensureEntries(existing) {
        const out = { ...(existing || {}) };
        departments().forEach(dept => {
            driverList(dept).forEach(driver => {
                const key = makeKey(dept, driver);
                out[key] = { ...defaultEntry(), ...(out[key] || {}) };
            });
        });
        return out;
    }

    function getSavedView() {
        try {
            return localStorage.getItem(ACTIVE_VIEW_KEY) === "safety" ? "safety" : "dispatch";
        } catch (e) {
            return "dispatch";
        }
    }

    function saveView(view) {
        try { localStorage.setItem(ACTIVE_VIEW_KEY, view); } catch (e) {}
    }

    function isCombined() {
        return window.ESMSettings?.get?.("classicDashboardType") === "combined";
    }

    function setDashboardView(view) {
        view = view === "safety" ? "safety" : "dispatch";

        const dispatch = document.getElementById("dashboardDispatchArea");
        const safety = document.getElementById("safetyDashboardArea");
        const tabs = document.getElementById("dashboardModeTabs");
        if (!dispatch || !safety) return;

        if (!isCombined()) view = "dispatch";
        saveView(view);

        dispatch.classList.toggle("hidden", view !== "dispatch");
        safety.classList.toggle("hidden", view !== "safety");

        tabs?.querySelectorAll("[data-dashboard-view]").forEach(btn => {
            const active = btn.dataset.dashboardView === view;
            btn.classList.toggle("active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });

        if (view === "safety") initialize();
    }

    function renderDashboardModeTabs() {
        const tabs = document.getElementById("dashboardModeTabs");
        if (!tabs) return;

        const combined = isCombined();
        tabs.classList.toggle("hidden", !combined);

        tabs.querySelectorAll("[data-dashboard-view]").forEach(btn => {
            btn.onclick = () => setDashboardView(btn.dataset.dashboardView);
        });

        setDashboardView(combined ? getSavedView() : "dispatch");
    }

    async function load() {
        activeDate = todayKey();
        const snap = await db.collection(COLLECTION).doc(activeDate).get();
        const data = snap.exists ? (snap.data() || {}) : {};
        return ensureEntries(data.entries || {});
    }

    function canEditSafety() {
        const role = String(window.RelayDesk?.currentUserData?.role || "").toLowerCase();
        return !!window.hasPermission?.("canManageEmployees") || role.includes("safety");
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
            entries
        }, { merge: true });

        render(entries);
    }

    function render(entries) {
        const root = document.getElementById("safetyDashboardBody");
        if (!root) return;

        window.__SAFETY_ENTRIES__ = entries;

        root.innerHTML = departments().map(dept => {
            const drivers = driverList(dept);

            const rows = drivers.map(driver => {
                const key = makeKey(dept, driver);
                const e = entries[key] || defaultEntry();

                return [
                    '<div class="safetyDriverCard" data-safety-key="' + escapeHtml(key) + '">',
                    '<div class="safetyDriverHeader">',
                    '<strong>🚚 ' + escapeHtml(driver) + '</strong>',
                    '<label class="safetyPtiToggle"><input type="checkbox" class="safetyPti" ' + (e.pti ? "checked" : "") + '><span>PTI Checked</span></label>',
                    '</div>',
                    '<div class="safetyHos" aria-label="Driver HOS"></div>',
                    '<div class="safetyFields">'
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

        root.querySelectorAll(".safetyDriverCard").forEach(card => {
            const key = card.dataset.safetyKey;

            const hos = card.querySelector(".safetyHos");
            window.SafetyHOS?.renderSummary(hos, entries[key]?.hos || {});
            card.querySelector(".safetyHosEditBtn")?.addEventListener("click", () => {
                const driver = driverList(dept).find(name => makeKey(dept, name) === key) || key;
                window.SafetyHOS?.open(key, driver, entries[key]?.hos || {}, patch => saveEntry(key, { hos: patch }));
            });

            card.querySelector(".safetyPti")?.addEventListener("change", e => {
                saveEntry(key, { pti: e.target.checked }).catch(err => console.error("Safety PTI save failed:", err));
            });

            card.querySelectorAll(".safetyField").forEach(input => {
                input.addEventListener("change", () => {
                    const patch = {};
                    patch[input.dataset.field] = input.value.trim();
                    saveEntry(key, patch).catch(err => console.error("Safety field save failed:", err));
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
            window.SafetyHOS?.bind?.();
            window.SafetyHOS?.startTicker?.();

            if (!window._safetyDashboardListenerAttached && typeof db !== "undefined" && db) {
                window._safetyDashboardListenerAttached = true;
                db.collection(COLLECTION).doc(activeDate).onSnapshot(snap => {
                    const data = snap.exists ? (snap.data() || {}) : {};
                    render(ensureEntries(data.entries || {}));
                }, err => console.error("Safety Dashboard live listener failed:", err));
            }
        } catch (err) {
            console.error("Safety Dashboard initialization failed:", err);
            const root = document.getElementById("safetyDashboardBody");
            if (root) root.innerHTML = '<div class="workspaceEmpty">Could not load Safety Dashboard data.</div>';
        }
    }

    window.applyDashboardComposition = function (mode) {
        renderDashboardModeTabs();
        if (mode !== "combined") setDashboardView("dispatch");
    };

    window.applySafetyDashboard = function (enabled) {
        window.applyDashboardComposition?.(enabled ? "combined" : "dispatch");
    };

    document.addEventListener("otherDriversChanged", () => {
        if (!document.getElementById("safetyDashboardArea")?.classList.contains("hidden")) {
            initialized = false;
            initialize();
        }
    });
})();
