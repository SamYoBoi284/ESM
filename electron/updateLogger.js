// ===========================================
// RelayDesk V5
// electron/updateLogger.js
// LIGHTWEIGHT LOCAL UPDATE-EVENT LOG (Phase 3)
// ===========================================
// A small, dependency-free JSON log of updater activity, written to
// Electron's recommended per-user local storage location
// (app.getPath("userData")) — NOT localStorage/renderer storage, and
// NOT Firebase. Main-process only; the renderer never touches the file
// directly, it only reads back through the "get-update-log" IPC call
// main.js exposes.
//
// Event types written by main.js: "check", "update-found",
// "download-started", "download-completed", "install-started",
// "install-completed", and "error". Kept intentionally simple — this
// is a diagnostic trail, not a feature surface.

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const LOG_FILE_NAME = "update-log.json";
const MAX_ENTRIES = 200;

function getLogPath() {
    return path.join(app.getPath("userData"), LOG_FILE_NAME);
}

function readEntries() {
    try {
        const raw = fs.readFileSync(getLogPath(), "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        // Missing file on first run, or corrupt JSON — either way, start clean
        // rather than throwing and breaking the update flow over a log file.
        return [];
    }
}

function writeEntries(entries) {
    try {
        fs.writeFileSync(getLogPath(), JSON.stringify(entries, null, 2), "utf8");
    } catch (err) {
        console.warn("updateLogger: failed to write update log:", err);
    }
}

// Records a single updater event. Never throws — logging must never be
// able to interrupt or break the actual update flow.
function logEvent(type, data = {}) {
    try {
        const entries = readEntries();
        entries.push({
            type,
            timestamp: new Date().toISOString(),
            ...data
        });
        while (entries.length > MAX_ENTRIES) entries.shift();
        writeEntries(entries);
    } catch (err) {
        console.warn("updateLogger: failed to log event:", err);
    }
}

function getHistory() {
    return readEntries();
}

// Called once at startup. If the last "install-started" entry doesn't
// already have a matching "install-completed" after it, and the app is
// now running that exact version, the restart-and-install clearly
// succeeded — so we can record it after the fact (there's no "install
// finished" event from electron-updater itself; the app just relaunches
// into the new version).
function checkInstallCompleted(currentVersion) {
    if (!currentVersion) return;

    try {
        const entries = readEntries();
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            if (entry.type === "install-completed") return; // already recorded
            if (entry.type === "install-started") {
                if (entry.version === currentVersion) {
                    logEvent("install-completed", { version: currentVersion });
                }
                return;
            }
        }
    } catch (err) {
        console.warn("updateLogger: failed to check install completion:", err);
    }
}

module.exports = {
    logEvent,
    getHistory,
    checkInstallCompleted
};
