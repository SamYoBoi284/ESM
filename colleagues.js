// ===========================================
// RelayDesk V5
// colleagues.js
// Live Employee Board Renderer
// ===========================================


// ===========================================
// MAIN RENDER FUNCTION
// ===========================================

function renderColleagues(users) {

    const box = RelayDesk.UI.colleaguesBox;

    if (!box) return;

    box.innerHTML = "";

    const adminUser = users.find(user => user?.id === "A000");

    if (adminUser) {
        const adminWrap = document.createElement("div");
        adminWrap.className = "colleaguesAdminSection";

        const adminLabel = document.createElement("div");
        adminLabel.className = "colleaguesAdminLabel";
        adminLabel.textContent = "Admin Status";

        const adminRow = document.createElement("div");
        adminRow.className = "colItem colleaguesAdminRow";

        const adminStatus = adminUser.adminStatus || "Offline";
        const adminEmoji = adminStatus === "Online" ? "🟢" : "🔴";
        const adminText = adminStatus === "Online" ? "Online" : "Offline";

        adminRow.innerHTML = `
            <span><b>Admin</b></span>
            <span>${adminEmoji} ${adminText}</span>
        `;

        adminWrap.appendChild(adminLabel);
        adminWrap.appendChild(adminRow);
        box.appendChild(adminWrap);
    }

    users.forEach(user => {

        if (!user || !user.id) return;

        // =========================
        // ADMIN FILTER FIX
        // =========================

        // We show admin ONLY in admin panel, not colleagues list
        if (user.id === "A000") return;

        // =========================
        // STATUS EMOJI MAP
        // =========================

        let emoji = "🔴";

        switch (user.status) {

            case "On Duty":
                emoji = "🟢";
                break;

            case "Break":
                emoji = "🟡";
                break;

            case "Away":
                emoji = "🟣";
                break;

            case "Off Duty":
                emoji = "🔴";
                break;

        }

        // =========================
        // CREATE ITEM
        // =========================

        const div = document.createElement("div");

        div.className = "colItem colItemClickable";

        // Phase 2: every employee in this board opens their profile
        // (view-only). Additive — the row's markup/content is unchanged.
        div.onclick = () => window.openEmployeeProfile?.(user.id);

        // Safe fallback for missing data
        const status = user.status || "Unknown";

        div.innerHTML = `
            <span><b>${user.id}</b></span>
            <span>${emoji} ${status}</span>
        `;

        box.appendChild(div);

    });

}


// ===========================================
// SIMPLE LIVE UPDATE HELPER
// ===========================================

function updateColleaguesList(snapshot) {

    const users = [];

    snapshot.forEach(doc => {

        users.push({

            id: doc.id,

            ...doc.data()

        });

    });

    renderColleagues(users);

}


// ===========================================
// GLOBAL EXPORTS
// ===========================================

window.renderColleagues = renderColleagues;

window.updateColleaguesList = updateColleaguesList;