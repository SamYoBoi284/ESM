// ===========================================
// RelayDesk V5
// electron/preload.js
// ELECTRON RENDERER BRIDGE
// ===========================================
// This preload script exposes a small API to the existing renderer code so
// it can use Electron features without needing to know the host environment.

const { contextBridge, ipcRenderer, webFrame } = require("electron");

// ===========================================
// NATIVE DIALOG FOCUS-LOSS WORKAROUND
// ===========================================
// Known Electron/Chromium bug (electron/electron#19977, #40212): after a
// native alert()/confirm()/prompt() closes on Windows, keyboard input
// stops reaching text inputs until the window loses and regains OS focus
// (e.g. Alt+Tab). Fixed centrally here by wrapping the three dialog
// functions in the page's own (main-world) context — contextIsolation
// keeps preload's `window` separate from the page's, so the wrapping has
// to happen via webFrame.executeJavaScript rather than by assigning
// window.alert directly in this file. This runs before any of the app's
// own scripts, so every existing alert()/confirm()/prompt() call site
// picks it up automatically — nothing elsewhere needs to change.
webFrame.executeJavaScript(`
    (function () {
        const originalAlert = window.alert.bind(window);
        const originalConfirm = window.confirm.bind(window);
        const originalPrompt = window.prompt.bind(window);

        window.alert = function (...args) {
            const result = originalAlert(...args);
            window.electronAPI && window.electronAPI.restoreFocusAfterDialog();
            return result;
        };
        window.confirm = function (...args) {
            const result = originalConfirm(...args);
            window.electronAPI && window.electronAPI.restoreFocusAfterDialog();
            return result;
        };
        window.prompt = function (...args) {
            const result = originalPrompt(...args);
            window.electronAPI && window.electronAPI.restoreFocusAfterDialog();
            return result;
        };
    })();
`);

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    notify: (options = {}) => ipcRenderer.invoke("notify", options),
    focusApp: () => ipcRenderer.send("focus-app"),

    // Electron/Chromium focus-loss workaround (see wrapper below): tells
    // main to do a corrective blur->focus cycle, but ONLY right after a
    // native alert()/confirm()/prompt() actually closes, instead of on
    // every generic window focus event (which caused flicker on normal
    // Alt+Tab-back).
    restoreFocusAfterDialog: () => ipcRenderer.send("restore-focus-after-dialog"),

    // Employee Activity Detection: OS-wide idle seconds (powerMonitor),
    // so idle detection isn't limited to in-app DOM events only.
    getSystemIdleTime: () => ipcRenderer.invoke("get-system-idle-time"),

    // AddLoad "📋 Import Relay Copy" feature: reads the OS clipboard's
    // plain text via the main process (electron.clipboard) instead of
    // the browser-only navigator.clipboard.readText(), which is more
    // reliable in a contextIsolation:true renderer like this one.
    readClipboardText: () => ipcRenderer.invoke("read-clipboard-text"),

    // Settings feature: General > "Minimize To Tray" / "Confirm Before
    // Closing While On Duty"
    setCloseBehavior: (behavior = {}) => ipcRenderer.invoke("set-close-behavior", behavior),
    setOnDutyStatus: (onDuty) => ipcRenderer.invoke("set-on-duty-status", onDuty),

    // Settings feature: General > "Launch On Windows Startup"
    setLoginItemSettings: (enabled) => ipcRenderer.invoke("set-login-item-settings", enabled),

    // Settings feature: Appearance > "UI Scale" / zoom shortcuts
    setZoomFactor: (factor) => ipcRenderer.invoke("set-zoom-factor", factor),

    // Settings feature: General > "Clear Local Cache"
    clearCache: () => ipcRenderer.invoke("clear-cache"),

    // Settings feature: About panel
    getAppInfo: () => ipcRenderer.invoke("get-app-info"),

    // Settings feature: About panel > Updates (electron-updater, GitHub Releases)
    checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("download-update"),
    quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
    setAutoDownloadUpdates: (enabled) => ipcRenderer.invoke("set-auto-download-updates", enabled),
    setUpdateDesktopNotifications: (enabled) => ipcRenderer.invoke("set-update-desktop-notifications", enabled),

    // Phase 3: retries whichever update step (check/download) last
    // failed, and read-only access to the local update-event log.
    retryUpdate: () => ipcRenderer.invoke("retry-update"),
    getUpdateLog: () => ipcRenderer.invoke("get-update-log"),

    onUpdateStatus: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on("update-status", handler);
        return () => ipcRenderer.removeListener("update-status", handler);
    },

    // Phase 2: fired when the user clicks the native "ESM Update Ready"
    // OS notification, so the renderer can bring the in-app restart
    // toast back to the front.
    onUpdateNotificationClicked: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on("update-notification-clicked", handler);
        return () => ipcRenderer.removeListener("update-notification-clicked", handler);
    }
});
