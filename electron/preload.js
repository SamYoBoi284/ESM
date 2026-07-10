// ===========================================
// RelayDesk V5
// electron/preload.js
// ELECTRON RENDERER BRIDGE
// ===========================================
// This preload script exposes a small API to the existing renderer code so
// it can use Electron features without needing to know the host environment.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    notify: (options = {}) => ipcRenderer.invoke("notify", options),
    focusApp: () => ipcRenderer.send("focus-app"),

    // Employee Activity Detection: OS-wide idle seconds (powerMonitor),
    // so idle detection isn't limited to in-app DOM events only.
    getSystemIdleTime: () => ipcRenderer.invoke("get-system-idle-time"),

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
