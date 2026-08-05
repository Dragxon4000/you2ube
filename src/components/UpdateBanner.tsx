"use client";

import { useDesktopUpdater } from "@/lib/desktop";

/**
 * Update banner — only renders when running in the desktop client and an
 * update is available / downloading / downloaded. On the web it renders
 * nothing (zero cost).
 */
export function UpdateBanner() {
  const update = useDesktopUpdater();

  if (update.status === "idle" || update.status === "checking" || update.status === "up-to-date") {
    return null;
  }

  if (update.status === "error") {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-red-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1">
            <div className="font-semibold text-red-700">Update check failed</div>
            <div className="text-xs text-slate-600 mt-1">{update.error ?? "Unknown error"}</div>
          </div>
          <button
            onClick={() => update.check()}
            className="rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (update.status === "available") {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-indigo-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🆕</div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900">
              you2ube v{update.version} is available
            </div>
            <div className="text-xs text-slate-600 mt-1">Downloading in the background…</div>
          </div>
          <button
            onClick={() => update.skip()}
            className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (update.status === "downloading") {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-indigo-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⬇️</div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900">Downloading v{update.version}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: `${update.progress ?? 0}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">{update.progress ?? 0}%</div>
          </div>
        </div>
      </div>
    );
  }

  if (update.status === "downloaded") {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-green-200 bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl">✅</div>
          <div className="flex-1">
            <div className="font-semibold text-slate-900">Update ready</div>
            <div className="text-xs text-slate-600 mt-1">
              you2ube v{update.version} is installed. Restart to apply.
            </div>
          </div>
          <button
            onClick={() => update.install()}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
          >
            Restart
          </button>
        </div>
      </div>
    );
  }

  return null;
}
