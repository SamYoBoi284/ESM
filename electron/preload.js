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
    restoreFocusAfterDialog: () => ipcRenderer.send("restore-focus-after-dialog"),
    getSystemIdleTime: () => ipcRenderer.invoke("get-system-idle-time"),
    readClipboardText: () => ipcRenderer.invoke("read-clipboard-text"),
    setCloseBehavior: (behavior = {}) => ipcRenderer.invoke("set-close-behavior", behavior),
    setOnDutyStatus: (onDuty) => ipcRenderer.invoke("set-on-duty-status", onDuty),
    setLoginItemSettings: (enabled) => ipcRenderer.invoke("set-login-item-settings", enabled),
    setZoomFactor: (factor) => ipcRenderer.invoke("set-zoom-factor", factor),
    clearCache: () => ipcRenderer.invoke("clear-cache"),
    getAppInfo: () => ipcRenderer.invoke("get-app-info"),
    checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("download-update"),
    quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
    setAutoDownloadUpdates: (enabled) => ipcRenderer.invoke("set-auto-download-updates", enabled),
    setUpdateDesktopNotifications: (enabled) => ipcRenderer.invoke("set-update-desktop-notifications", enabled),
    retryUpdate: () => ipcRenderer.invoke("retry-update"),
    getUpdateLog: () => ipcRenderer.invoke("get-update-log"),

    onUpdateStatus: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on("update-status", handler);
        return () => ipcRenderer.removeListener("update-status", handler);
    },

    onUpdateNotificationClicked: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on("update-notification-clicked", handler);
        return () => ipcRenderer.removeListener("update-notification-clicked", handler);
    },

    // Sync AI — embedded local llama.cpp / Qwen runtime.
    // The model is loaded only while the Sync AI panel is open.
    syncAiOpen: () => ipcRenderer.invoke("sync-ai-open"),
    syncAiClose: () => ipcRenderer.invoke("sync-ai-close"),
    syncAiStatus: () => ipcRenderer.invoke("sync-ai-status"),
    syncAiPrompt: (payload = {}) => ipcRenderer.invoke("sync-ai-prompt", payload),
});
