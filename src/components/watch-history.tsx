"use client";

interface WatchSessionData {
  id: string;
  videoId: string;
  videoTitle: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  watchedSeconds: number;
  durationSeconds: number | null;
  completed: boolean;
  lastWatchedAt: string;
}

function formatSeconds(s: number): string {
  if (s <= 0) return "0:00";
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
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

        return (
          <a
            key={session.id}
            href={`https://www.youtube.com/watch?v=${session.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden transition hover:border-slate-700"
          >
            <div className="relative aspect-video bg-slate-800">
              {session.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.thumbnailUrl}
                  alt={session.videoTitle}
                  className="w-full h-full object-cover"
                />
              )}
              {session.completed && (
                <span className="absolute top-2 right-2 rounded bg-emerald-600/90 px-1.5 py-0.5 text-xs font-medium text-white">
                  ✓ Completed
                </span>
              )}
              {session.durationSeconds && session.durationSeconds > 0 && (
                <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                  {formatSeconds(session.durationSeconds)}
                </span>
              )}
              {/* Progress bar at bottom of thumbnail */}
              {session.durationSeconds && session.durationSeconds > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug">
                {session.videoTitle}
              </h3>
              {session.channelName && (
                <p className="mt-1 text-xs text-slate-400">{session.channelName}</p>
              )}
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>Watched {formatSeconds(session.watchedSeconds)}</span>
                <span>{timeAgo(session.lastWatchedAt)}</span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
