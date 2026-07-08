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

    // ===========================================
    // SETTINGS FEATURE
    // ===========================================

    // ABOUT
    getAppInfo: () => ipcRenderer.invoke("get-app-info"),

    // GENERAL — Launch ESM when Windows starts
    getLoginItemSettings: () => ipcRenderer.invoke("get-login-item-settings"),
    setLoginItemSettings: (enabled) => ipcRenderer.invoke("set-login-item-settings", enabled),

    // GENERAL — Minimize to tray / confirm close while On Duty
    setCloseBehavior: (behavior) => ipcRenderer.send("set-close-behavior", behavior),
    setOnDutyStatus: (onDuty) => ipcRenderer.send("set-on-duty-status", onDuty),

    // GENERAL — Clear local cache
    clearCache: () => ipcRenderer.invoke("clear-cache"),

    // APPEARANCE — UI Scale / zoom
    setZoomFactor: (factor) => ipcRenderer.send("set-zoom-factor", factor)
});
