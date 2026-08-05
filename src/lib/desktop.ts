"use client";

/**
 * Desktop bridge for the renderer process.
 *
 * Detects whether the app is running inside the Electron desktop client
 * (by checking `window.electronAPI`, which is only exposed by the preload
 * script). Provides unified helpers that use native features when available
 * and fall back to web equivalents otherwise.
 *
 * The web build stays fully functional — `isDesktop()` simply returns false.
 */

import { useEffect, useState, useRef } from "react";

export interface ElectronAPI {
  isDesktop: true;
  platform: NodeJS.Platform;
  getVersion(): Promise<string>;
  isDev(): Promise<boolean>;
  notify(payload: { title: string; body: string; silent?: boolean }): Promise<{ supported: boolean }>;
  checkForUpdates(): Promise<{ ok: boolean; version?: string; error?: string }>;
  installUpdate(): Promise<void>;
  skipUpdate(version: string): Promise<void>;
  onUpdateAvailable(cb: (info: { version: string; releaseNotes: string }) => void): () => void;
  onUpdateNotAvailable(cb: () => void): () => void;
  onUpdateProgress(cb: (p: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void): () => void;
  onUpdateDownloaded(cb: (info: { version: string }) => void): () => void;
  onUpdateError(cb: (err: { message: string }) => void): () => void;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  onNavigate(cb: (payload: { tab: string }) => void): () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/** True when running inside the you2ube Electron client. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI?.isDesktop;
}

/** Returns the exposed Electron API, or null on the web. */
export function getDesktopAPI(): ElectronAPI | null {
  if (typeof window === "undefined") return null;
  return window.electronAPI ?? null;
}

/**
 * Show a notification. Uses native OS notifications inside the desktop
 * client; falls back to the browser Notification API on the web (with
 * permission request).
 *
 * Returns true if the notification was shown by any channel.
 */
export async function showNotification(payload: {
  title: string;
  body: string;
  silent?: boolean;
}): Promise<boolean> {
  const api = getDesktopAPI();
  if (api) {
    const result = await api.notify(payload);
    return result.supported;
  }

  // Web fallback.
  if (typeof window === "undefined" || typeof Notification === "undefined") return false;
  try {
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    new Notification(payload.title, { body: payload.body, silent: payload.silent });
    return true;
  } catch {
    return false;
  }
}

/**
 * React hook: subscribe to main-process navigation events (from the
 * application menu and system tray). Calls `onChange(tab)` whenever the
 * user triggers a "go to tab" action outside the renderer.
 *
 * Uses a ref for the callback so that inline arrow functions in callers
 * don't cause the effect to re-subscribe on every render.
 */
export function useDesktopNavigation(onChange: (tab: string) => void) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const api = getDesktopAPI();
    if (!api) return;
    return api.onNavigate((payload) => onChangeRef.current(payload.tab));
    // Empty deps: subscribe once on mount, unsubscribe on unmount. The ref
    // ensures we always call the latest onChange without resubscribing.
  }, []);
}

/**
 * React hook: subscribe to auto-update lifecycle events. Returns the
 * current update state — used to render an update banner.
 */
export interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "downloaded" | "up-to-date" | "error";
  version?: string;
  releaseNotes?: string;
  progress?: number;
  error?: string;
}

export function useDesktopUpdater(): UpdateState & {
  check(): Promise<void>;
  install(): Promise<void>;
  skip(): Promise<void>;
} {
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    const api = getDesktopAPI();
    if (!api) return;

    const unsubs: Array<() => void> = [];
    unsubs.push(api.onUpdateAvailable((info) => {
      setState({ status: "available", version: info.version, releaseNotes: info.releaseNotes });
    }));
    unsubs.push(api.onUpdateNotAvailable(() => {
      setState({ status: "up-to-date" });
    }));
    unsubs.push(api.onUpdateProgress((p) => {
      setState((s) => ({ ...s, status: "downloading", progress: Math.round(p.percent) }));
    }));
    unsubs.push(api.onUpdateDownloaded((info) => {
      setState((s) => ({ ...s, status: "downloaded", version: info.version }));
    }));
    unsubs.push(api.onUpdateError((err) => {
      setState({ status: "error", error: err.message });
    }));

    return () => unsubs.forEach((u) => u());
  }, []);

  return {
    ...state,
    check: async () => {
      const api = getDesktopAPI();
      if (!api) return;
      setState({ status: "checking" });
      const result = await api.checkForUpdates();
      if (!result.ok) setState({ status: "error", error: result.error });
    },
    install: async () => {
      const api = getDesktopAPI();
      if (!api) return;
      await api.installUpdate();
    },
    skip: async () => {
      const api = getDesktopAPI();
      if (!api || !state.version) return;
      await api.skipUpdate(state.version);
      setState({ status: "idle" });
    },
  };
}

/**
 * Returns a user-friendly label for the current platform, for display in UI.
 */
export function getPlatformLabel(): string {
  const api = getDesktopAPI();
  if (!api) return "Web";
  switch (api.platform) {
    case "darwin": return "macOS";
    case "win32": return "Windows";
    case "linux": return "Linux";
    default: return api.platform;
  }
}
