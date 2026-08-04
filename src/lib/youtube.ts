/**
 * YouTube Data API v3 wrapper.
 * Reads YOUTUBE_API_KEY from process.env (server-side only).
 * Falls back gracefully if no API key is set.
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
}

export interface YouTubeSearchResult {
  videos: YouTubeVideo[];
  nextPageToken?: string;
  totalResults: number;
}

function getApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY ?? null;
}

/**
 * Search YouTube for videos matching a query.
 */
export async function searchYouTube(
  query: string,
  maxResults = 12,
  pageToken?: string,
): Promise<YouTubeSearchResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { videos: [], totalResults: 0 };
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(maxResults),
    key: apiKey,
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`, {
    next: { revalidate: 300 }, // cache for 5 min
  });

  if (!res.ok) {
    console.error("[youtube] search failed:", res.status, await res.text());
    return { videos: [], totalResults: 0 };
  }

  const data = await res.json();

  const videoIds = (data.items ?? [])
    .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
    .filter(Boolean)
    .join(",");

  // Fetch additional details (duration, view counts)
  let details: Record<string, { duration?: string; viewCount?: string }> = {};
  if (videoIds) {
    const detailRes = await fetch(
      `${YOUTUBE_API_BASE}/videos?${new URLSearchParams({
        part: "contentDetails,statistics",
        id: videoIds,
        key: apiKey,
      })}`,
    );
    if (detailRes.ok) {
      const detailData = await detailRes.json();
      for (const item of detailData.items ?? []) {
        details[item.id] = {
          duration: item.contentDetails?.duration,
          viewCount: item.statistics?.viewCount,
        };
      }
    }
  }

  const videos: YouTubeVideo[] = (data.items ?? []).map(
    (item: {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
        publishedAt?: string;
      };
    }) => {
      const videoId = item.id?.videoId ?? "";
      const detail = details[videoId];
      return {
        id: videoId,
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? "",
        channelTitle: item.snippet?.channelTitle ?? "",
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          "",
        publishedAt: item.snippet?.publishedAt ?? "",
        duration: detail?.duration,
        viewCount: detail?.viewCount,
      };
    },
  );

  return {
    videos,
    nextPageToken: data.nextPageToken,
    totalResults: data.pageInfo?.totalResults ?? 0,
  };
}

/**
 * Get details for a single YouTube video by ID.
 */
export async function getVideoDetails(videoId: string): Promise<YouTubeVideo | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const res = await fetch(
    `${YOUTUBE_API_BASE}/videos?${new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      id: videoId,
      key: apiKey,
    })}`,
    { next: { revalidate: 600 } },
  );

  if (!res.ok) {
    console.error("[youtube] video details failed:", res.status);
    return null;
  }

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;

  return {
    id: item.id,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    thumbnailUrl:
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      "",
    publishedAt: item.snippet?.publishedAt ?? "",
    duration: item.contentDetails?.duration,
    viewCount: item.statistics?.viewCount,
  };
}

/**
 * Get trending/popular videos.
 */
export async function getTrendingVideos(maxResults = 12): Promise<YouTubeVideo[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const res = await fetch(
    `${YOUTUBE_API_BASE}/videos?${new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      chart: "mostPopular",
      regionCode: "US",
      maxResults: String(maxResults),
      key: apiKey,
    })}`,
    { next: { revalidate: 600 } },
  );

  if (!res.ok) {
    console.error("[youtube] trending failed:", res.status);
    return [];
  }

  const data = await res.json();
  return (data.items ?? []).map(
    (item: {
      id?: string;
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
        publishedAt?: string;
      };
      contentDetails?: { duration?: string };
      statistics?: { viewCount?: string };
    }) => ({
      id: item.id ?? "",
      title: item.snippet?.title ?? "",
      description: item.snippet?.description ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      thumbnailUrl:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        "",
      publishedAt: item.snippet?.publishedAt ?? "",
      duration: item.contentDetails?.duration,
      viewCount: item.statistics?.viewCount,
    }),
  );
}

/**
 * Parse ISO 8601 duration (PT1H2M3S) to seconds.
 */
export function parseDuration(iso: string | undefined | null): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format seconds to human-readable duration (1:23:45 or 23:45).
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0:00";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format view count to human-readable string.
 */
export function formatViewCount(count: string | undefined): string {
  if (!count) return "";
  const n = parseInt(count, 10);
  if (isNaN(n)) return "";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B views`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}
