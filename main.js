// ===========================================
// RelayDesk V5
// electron/main.js
// ELECTRON SHELL FOR THE EXISTING WEB APP
// ===========================================
// This file hosts the current ESM web application inside a desktop window.
// The existing Firebase, auth, workspace, and queue logic remain unchanged.
// Electron only provides the desktop shell, tray support, and window behavior.

const path = require("path");
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, session, dialog } = require("electron");

let mainWindow;
let tray = null;

const isWindows = process.platform === "win32";
const iconPath = path.join(__dirname, "..", "assets", "esm-icon.ico");
const pngIconPath = path.join(__dirname, "..", "favicon2.png");

// ===========================================
// SETTINGS-DRIVEN STATE (Settings feature)
// ===========================================
// The renderer (settings.js) pushes these over IPC whenever the person
// changes a General setting, so the main process always knows how to
// behave on close without needing to ask the renderer synchronously.
let closeBehavior = {
    minimizeToTray: true,
    confirmBeforeCloseWhileOnDuty: false
};
let isOnDuty = false;

let packageInfo = {};
try {
    packageInfo = require(path.join(__dirname, "..", "package.json"));
} catch (err) {
    packageInfo = { version: app.getVersion() };
}

function createWindow() {
    // Create the main desktop window and keep the existing web UI intact.
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 980,
        minWidth: 1100,
        minHeight: 800,
        title: "ESM",
        icon: iconPath,
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setTitle("ESM");

    // Prevent the app from navigating away from the local ESM shell.
    mainWindow.webContents.on("will-navigate", (event, url) => {
        const parsed = new URL(url);
        if (parsed.protocol !== "file:") {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        const parsed = new URL(url);
        if (parsed.protocol !== "file:") {
            shell.openExternal(url);
            return { action: "deny" };
        }
        return { action: "allow" };
    });

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    // Minimize to tray instead of closing the app so it stays available.
    mainWindow.on("minimize", (event) => {
        if (tray && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on("close", (event) => {
        if (app.isQuitting) {
            return;
        }

        // "Minimize to system tray instead of closing" (General settings).
        // This is the historical default behavior and stays the default
        // unless the person turns it off.
        if (closeBehavior.minimizeToTray) {
            event.preventDefault();
            mainWindow.hide();
            return;
        }

        // Minimize-to-tray is off, so the window should actually close/quit.
        // If "Confirm before closing while On Duty" is on and the renderer
        // has reported the person is currently On Duty, ask first.
        if (closeBehavior.confirmBeforeCloseWhileOnDuty && isOnDuty) {
            event.preventDefault();

            const choice = dialog.showMessageBoxSync(mainWindow, {
                type: "warning",
                buttons: ["Cancel", "Close Anyway"],
                defaultId: 0,
                cancelId: 0,
                title: "Close ESM?",
                message: "You're still On Duty. Are you sure you want to close ESM?"
            });

            if (choice === 1) {
                app.isQuitting = true;
                app.quit();
            }
        }
    });

    mainWindow.on("show", () => {
        if (tray) {
            tray.setToolTip("ESM - Running");
        }
    });
}

function createTray() {
    // Provide a Windows-friendly tray icon for quick restore and exit actions.
    tray = new Tray(iconPath || pngIconPath);
    tray.setToolTip("ESM");

    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Open ESM",
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: "Minimize to tray",
            click: () => {
                if (mainWindow) {
                    mainWindow.minimize();
                }
            }
        },
        {
            type: "separator"
        },
        {
            label: "Quit ESM",
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

app.whenReady().then(() => {
    if (isWindows) {
        app.setAppUserModelId("com.sts.esm");
    }

    createWindow();
    createTray();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// Bridge renderer notifications into Electron's native notification API.
ipcMain.handle("notify", async (_event, options = {}) => {
    if (!Notification.isSupported()) {
        return false;
    }

    const notification = new Notification({
        title: options.title || "ESM",
        body: options.message || "",
        icon: iconPath
    });

    notification.on("click", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
        }
    });

    notification.show();
    return true;
});

ipcMain.on("focus-app", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
    }
});

// ===========================================
// SETTINGS FEATURE — IPC
// ===========================================

// ABOUT: version + build date, read from package.json so it never needs
// to be hardcoded anywhere else. Add a "buildDate" field to package.json
// (electron-builder ignores unknown fields) if you want a fixed date
// baked into installers; otherwise this falls back to "today" so About
// always shows something sensible in dev.
ipcMain.handle("get-app-info", () => {
    return {
        version: packageInfo.version || app.getVersion(),
        buildDate: packageInfo.buildDate || new Date().toISOString().split("T")[0]
    };
});

// GENERAL: "Launch ESM when Windows starts"
ipcMain.handle("get-login-item-settings", () => {
    return app.getLoginItemSettings();
});

ipcMain.handle("set-login-item-settings", (_event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
    return app.getLoginItemSettings();
});

// GENERAL: keeps the close handler above in sync with the person's
// current "Minimize to tray" / "Confirm before closing while On Duty"
// settings, and their live On Duty status.
ipcMain.on("set-close-behavior", (_event, behavior = {}) => {
    closeBehavior = {
        minimizeToTray: behavior.minimizeToTray !== false,
        confirmBeforeCloseWhileOnDuty: !!behavior.confirmBeforeCloseWhileOnDuty
    };
});

ipcMain.on("set-on-duty-status", (_event, onDuty) => {
    isOnDuty = !!onDuty;
});

// GENERAL: "Clear local cache" — clears Electron's HTTP/session cache.
// (localStorage itself is cleared from the renderer, since that's where
// it lives.)
ipcMain.handle("clear-cache", async () => {
    try {
        await session.defaultSession.clearCache();
        return true;
    } catch (err) {
        console.warn("Clear cache failed:", err);
        return false;
    }
});

// APPEARANCE: UI Scale + Ctrl/wheel zoom. Applied on the actual
// webContents so it works immediately with no restart required.
ipcMain.on("set-zoom-factor", (_event, factor) => {
    if (mainWindow && typeof factor === "number" && factor > 0) {
        mainWindow.webContents.setZoomFactor(factor);
    }
});
