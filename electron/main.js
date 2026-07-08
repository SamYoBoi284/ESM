// ===========================================
// RelayDesk V5
// electron/main.js
// ELECTRON SHELL FOR THE EXISTING WEB APP
// ===========================================
// This file hosts the current ESM web application inside a desktop window.
// The existing Firebase, auth, workspace, and queue logic remain unchanged.
// Electron only provides the desktop shell, tray support, and window behavior.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, dialog } = require("electron");

let mainWindow;
let tray = null;

const isWindows = process.platform === "win32";
const iconPath = path.join(__dirname, "..", "assets", "esm-icon.ico");
const pngIconPath = path.join(__dirname, "..", "favicon2.png");

// ===========================================
// SINGLE INSTANCE LOCK
// ===========================================
// General setting: "Only ONE instance of ESM should ever exist". If a
// second launch happens (e.g. double-clicking the shortcut again while
// ESM is already minimized to tray), Windows hands control back here via
// "second-instance" instead of letting a new process start — we just
// bring the existing window into focus and never create a new one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (!mainWindow) return;

        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
    });
}

// ===========================================
// SETTINGS-DRIVEN STATE
// ===========================================
// Mirrors of renderer-side Settings so main.js can make close/minimize/
// tray decisions without reaching into localStorage itself. Kept in sync
// via the "set-close-behavior" / "set-on-duty-status" IPC calls that
// settings.js already makes on startup and on every relevant change.

let closeBehavior = {
    minimizeToTray: true,
    confirmBeforeCloseWhileOnDuty: false
};

let isOnDuty = false;

function getBuildDate() {
    try {
        const pkgPath = path.join(app.getAppPath(), "package.json");
        return fs.statSync(pkgPath).mtime.toISOString().split("T")[0];
    } catch (err) {
        return "Unknown";
    }
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
    // Settings feature: General > "Minimize To Tray". When the setting is
    // off, minimizing behaves like a normal window minimize instead.
    mainWindow.on("minimize", (event) => {
        if (closeBehavior.minimizeToTray && tray && !app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Settings feature: General > "Minimize To Tray" and "Confirm Before
    // Closing While On Duty".
    //
    // - A "real" close/quit attempt is either an explicit app.isQuitting
    //   (Quit from the tray menu, Cmd+Q, etc.) or any close while
    //   minimizeToTray is off (there's no tray to fall back to, so the X
    //   button really does mean exit).
    // - Only a real close/quit attempt while the employee is On Duty ever
    //   shows the confirmation dialog — hiding to the tray isn't actually
    //   closing the app, so there's nothing to confirm in that case.
    mainWindow.on("close", (event) => {

        const isRealQuit = app.isQuitting || !closeBehavior.minimizeToTray;

        if (isRealQuit && closeBehavior.confirmBeforeCloseWhileOnDuty && isOnDuty) {
            event.preventDefault();

            const choice = dialog.showMessageBoxSync(mainWindow, {
                type: "warning",
                buttons: ["Cancel", "Close ESM"],
                defaultId: 0,
                cancelId: 0,
                title: "Confirm Close",
                message: "You're currently On Duty.",
                detail: "Are you sure you want to close ESM while On Duty?"
            });

            if (choice === 1) {
                app.isQuitting = true;
                app.exit(0);
            } else {
                app.isQuitting = false;
            }
            return;
        }

        if (!isRealQuit) {
            event.preventDefault();
            mainWindow.hide();
        }
        // else: a real close/quit with nothing to confirm — let it proceed.
    });

    mainWindow.on("show", () => {
        if (tray) {
            tray.setToolTip("ESM - Running");
        }
    });
}

// Settings feature: General > "Minimize To Tray". Creates or destroys the
// tray icon to match the current setting; called once at startup with the
// default, and again whenever the renderer pushes a changed setting.
function syncTrayState() {
    if (closeBehavior.minimizeToTray && !tray) {
        createTray();
    } else if (!closeBehavior.minimizeToTray && tray) {
        tray.destroy();
        tray = null;
    }
}

function createTray() {
    if (tray) return;

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
    syncTrayState();

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

// Settings feature: General > "Minimize To Tray" / "Confirm Before Closing
// While On Duty". settings.js pushes both values together as a single
// object every time either one changes, and once on startup.
ipcMain.handle("set-close-behavior", (_event, behavior = {}) => {
    closeBehavior = {
        minimizeToTray: !!behavior.minimizeToTray,
        confirmBeforeCloseWhileOnDuty: !!behavior.confirmBeforeCloseWhileOnDuty
    };
    syncTrayState();
    return closeBehavior;
});

// Settings feature: General > "Confirm Before Closing While On Duty".
// settings.js polls RelayDesk.currentStatus and pushes this whenever it
// changes, so the close handler above always knows the live status.
ipcMain.handle("set-on-duty-status", (_event, onDuty) => {
    isOnDuty = !!onDuty;
    return isOnDuty;
});

// Settings feature: General > "Launch On Windows Startup".
ipcMain.handle("set-login-item-settings", (_event, enabled) => {
    app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: process.execPath
    });
    return app.getLoginItemSettings();
});

// Settings feature: Appearance > "UI Scale" (and the Ctrl+Wheel / Ctrl+Plus-
// Minus-0 shortcuts, which all funnel through the same setter in settings.js).
ipcMain.handle("set-zoom-factor", (_event, factor) => {
    const f = Number(factor) || 1;
    mainWindow?.webContents.setZoomFactor(f);
    return f;
});

// Settings feature: General > "Clear Local Cache". Only clears the HTTP
// cache — never session storage data — so the remembered login, saved
// settings, and Firestore's own offline persistence are all left intact.
ipcMain.handle("clear-cache", async () => {
    try {
        await mainWindow?.webContents.session.clearCache();
        return true;
    } catch (err) {
        console.warn("clear-cache failed:", err);
        return false;
    }
});

// Settings feature: About panel.
ipcMain.handle("get-app-info", () => {
    return {
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        buildDate: getBuildDate(),
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        appPath: app.getAppPath(),
        userDataPath: app.getPath("userData")
    };
});
