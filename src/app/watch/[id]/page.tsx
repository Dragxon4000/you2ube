import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import {
  formatDuration,
  formatViewCount,
  getVideoDetails,
  isYouTubeApiError,
  isValidYouTubeVideoId,
  parseDuration,
} from "@/lib/youtube";
import { getWatchSession } from "@/lib/watch-sessions";
import { YouTubePlayer } from "@/components/youtube-player";

export const dynamic = "force-dynamic";

function formatPublishedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/watch/${id}`)}`);
  }

  if (!isValidYouTubeVideoId(id)) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-2xl font-bold text-white">Invalid video link</h1>
          <p className="mt-2 text-sm text-slate-400">This does not look like a valid YouTube video ID.</p>
          <Link href="/dashboard" className="mt-5 inline-block text-sm font-semibold text-red-400 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  try {
    const [video, session] = await Promise.all([
      getVideoDetails(id),
      getWatchSession(user.id, id),
    ]);

    if (!video) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12">
          <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <h1 className="text-2xl font-bold text-white">Video not found</h1>
            <p className="mt-2 text-sm text-slate-400">The video may be private, removed, or unavailable.</p>
            <Link href="/dashboard" className="mt-5 inline-block text-sm font-semibold text-red-400 hover:underline">
              Back to dashboard
            </Link>
          </div>
        </main>
      );
    }

    const durationSeconds = parseDuration(video.duration);

    return (
      <main className="min-h-screen bg-slate-950">
        <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-1.5">
            <svg className="h-7 w-7 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
              <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white" />
            </svg>
            <span className="text-lg font-bold text-white">you2ube</span>
          </Link>
          <Link href="/dashboard" className="text-sm font-medium text-slate-400 hover:text-white">
            Dashboard
          </Link>
        </nav>

        <div className="mx-auto max-w-6xl px-6 py-8">
          <YouTubePlayer
            video={{
              id: video.id,
              title: video.title,
              channelTitle: video.channelTitle,
              thumbnailUrl: video.thumbnailUrl,
            }}
            durationSeconds={durationSeconds}
            resumePositionSeconds={session?.resumePositionSeconds ?? 0}
            completed={session?.completed ?? false}
          />

          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-white sm:text-2xl">{video.title}</h1>
                <p className="mt-2 text-sm font-medium text-slate-300">{video.channelTitle}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {video.viewCount && <span>{formatViewCount(video.viewCount)}</span>}
                  {durationSeconds > 0 && <span>{formatDuration(durationSeconds)}</span>}
                  {video.publishedAt && <span>{formatPublishedDate(video.publishedAt)}</span>}
                </div>
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${video.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-sm font-semibold text-red-400 hover:text-red-300 hover:underline"
              >
                View on YouTube ↗
              </a>
            </div>
            {video.description && (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-400">
                {video.description}
              </p>
            )}
          </section>

          <p className="mt-5 text-center text-xs text-slate-500">
            Video playback is provided directly by the official YouTube embedded player. you2ube does not download or proxy video content.
          </p>
        </div>
      </main>
    );
  } catch (error) {
    const message = isYouTubeApiError(error)
      ? error.message
      : "YouTube metadata is temporarily unavailable. Please try again later.";

    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12">
        <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-2xl font-bold text-white">Unable to load video</h1>
          <p className="mt-2 text-sm text-slate-400">{message}</p>
          <Link href="/dashboard" className="mt-5 inline-block text-sm font-semibold text-red-400 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }
}
