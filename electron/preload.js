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
    getAppInfo: () => ipcRenderer.invoke("get-app-info")
});
