"use client";

import { useState, type FormEvent } from "react";

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
}

function formatDuration(iso: string | undefined): string {
  if (!iso) return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatViewCount(count: string | undefined): string {
  if (!count) return "";
  const n = parseInt(count, 10);
  if (isNaN(n)) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function parseDurationToSeconds(iso: string | undefined): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] ?? "0", 10) * 3600 + parseInt(match[2] ?? "0", 10) * 60 + parseInt(match[3] ?? "0", 10);
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
  return `${Math.floor(seconds / 31536000)}y ago`;
}

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchingId, setWatchingId] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed.");
        setResults([]);
        return;
      }
      setResults(data.videos ?? []);
      if ((data.videos ?? []).length === 0) {
        setError("No videos found. Make sure YOUTUBE_API_KEY is configured.");
      }
    } catch {
      setError("Failed to search. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleWatch(video: YouTubeVideo) {
    setWatchingId(video.id);
    try {
      await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          videoTitle: video.title,
          channelName: video.channelTitle,
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: parseDurationToSeconds(video.duration),
          watchedSeconds: parseDurationToSeconds(video.duration),
        }),
      });
    } catch {
      // Silently fail — the video still plays
    }
    // Open video in new tab
    window.open(`https://www.youtube.com/watch?v=${video.id}`, "_blank");
    setWatchingId(null);
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube videos..."
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-xl bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-slate-900 border border-slate-800 px-4 py-3 text-sm text-slate-400">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((video) => (
            <div
              key={video.id}
              className="group rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden transition hover:border-slate-700"
            >
              <div className="relative aspect-video bg-slate-800">
                {video.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                )}
                {video.duration && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                    {formatDuration(video.duration)}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug">
                  {video.title}
                </h3>
                <p className="mt-1 text-xs text-slate-400">{video.channelTitle}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  {video.viewCount && <span>{formatViewCount(video.viewCount)}</span>}
                  {video.publishedAt && <span>• {timeAgo(video.publishedAt)}</span>}
                </div>
                <button
                  onClick={() => handleWatch(video)}
                  disabled={watchingId === video.id}
                  className="mt-3 w-full rounded-lg bg-red-600/10 border border-red-600/20 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-600/20 disabled:opacity-60"
                >
                  {watchingId === video.id ? "Opening…" : "▶ Watch & Earn XP"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p className="mt-6 text-center text-sm text-slate-500">
          No results found.
        </p>
      )}
    </div>
  );
}
