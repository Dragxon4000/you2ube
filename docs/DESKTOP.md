# you2ube Desktop

The you2ube desktop client wraps the existing Next.js web app in Electron,
adding native OS integration while keeping the web version fully functional.

## Features

| Feature | How |
|---|---|
| Native window | Electron `BrowserWindow` with state persistence (size/position/maximized) |
| Native notifications | `Notification` API — used for XP gains, level-ups, achievements |
| Auto-update | `electron-updater` against GitHub Releases (checks every 4h) |
| Application menu | Full File/Edit/View/Window/Help with `CmdOrCtrl+1..7` for tabs |
| System tray | Quick access + "Open you2ube" + "Check for Updates…" |
| Global shortcut | `CmdOrCtrl+Shift+Y` focuses the you2ube window from anywhere |
| Single instance | Second launch focuses the existing window instead of opening another |
| External links | Open in system browser, not inside the app |
| Sandbox | `contextIsolation`, `nodeIntegration: false`, `sandbox: true` |

## Run in development

```bash
./scripts/electron-dev.sh
```

This:
1. Compiles `electron/*.ts` → `dist-electron/*.js`.
2. Starts `next dev` on `:3000`.
3. Waits for the dev server to respond.
4. Launches Electron pointing at `http://localhost:3000`.

Both processes are killed together when you close the window or press Ctrl+C.

## Build for distribution

```bash
./scripts/electron-build.sh           # current platform
./scripts/electron-build.sh --mac     # macOS (dmg + zip)
./scripts/electron-build.sh --win     # Windows (nsis installer + portable)
./scripts/electron-build.sh --linux   # Linux (AppImage + deb)
```

Outputs land in `./release/`.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Electron main process (electron/main.ts)            │
│    ├─ boots Next.js server (prod) or connects to dev │
│    ├─ creates BrowserWindow                          │
│    ├─ sets up menu, tray, global shortcuts           │
│    ├─ runs auto-updater                              │
│    └─ exposes IPC handlers                           │
├──────────────────────────────────────────────────────┤
│  Preload (electron/preload.ts)                       │
│    └─ contextBridge → window.electronAPI (typed)     │
├──────────────────────────────────────────────────────┤
│  Renderer (Next.js)                                  │
│    ├─ src/lib/desktop.ts: detects electronAPI,       │
│    │   offers showNotification / useDesktopUpdater / │
│    │   useDesktopNavigation — all no-op on web       │
│    ├─ src/components/UpdateBanner.tsx: native update │
│    │   UI, renders nothing on web                    │
│    └─ src/components/ActionsPanel.tsx: fires native  │
│        OS notifications when XP is earned            │
└──────────────────────────────────────────────────────┘
```

## Security posture

- **contextIsolation: true** — renderer cannot reach preload scope.
- **nodeIntegration: false** — renderer has no `require`.
- **sandbox: true** — preload runs in a sandboxed renderer process.
- **setWindowOpenHandler** — external links open in system browser.
- **Single instance lock** — prevents multiple app instances racing.
- **Preload exposes a narrow typed API** — only `notify`, `checkForUpdates`,
  `installUpdate`, window controls, navigation.

## Auto-update flow

1. 5 seconds after launch, `autoUpdater.checkForUpdates()` runs (skipped in dev).
2. If an update exists on GitHub Releases, the renderer receives `update:available`.
3. `autoUpdater.downloadUpdate()` fires; progress streams to the renderer.
4. When downloaded, `update:downloaded` fires; the banner shows a "Restart" button.
5. Clicking Restart calls `autoUpdater.quitAndInstall()`.
6. The check repeats every 4 hours while the app is running.

To use this in production, configure `GH_TOKEN` and publish a GitHub Release; the
`electron-builder.json` publish block points at `Dragxon4000/you2ube`.

## Web version

The web version is **unchanged**. Every desktop-only feature:

- Detects `window.electronAPI` via `isDesktop()`.
- Falls back to web equivalents (e.g., browser `Notification` API) or no-ops
  cleanly (e.g., `UpdateBanner` renders nothing).

You can still run `npm run dev` / `npm run build && npm run start` and get
the same experience as before.
