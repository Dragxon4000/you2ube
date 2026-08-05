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
function makeListener(channel) {
    return (cb) => {
        const handler = (_event, payload) => cb(payload);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    };
}
const api = {
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
