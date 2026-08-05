"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type YouTubeVideo = {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
};

function formatDuration(iso: string | undefined): string {
  if (!iso) return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatViewCount(count: string | undefined): string {
  if (!count) return "";
  const value = parseInt(count, 10);
  if (Number.isNaN(value)) return "";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B views`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M views`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K views`;
  return `${value} views`;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "";
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

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(normalizedQuery)}`);
      const data = await response.json();
      if (!response.ok) {
        setResults([]);
        setError(data.error ?? "YouTube search is temporarily unavailable.");
        return;
      }

      const videos = (data.videos ?? []) as YouTubeVideo[];
      setResults(videos);
      if (videos.length === 0) {
        setError("No matching videos were found.");
      }
    } catch {
      setResults([]);
      setError("YouTube search is temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={200}
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
      <p className="mt-2 text-xs text-slate-500">
        Search results are powered by the official YouTube Data API. Please avoid rapid repeat searches.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-400">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((video) => (
            <article
              key={video.id}
              className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:border-slate-700"
            >
              <div className="relative aspect-video bg-slate-800">
                {video.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {video.duration && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                    {formatDuration(video.duration)}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-white">{video.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{video.channelTitle}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {video.viewCount && <span>{formatViewCount(video.viewCount)}</span>}
                  {video.publishedAt && <span>{timeAgo(video.publishedAt)}</span>}
                </div>
                <Link
                  href={`/watch/${video.id}`}
                  className="mt-3 block w-full rounded-lg border border-red-600/20 bg-red-600/10 px-3 py-2 text-center text-sm font-medium text-red-400 transition hover:bg-red-600/20"
                >
                  ▶ Play in you2ube
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p className="mt-6 text-center text-sm text-slate-500">No results found.</p>
      )}
    </div>
  );
}
