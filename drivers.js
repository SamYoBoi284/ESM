// ===========================================
// DRIVER LISTS — per department (V52)
// ===========================================
//
// Single source of truth for which drivers exist under each
// department. Powers the searchable Driver dropdown in the Add/Edit
// Load modal (see workspace.js — bindDriverCombobox() and friends).
//
// TO ADD / REMOVE / RENAME A DRIVER: edit the arrays below. Nothing
// else needs to change — no HTML, no other JS file. The dropdown
// itself, the department-dependent filtering, and the save-time
// validation (a load can never be saved with a driver from the wrong
// department) all read from this file automatically.
//
// Keys MUST exactly match window.LOAD_DEPARTMENTS (defined in
// workspace.js) — those are the same strings used as the <option
// value="..."> in #loadModalDepartment. Reusing them here (instead of
// short codes like "sts"/"itour") avoids a second mapping table that
// could silently drift out of sync with the real department list.
//
// Names are shown in the dropdown exactly as spelled here, and that
// exact spelling/casing is what gets saved on the load's `driver`
// field — that consistency is the entire point of this change (no
// more "for Ahmed" / "Ahmed" / "FOR AHMED" / "ahmed" all being
// treated as different drivers).
//
// Loaded before workspace.js (see index.html) so window.DRIVER_LISTS
// is guaranteed to exist by the time the Load modal binds.

window.DRIVER_LISTS = {

    "STS": [
        "Ashraf",
        "Hany & Ibrahim",
        "Mohammad Omar",
        "Mohammad Farhat",
        "Timothy",
        "Ernest",
        "Verrell",
        "Mario",
        "Sari",
        "Abdi",
        "Mustafa",
        "Kareem",
        "Amirah",
        "Vitali",
        "Faisal",
        "Mahmoud",
        "Kalid",
        "Yasir",
        "Shanard",
        "Raghdah",
        "Christopher",
        "Shadi"
    ],

    "iTour": [
        "Abdallah Yousef",
        "Abdulwahab Mohjazi",
        "Adam",
        "Housam",
        "Taher",
        "Atif",
        "Mahid"
    ],

    "Alquaiti": [
        "Gamil",
        "Naser",
        "Hassan Roble",
        "Omar Mohammad",
        "Bandar"
    ],

    "F&F": [
       "Hasan Aoun"
    ]

};
