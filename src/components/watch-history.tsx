"use client";

import Link from "next/link";

type WatchSessionData = {
  id: string;
  videoId: string;
  videoTitle: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  watchedSeconds: number;
  resumePositionSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  lastWatchedAt: string;
};

function formatSeconds(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "recently";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

export function WatchHistory({ sessions }: { sessions: WatchSessionData[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((session) => {
        const progress = session.durationSeconds
          ? Math.min(100, Math.round((session.watchedSeconds / session.durationSeconds) * 100))
          : 0;
        const canContinue = !session.completed && session.resumePositionSeconds > 3;

        return (
          <article
            key={session.id}
            className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:border-slate-700"
          >
            <Link href={`/watch/${session.videoId}`} className="group block">
              <div className="relative aspect-video bg-slate-800">
                {session.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                )}
                {session.completed && (
                  <span className="absolute right-2 top-2 rounded bg-emerald-600/90 px-1.5 py-0.5 text-xs font-medium text-white">
                    ✓ Completed
                  </span>
                )}
                {session.durationSeconds && session.durationSeconds > 0 && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                    {formatSeconds(session.durationSeconds)}
                  </span>
                )}
                {session.durationSeconds && session.durationSeconds > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700">
                    <div className="h-full bg-red-500" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-white">{session.videoTitle}</h3>
                {session.channelName && <p className="mt-1 text-xs text-slate-400">{session.channelName}</p>}
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Watched {formatSeconds(session.watchedSeconds)}</span>
                  <span>{timeAgo(session.lastWatchedAt)}</span>
                </div>
                <span className="mt-3 block text-sm font-semibold text-red-400 group-hover:text-red-300">
                  {canContinue
                    ? `Continue from ${formatSeconds(session.resumePositionSeconds)}`
                    : session.completed
                      ? "Watch again"
                      : "Play in you2ube"}
                </span>
              </div>
            </Link>
          </article>
        );
      })}
    </div>
  );
}
