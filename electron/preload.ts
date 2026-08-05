/**
 * Electron preload script.
 *
 * Runs in an isolated context with access to a subset of Node + Electron
 * APIs. Exposes a narrow, typed `electronAPI` on `window` via contextBridge
 * so the renderer (Next.js) can call native features without getting full
 * Node access.
 *
 * Security posture:
 *   - contextIsolation: true  (renderer can't reach into this scope)
 *   - nodeIntegration: false  (renderer has no `require`)
 *   - sandbox: true           (preload runs in a sandboxed renderer process)
 */

import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  /** true only inside the desktop client. */
  isDesktop: true;
  /** OS platform: 'darwin' | 'win32' | 'linux'. */
  platform: NodeJS.Platform;
  /** App version from package.json. */
  getVersion(): Promise<string>;
  /** Whether we're running in dev mode. */
  isDev(): Promise<boolean>;

  // --- Native notifications ------------------------------------------------
  /**
   * Show a native OS notification. Returns `{ supported: false }` if the
   * current OS / environment doesn't support them.
   */
  notify(payload: { title: string; body: string; silent?: boolean }): Promise<{ supported: boolean }>;

  // --- Auto-updater --------------------------------------------------------
  checkForUpdates(): Promise<{ ok: boolean; version?: string; error?: string }>;
  installUpdate(): Promise<void>;
  skipUpdate(version: string): Promise<void>;
  onUpdateAvailable(cb: (info: { version: string; releaseNotes: string }) => void): () => void;
  onUpdateNotAvailable(cb: () => void): () => void;
  onUpdateProgress(cb: (p: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): () => void;
  onUpdateDownloaded(cb: (info: { version: string }) => void): () => void;
  onUpdateError(cb: (err: { message: string }) => void): () => void;

  // --- Window controls -----------------------------------------------------
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;

  // --- Navigation from menu/tray ------------------------------------------
  onNavigate(cb: (payload: { tab: string }) => void): () => void;
}

function makeListener(channel: string) {
  return <T>(cb: (payload: T) => void): (() => void) => {
    const handler = (_event: unknown, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler as never);
    return () => ipcRenderer.removeListener(channel, handler as never);
  };
}

const api: ElectronAPI = {
  isDesktop: true,
  platform: process.platform,

  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  isDev: () => ipcRenderer.invoke("app:isDev"),

  notify: (payload) => ipcRenderer.invoke("notify", payload),

  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  skipUpdate: (version) => ipcRenderer.invoke("update:skip", version),
  onUpdateAvailable: makeListener("update:available"),
  onUpdateNotAvailable: makeListener("update:not-available"),
  onUpdateProgress: makeListener("update:progress"),
  onUpdateDownloaded: makeListener("update:downloaded"),
  onUpdateError: makeListener("update:error"),

  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),

  onNavigate: makeListener("navigate"),
};

contextBridge.exposeInMainWorld("electronAPI", api);
