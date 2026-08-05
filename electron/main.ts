/**
 * you2ube Desktop — Electron main process.
 *
 * Boots the Next.js server (in production) or connects to the dev server,
 * then opens a native window with menu, tray, auto-update, and native
 * notifications. The web version continues to work untouched.
 *
 * Run locally:
 *   npm run dev & npx tsx electron/main.ts        # dev (Next.js + Electron)
 *   npm run build && npx tsx electron/main.ts     # prod
 *
 * Package for distribution:
 *   npm run build && npx electron-builder --config electron-builder.json
 */

import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  globalShortcut,
  ipcMain,
  shell,
  nativeImage,
  dialog,
} from "electron";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import Store from "electron-store";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const IS_DEV = !app.isPackaged;
const DEV_SERVER_URL = process.env.DEV_SERVER_URL ?? "http://localhost:3000";
const PROD_PORT = parseInt(process.env.YOU2UBE_PORT ?? "3001", 10);
const STORE = new Store<{
  windowBounds?: { x?: number; y?: number; width: number; height: number; isMaximized?: boolean };
  skipUpdateVersion?: string;
}>({
  defaults: {
    windowBounds: { width: 1280, height: 800 },
  },
});

// Configure logging — writes to ~/Library/Logs/you2ube (mac) / %APPDATA%/you2ube/logs (win) / ~/.config/you2ube/logs (linux)
log.transports.file.level = "info";
autoUpdater.logger = log;

// ---------------------------------------------------------------------------
// Window state persistence
// ---------------------------------------------------------------------------
function loadWindowBounds() {
  const saved = STORE.get("windowBounds");
  return saved ?? { width: 1280, height: 800 };
}

function saveWindowBounds(win: BrowserWindow) {
  const isMaximized = win.isMaximized();
  const bounds = win.getBounds();
  STORE.set("windowBounds", { ...bounds, isMaximized });
}

// ---------------------------------------------------------------------------
// Next.js server management (production only)
// ---------------------------------------------------------------------------
let nextServer: ChildProcess | null = null;

async function startNextServer(): Promise<string> {
  if (IS_DEV) return DEV_SERVER_URL;

  return new Promise((resolve, reject) => {
    const nextBin = path.resolve(__dirname, "../node_modules/.bin/next");
    const child = spawn(nextBin, ["start", "-p", String(PROD_PORT)], {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production" },
    });
    nextServer = child;

    let started = false;
    const onLine = (line: string) => {
      log.info("[next]", line);
      if (!started && /ready|started/i.test(line)) {
        started = true;
        resolve(`http://localhost:${PROD_PORT}`);
      }
    };
    child.stdout?.on("data", (d) => onLine(d.toString().trim()));
    child.stderr?.on("data", (d) => onLine(d.toString().trim()));
    child.on("exit", (code) => {
      log.warn("[next] exited", code);
      if (!started) reject(new Error(`Next.js exited with code ${code}`));
    });

    // Fallback: if the server is slow to announce, assume ready after 6s.
    setTimeout(() => {
      if (!started) {
        started = true;
        resolve(`http://localhost:${PROD_PORT}`);
      }
    }, 6000);
  });
}

function stopNextServer() {
  if (nextServer) {
    nextServer.kill("SIGTERM");
    nextServer = null;
  }
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let appUrl = DEV_SERVER_URL;

function createWindow() {
  const bounds = loadWindowBounds();
  mainWindow = new BrowserWindow({
    ...bounds,
    title: "you2ube",
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#f1f5f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Allow the renderer to reach the local Next.js server.
      webSecurity: true,
    },
  });

  if (bounds.isMaximized) mainWindow.maximize();

  // Show when ready to avoid visual flash.
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(appUrl)) return { action: "allow" };
    shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });

  // Persist window bounds.
  const persist = () => mainWindow && saveWindowBounds(mainWindow);
  mainWindow.on("resize", persist);
  mainWindow.on("move", persist);
  mainWindow.on("close", persist);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(appUrl).catch((err) => {
    log.error("Failed to load app URL", err);
  });
}

// ---------------------------------------------------------------------------
// Application menu (keyboard shortcuts live here too)
// ---------------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" as const },
        { type: "separator" as const },
        {
          label: "Check for Updates…",
          click: () => autoUpdater.checkForUpdatesAndNotify(),
        },
        { type: "separator" as const },
        { role: "services" as const },
        { type: "separator" as const },
        { role: "hide" as const },
        { role: "hideOthers" as const },
        { role: "unhide" as const },
        { type: "separator" as const },
        { role: "quit" as const },
      ],
    }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "Profile",
          accelerator: "CmdOrCtrl+1",
          click: () => sendToRenderer("navigate", { tab: "profile" }),
        },
        {
          label: "Achievements",
          accelerator: "CmdOrCtrl+2",
          click: () => sendToRenderer("navigate", { tab: "achievements" }),
        },
        {
          label: "Badges",
          accelerator: "CmdOrCtrl+3",
          click: () => sendToRenderer("navigate", { tab: "badges" }),
        },
        {
          label: "Rewards",
          accelerator: "CmdOrCtrl+4",
          click: () => sendToRenderer("navigate", { tab: "rewards" }),
        },
        {
          label: "Leaderboard",
          accelerator: "CmdOrCtrl+5",
          click: () => sendToRenderer("navigate", { tab: "leaderboard" }),
        },
        {
          label: "Notifications",
          accelerator: "CmdOrCtrl+6",
          click: () => sendToRenderer("navigate", { tab: "notifications" }),
        },
        {
          label: "Discord",
          accelerator: "CmdOrCtrl+7",
          click: () => sendToRenderer("navigate", { tab: "discord" }),
        },
        { type: "separator" as const },
        isMac ? { role: "close" as const } : { role: "quit" as const },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac ? [
          { type: "separator" as const },
          { role: "front" as const },
        ] : [
          { role: "close" as const },
        ]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "you2ube on GitHub",
          click: () => {
            shell.openExternal("https://github.com/Dragxon4000/you2ube").catch(() => {});
          },
        },
        {
          label: "Report an Issue",
          click: () => {
            shell.openExternal("https://github.com/Dragxon4000/you2ube/issues").catch(() => {});
          },
        },
        { type: "separator" as const },
        {
          label: `About you2ube v${app.getVersion()}`,
          click: () => {
            dialog.showMessageBox({
              type: "info",
              title: "About you2ube",
              message: `you2ube v${app.getVersion()}`,
              detail: "A desktop-first video platform with XP, achievements, badges, rewards, and Discord integration.",
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendToRenderer(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------
function createTray() {
  // 16x16 transparent icon — Electron provides a default when the path is empty.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("you2ube");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open you2ube",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    {
      label: "Profile",
      click: () => sendToRenderer("navigate", { tab: "profile" }),
    },
    {
      label: "Notifications",
      click: () => sendToRenderer("navigate", { tab: "notifications" }),
    },
    { type: "separator" },
    {
      label: "Check for Updates…",
      click: () => autoUpdater.checkForUpdatesAndNotify(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]));

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.focus();
      else mainWindow.show();
    } else {
      createWindow();
    }
  });
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    log.info("Update available", info.version);
    sendToRenderer("update:available", {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === "string"
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map(n => n.note).join("\n")
          : "",
    });
    if (STORE.get("skipUpdateVersion") !== info.version) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-not-available", () => {
    log.info("No update available");
    sendToRenderer("update:not-available", {});
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update:progress", {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded", info.version);
    sendToRenderer("update:downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    log.error("Auto-updater error", err);
    sendToRenderer("update:error", { message: err.message });
  });

  // Check for updates 5s after launch, then every 4 hours.
  if (!IS_DEV) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => log.warn("Initial update check failed", err));
    }, 5000);
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  }
}

// ---------------------------------------------------------------------------
// IPC handlers (renderer → main)
// ---------------------------------------------------------------------------
function setupIpc() {
  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:isDev", () => IS_DEV);
  ipcMain.handle("app:getPlatform", () => process.platform);

  ipcMain.handle("notify", (_event, payload: { title: string; body: string; silent?: boolean }) => {
    if (!Notification.isSupported()) return { supported: false };
    try {
      new Notification({
        title: payload.title,
        body: payload.body,
        silent: payload.silent ?? false,
      }).show();
      return { supported: true };
    } catch (err) {
      log.warn("Native notification failed", err);
      return { supported: false };
    }
  });

  ipcMain.handle("update:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo.version };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle("update:skip", (_event, version: string) => {
    STORE.set("skipUpdateVersion", version);
  });

  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
}

// ---------------------------------------------------------------------------
// Global shortcuts (work even when the window isn't focused)
// ---------------------------------------------------------------------------
function registerGlobalShortcuts() {
  // Cmd/Ctrl+Shift+Y: show/focus the you2ube window from anywhere.
  globalShortcut.register("CommandOrControl+Shift+Y", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  try {
    appUrl = await startNextServer();
    log.info("App URL:", appUrl);
    buildMenu();
    setupIpc();
    setupAutoUpdater();
    createTray();
    createWindow();
    registerGlobalShortcuts();
  } catch (err) {
    log.error("Failed to start", err);
    dialog.showErrorBox("you2ube failed to start", (err as Error).message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // On macOS, apps typically stay open until the user quits explicitly.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS, re-create a window when the dock icon is clicked.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopNextServer();
});

// Prevent multiple instances — focus the existing window if a second launch happens.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
