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
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, shell, dialog, powerMonitor, clipboard } = require("electron");
const { autoUpdater } = require("electron-updater");
const updateLogger = require("./updateLogger");

let mainWindow;
let tray = null;

const isWindows = process.platform === "win32";
const iconPath = path.join(__dirname, "..", "assets", "esm-icon-2.ico");
const pngIconPath = path.join(__dirname, "..", "favicon2.png");

// ===========================================
// SINGLE INSTANCE LOCK
// ===========================================
// General setting: "Only ONE instance of ESM should ever exist". If a
// second launch happens (e.g. double-clicking the shortcut again while
// ESM is already minimized to tray), Windows hands control back here via
// "second-instance" instead of letting a new process start — we just
// bring the existing window into focus and never create a new one.
//
// IMPORTANT: the losing process must exit with app.exit(), not
// app.quit(). app.quit() is graceful/async — it doesn't stop the rest
// of this file from running synchronously, so the unconditional
// app.whenReady().then(() => createWindow()) further down could still
// resolve and create a real BrowserWindow in this same
// already-quitting process before the quit actually takes effect. That
// phantom window paints on top of the real window (which the surviving
// process's "second-instance" handler below already restored/focused
// correctly) but never becomes interactive, since its host process is
// mid-shutdown — exactly the "opens but I can't press anything until I
// close it and reopen from the tray" symptom this fixes. app.exit()
// terminates immediately and synchronously, so whenReady() never gets a
// chance to fire in this process.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.exit(0);
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

// True from the moment an update starts downloading through to install —
// while true, the "Confirm Before Closing While On Duty" prompt is
// skipped so an update download/restart is never blocked by it.
let isUpdating = false;

// Phase 3 polish — guards against overlapping/duplicate updater calls
// (e.g. a user double-clicking "Check Now" or "Download Update", or a
// stray click landing while a previous request is still in flight).
let isCheckInProgress = false;
let isDownloadInProgress = false;

// Tracks which action (check / download / install) most recently failed,
// so a single "Retry" button in the renderer can redo the right thing
// instead of always just re-checking from scratch.
let lastUpdateAction = "check";

// Version reported by the most recent "update-available"/"update-downloaded"
// event, kept so later status events (downloading, error) can still tell
// the renderer which version is involved even though electron-updater's
// own "download-progress" event doesn't include it.
let pendingUpdateVersion = null;

// True once the "download-started" log entry has been written for the
// current download, so it's only logged once (download-progress fires
// many times per download).
let hasLoggedDownloadStart = false;

// Settings > About > Updates > "Show desktop notifications for updates".
// Only gates the native OS notification fired from
// showUpdateReadyNotification() below — the in-app "Restart Now / Remind
// Me Later" toast (owned by settings.js) is unaffected either way, so
// turning this off just means an unfocused ESM won't pop an OS toast
// when an update finishes downloading; the in-app prompt still shows
// next time the window is focused.
let updateDesktopNotificationsEnabled = true;

function getBuildDate() {
    try {
        const pkgPath = path.join(app.getAppPath(), "package.json");
        return fs.statSync(pkgPath).mtime.toISOString().split("T")[0];
    } catch (err) {
        return "Unknown";
    }
}
function restoreWindowFocus() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        if (!mainWindow.isVisible()) {
            mainWindow.show();
        }

        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }

        // Known Electron/Chromium bug (electron/electron#19977, #40212):
        // after a native alert()/confirm()/prompt() closes, calling
        // mainWindow.focus() alone is a no-op because Electron already
        // considers the window focused, so Chromium never re-syncs
        // keyboard routing to the DOM's active element. Only a genuine
        // blur -> focus transition (what Alt+Tab does) forces that
        // re-sync. This is only ever called right after a dialog closes
        // (see "restore-focus-after-dialog" below) rather than on every
        // generic window focus, so it no longer fires on ordinary
        // Alt+Tab-back and doesn't cause visible flicker there.
        mainWindow.blur();
        mainWindow.focus();
        mainWindow.webContents.focus();
    }, 50);
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

        if (isRealQuit && closeBehavior.confirmBeforeCloseWhileOnDuty && isOnDuty && !isUpdating) {
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

restoreWindowFocus();

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

// Native JS dialogs triggered from the renderer (alert()/confirm()/
// prompt() — used all over admin.js, admin-extras.js, login/logout,
// etc.) don't go through main.js at all; they're shown by Chromium
// itself. preload.js wraps all three centrally and pings this the
// instant one closes, so the corrective blur/focus cycle only ever runs
// right after a dialog — not on every ordinary window focus/Alt+Tab,
// which was causing visible flicker.
ipcMain.on("restore-focus-after-dialog", () => {
    restoreWindowFocus();
});

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
            restoreWindowFocus();
        }
    });
}

// ===========================================
// AUTO UPDATE (electron-updater, publish: GitHub Releases)
// ===========================================
// Reads update feed config from electron-builder.yml's "publish" block
// (provider: github, owner: SamYoBoi284, repo: ESM) and the app's own
// package.json version. electron-updater compares that against the
// latest.yml asset attached to the newest GitHub Release and, if newer,
// downloads the matching installer from that release.
//
// Update checks are still user/settings-driven (Settings > About >
// "Check Now", or a check at startup if "Automatically check for
// updates" is on), but once an update is found it now downloads
// automatically in the background so the user can keep working — no
// click required.
//
// UX NOTE (update UX rework): the "update ready, restart?" prompt used
// to be a native OS dialog (dialog.showMessageBox) fired straight from
// here. That's been moved to the renderer (settings.js), which shows an
// in-app "Restart Now / Remind Me Later" toast driven entirely by the
// update-status IPC event below. main.js's job stops at "tell the
// renderer what happened" — it no longer owns any prompt/timer logic
// itself. quitAndInstall() is still only ever triggered by the renderer
// via the existing "quit-and-install" IPC handler further down, so the
// actual install trigger is unchanged.

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdateStatus(status, extra = {}) {
    mainWindow?.webContents.send("update-status", {
        status,
        // Always included so the renderer never has to make a second
        // round trip just to know what's currently installed.
        currentVersion: app.getVersion(),
        ...extra
    });
}

// Pulls the handful of release-metadata fields electron-updater already
// gives us (from GitHub's release body) off an autoUpdater "info" object.
// Not rendered anywhere yet — this just makes sure the data is flowing
// through the bridge so a future "What's New" view can use it without
// touching main.js again (release-notes bridge prep only).
function releaseMeta(info) {
    if (!info) return {};
    return {
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
        releaseName: info.releaseName || null,
        releaseDate: info.releaseDate || null
    };
}

// Fetches the actual release body straight from the GitHub REST API by
// tag, rather than trusting whatever electron-updater's own parsing
// handed back in `info.releaseNotes`. This is the real source of truth
// for the "What's New" screen's changelog text (see RELEASE_NOTES.md /
// scripts/release.js for how that body gets populated at release time).
const GITHUB_OWNER = "SamYoBoi284";
const GITHUB_REPO = "ESM";

async function fetchGithubReleaseNotes(version) {
    if (!version) return null;
    try {
        const res = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/v${version}`,
            { headers: { Accept: "application/vnd.github+json", "User-Agent": "ESM-app" } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.body === "string" && data.body.trim() ? data.body : null;
    } catch (err) {
        console.warn("Could not fetch GitHub release notes:", err);
        return null;
    }
}

autoUpdater.on("checking-for-update", () => {
    updateLogger.logEvent("check");
    sendUpdateStatus("checking");
});

autoUpdater.on("update-available", async (info) => {
    isCheckInProgress = false;
    pendingUpdateVersion = info?.version || null;
    updateLogger.logEvent("update-found", { version: pendingUpdateVersion });
    const meta = releaseMeta(info);
    const fetchedNotes = await fetchGithubReleaseNotes(info?.version);
    sendUpdateStatus("available", { version: info?.version, ...meta, releaseNotes: fetchedNotes || meta.releaseNotes });
});

autoUpdater.on("update-not-available", (info) => {
    isUpdating = false;
    isCheckInProgress = false;
    pendingUpdateVersion = null;
    hasLoggedDownloadStart = false;
    sendUpdateStatus("not-available", { version: info?.version });
});

// Cleanup safety: whatever stage the update was in when it failed
// (checking, downloading, or installing), this always resets ESM back
// to a normal, non-stuck state — the app keeps running fine either way,
// and the "Check Now"/"Retry" path is always available afterward.
autoUpdater.on("error", (err) => {
    console.warn("autoUpdater error:", err);
    const message = err?.message || String(err);

    isUpdating = false;
    isCheckInProgress = false;
    isDownloadInProgress = false;
    hasLoggedDownloadStart = false;

    updateLogger.logEvent("error", { message, phase: lastUpdateAction, version: pendingUpdateVersion });
    sendUpdateStatus("error", { message, phase: lastUpdateAction, version: pendingUpdateVersion });
});

autoUpdater.on("download-progress", (progress) => {
    isUpdating = true;

    // electron-updater doesn't emit a distinct "download started" event —
    // the first progress tick is the earliest reliable signal, so that's
    // what gets logged (once per download).
    if (!hasLoggedDownloadStart) {
        hasLoggedDownloadStart = true;
        updateLogger.logEvent("download-started", { version: pendingUpdateVersion });
    }

    sendUpdateStatus("downloading", {
        version: pendingUpdateVersion,
        percent: progress?.percent || 0,
        bytesPerSecond: progress?.bytesPerSecond || 0,
        transferred: progress?.transferred || 0,
        total: progress?.total || 0
    });
});

autoUpdater.on("update-downloaded", async (info) => {
    isUpdating = true;
    isDownloadInProgress = false;
    hasLoggedDownloadStart = false;
    pendingUpdateVersion = info?.version || pendingUpdateVersion;
    updateLogger.logEvent("download-completed", { version: pendingUpdateVersion });
    const meta = releaseMeta(info);
    const fetchedNotes = await fetchGithubReleaseNotes(info?.version);
    sendUpdateStatus("downloaded", { version: info?.version, ...meta, releaseNotes: fetchedNotes || meta.releaseNotes });
    // No native dialog here anymore — settings.js's update-status
    // listener shows the in-app "Restart Now / Remind Me Later" toast.

    // Phase 2: a quiet native OS notification, Discord/VS Code style —
    // shown only when the user isn't already looking at ESM, since the
    // in-app toast above already covers that case. Owned entirely by
    // main.js (rather than settings.js reaching for the generic
    // "notify" bridge) so there's exactly one place deciding whether to
    // interrupt the user.
    if (updateDesktopNotificationsEnabled && (!mainWindow || !mainWindow.isFocused())) {
        showUpdateReadyNotification(info?.version);
    }
});

// Phase 2: native "ESM Update Ready" notification. Windows' basic
// Notification API doesn't reliably support action buttons across
// Windows versions without extra native modules (electron-windows-
// notifications, a custom toastXml + protocol handler, etc.) — adding
// one of those would mean a new dependency and a chunk of platform-
// specific plumbing just for this. Instead, clicking the notification
// itself brings ESM to the foreground and tells the renderer to bring
// the existing "Restart Now / Remind Me Later" toast (Phase 1) back to
// the front — so the actual Restart/Later choice still happens, just
// one click away instead of live inside the OS toast.
function showUpdateReadyNotification(version) {
    if (!Notification.isSupported()) return null;

    const notification = new Notification({
        title: "ESM Update Ready",
        body: version ? `Version ${version} is ready to install` : "An update is ready to install",
        icon: iconPath
    });

    notification.on("click", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send("update-notification-clicked", { version });
        }
    });

    notification.show();
    return notification;
}

// Settings feature: About > Updates > "Check Now" (and startup auto-check).
async function doCheckForUpdates() {
    // Packaged installs only — running unpackaged (`npm start`) has no
    // installer/latest.yml to compare against and electron-updater would
    // just error out.
    if (!app.isPackaged) {
        sendUpdateStatus("error", { message: "Updates are only available in installed builds.", phase: "check" });
        return { ok: false, reason: "not-packaged" };
    }

    // Race-condition guard: ignore a second "Check Now" (or overlapping
    // startup auto-check) while one is already in flight instead of
    // stacking duplicate electron-updater requests.
    if (isCheckInProgress) {
        return { ok: false, reason: "already-checking" };
    }

    isCheckInProgress = true;
    lastUpdateAction = "check";

    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (err) {
        console.warn("checkForUpdates failed:", err);
        isCheckInProgress = false;
        const message = err?.message || String(err);
        updateLogger.logEvent("error", { message, phase: "check" });
        sendUpdateStatus("error", { message, phase: "check" });
        return { ok: false, reason: message };
    }
    // Note: isCheckInProgress is also cleared by the "update-available"/
    // "update-not-available"/"error" listeners above, since a successful
    // checkForUpdates() call resolves before those events actually land.
}

ipcMain.handle("check-for-updates", () => doCheckForUpdates());

// Settings feature: About > Updates — triggered once the renderer has
// shown the user an "Update available" state and they've chosen to
// download it (also reachable via auto-download, which calls
// electron-updater's own internal download path rather than this IPC
// handler — this one only covers the manual/renderer-triggered case).
async function doDownloadUpdate() {
    if (isDownloadInProgress) {
        return { ok: false, reason: "already-downloading" };
    }

    isDownloadInProgress = true;
    lastUpdateAction = "download";

    try {
        await autoUpdater.downloadUpdate();
        return { ok: true };
    } catch (err) {
        console.warn("downloadUpdate failed:", err);
        isDownloadInProgress = false;
        isUpdating = false;
        hasLoggedDownloadStart = false;
        const message = err?.message || String(err);
        updateLogger.logEvent("error", { message, phase: "download", version: pendingUpdateVersion });
        sendUpdateStatus("error", { message, phase: "download", version: pendingUpdateVersion });
        return { ok: false, reason: message };
    }
}

ipcMain.handle("download-update", () => doDownloadUpdate());

// Settings feature: About > Updates > "Retry" — shown only after a
// failed check/download/install. Redoes whichever action actually
// failed rather than always starting over from a plain check.
ipcMain.handle("retry-update", () => {
    if (lastUpdateAction === "download" && pendingUpdateVersion) {
        return doDownloadUpdate();
    }
    return doCheckForUpdates();
});

// Settings feature: About > Updates — "Restart & Install" once a download
// finishes (update-downloaded). Wrapped in try/catch so a failure here
// (e.g. installer file went missing/locked) surfaces as a normal
// "Update failed" state instead of an unhandled exception, and never
// leaves app.isQuitting stuck true if the install doesn't actually happen.
ipcMain.handle("quit-and-install", () => {
    try {
        lastUpdateAction = "install";
        updateLogger.logEvent("install-started", { version: pendingUpdateVersion });
        app.isQuitting = true;
        autoUpdater.quitAndInstall();
    } catch (err) {
        console.warn("quitAndInstall failed:", err);
        app.isQuitting = false;
        isUpdating = false;
        const message = err?.message || String(err);
        updateLogger.logEvent("error", { message, phase: "install", version: pendingUpdateVersion });
        sendUpdateStatus("error", { message, phase: "install", version: pendingUpdateVersion });
    }
});

// Settings feature: About > Updates > "Automatically download updates in
// the background". Off means an available update just sits there
// (status stays "available") until the user clicks "Download Update"
// themselves via the download-update handler above.
ipcMain.handle("set-auto-download-updates", (_event, enabled) => {
    autoUpdater.autoDownload = !!enabled;
    return autoUpdater.autoDownload;
});

ipcMain.handle("set-update-desktop-notifications", (_event, enabled) => {
    updateDesktopNotificationsEnabled = !!enabled;
    return updateDesktopNotificationsEnabled;
});

// Phase 3: read-only access to the local update-event log
// (electron/updateLogger.js) for diagnostics.
ipcMain.handle("get-update-log", () => {
    return updateLogger.getHistory();
});

app.whenReady().then(() => {
    if (isWindows) {
        app.setAppUserModelId("com.sts.esm");
    }

    createWindow();
    syncTrayState();

    // Phase 3: electron-updater has no "install finished" event of its
    // own — the app just relaunches into the new version — so this
    // compares the version we're running now against the last
    // "install-started" log entry to confirm it actually succeeded.
    updateLogger.checkInstallCompleted(app.getVersion());

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
        restoreWindowFocus();
    }
});

// Employee Activity Detection: OS-wide idle time (seconds since the last
// mouse/keyboard input anywhere on the system, not just inside ESM).
// Backs activitydetection.js so idle detection keeps working even while
// the ESM window is minimized/unfocused and the employee is idle at
// their desk in some other application.
ipcMain.handle("get-system-idle-time", () => {
    try {
        return powerMonitor.getSystemIdleTime();
    } catch (e) {
        return 0;
    }
});

// AddLoad "📋 Import Relay Copy" feature: reads plain text off the OS
// clipboard via Electron's native clipboard module (main-process only,
// no permission prompt/renderer restrictions the way
// navigator.clipboard.readText() can run into), so workspace.js can
// parse it into the load fields.
ipcMain.handle("read-clipboard-text", () => {
    try {
        return clipboard.readText() || "";
    } catch (e) {
        return "";
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