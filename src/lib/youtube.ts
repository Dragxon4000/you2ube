import "server-only";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

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

export type YouTubeApiErrorCode =
  | "not_configured"
  | "quota_exceeded"
  | "rate_limited"
  | "invalid_request"
  | "not_found"
  | "upstream_error";

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: YouTubeApiErrorCode,
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

type YouTubeErrorPayload = {
  error?: {
    errors?: Array<{ reason?: string }>;
    message?: string;
  };
};

type SearchItem = {
  id?: { videoId?: string };
  snippet?: RawSnippet;
};

type VideoItem = {
  id?: string;
  snippet?: RawSnippet;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};

type RawSnippet = {
  title?: string;
  description?: string;
  channelTitle?: string;
  thumbnails?: {
    high?: { url?: string };
    medium?: { url?: string };
    default?: { url?: string };
  };
  publishedAt?: string;
};

function getApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY ?? null;
}

export function isValidYouTubeVideoId(videoId: string): boolean {
  return VIDEO_ID_PATTERN.test(videoId);
}

export function isYouTubeApiError(error: unknown): error is YouTubeApiError {
  return error instanceof YouTubeApiError;
}

function mapYouTubeError(status: number, payload: YouTubeErrorPayload): YouTubeApiError {
  const reason = payload.error?.errors?.[0]?.reason;

  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return new YouTubeApiError(
      "YouTube is temporarily unavailable because this application's API quota has been reached.",
      429,
      "quota_exceeded",
    );
  }

  if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new YouTubeApiError(
      "YouTube is receiving too many requests. Please wait a moment and try again.",
      429,
      "rate_limited",
    );
  }

  if (status === 400) {
    return new YouTubeApiError("The YouTube request was invalid.", 400, "invalid_request");
  }

  if (status === 404) {
    return new YouTubeApiError("The requested YouTube video was not found.", 404, "not_found");
  }

  return new YouTubeApiError(
    "YouTube metadata is temporarily unavailable. Please try again later.",
    502,
    "upstream_error",
  );
}

async function requestYouTube<T>(
  path: string,
  params: Record<string, string>,
  revalidateSeconds: number,
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new YouTubeApiError(
      "YouTube integration is not configured. Set YOUTUBE_API_KEY on the server.",
      503,
      "not_configured",
    );
  }

  const query = new URLSearchParams({ ...params, key: apiKey });

  let response: Response;
  try {
    response = await fetch(`${YOUTUBE_API_BASE}/${path}?${query.toString()}`, {
      next: { revalidate: revalidateSeconds },
    });
  } catch {
    throw new YouTubeApiError(
      "YouTube metadata is temporarily unavailable. Please try again later.",
      502,
      "upstream_error",
    );
  }

  if (!response.ok) {
    let payload: YouTubeErrorPayload = {};
    try {
      payload = (await response.json()) as YouTubeErrorPayload;
    } catch {
      // Safe generic error mapping below when the upstream body is unavailable.
    }
    throw mapYouTubeError(response.status, payload);
  }

  return response.json() as Promise<T>;
}

function mapVideo(item: VideoItem, fallbackId = ""): YouTubeVideo {
  const snippet = item.snippet;
  return {
    id: item.id ?? fallbackId,
    title: snippet?.title ?? "Untitled video",
    description: snippet?.description ?? "",
    channelTitle: snippet?.channelTitle ?? "Unknown channel",
    thumbnailUrl:
      snippet?.thumbnails?.high?.url ??
      snippet?.thumbnails?.medium?.url ??
      snippet?.thumbnails?.default?.url ??
      "",
    publishedAt: snippet?.publishedAt ?? "",
    duration: item.contentDetails?.duration,
    viewCount: item.statistics?.viewCount,
  };
}

/**
 * Searches videos using the official YouTube Data API v3 search.list endpoint.
 * The search request is cached for five minutes; details are fetched in a
 * single batched videos.list request rather than per result.
 */
export async function searchYouTube(
  query: string,
  maxResults = 12,
  pageToken?: string,
): Promise<YouTubeSearchResult> {
  const searchResponse = await requestYouTube<{
    items?: SearchItem[];
    nextPageToken?: string;
    pageInfo?: { totalResults?: number };
  }>(
    "search",
    {
      part: "snippet",
      q: query,
      type: "video",
      maxResults: String(Math.min(Math.max(maxResults, 1), 25)),
      ...(pageToken ? { pageToken } : {}),
    },
    300,
  );

  const searchItems = searchResponse.items ?? [];
  const videoIds = searchItems
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id && isValidYouTubeVideoId(id)));

  const detailById: Record<string, VideoItem> = {};
  if (videoIds.length > 0) {
    const detailsResponse = await requestYouTube<{ items?: VideoItem[] }>(
      "videos",
      {
        part: "snippet,contentDetails,statistics",
        id: videoIds.join(","),
      },
      300,
    );

    for (const item of detailsResponse.items ?? []) {
      if (item.id) detailById[item.id] = item;
    }
  }

  const videos = videoIds.map((id) => {
    const detail = detailById[id];
    if (detail) return mapVideo(detail, id);

    const searchItem = searchItems.find((item) => item.id?.videoId === id);
    return mapVideo({ id, snippet: searchItem?.snippet }, id);
  });

  return {
    videos,
    nextPageToken: searchResponse.nextPageToken,
    totalResults: searchResponse.pageInfo?.totalResults ?? 0,
  };
}

/** Fetches metadata for a known video ID via the low-cost videos.list endpoint. */
export async function getVideoDetails(videoId: string): Promise<YouTubeVideo | null> {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new YouTubeApiError("Invalid YouTube video ID.", 400, "invalid_request");
  }

  const response = await requestYouTube<{ items?: VideoItem[] }>(
    "videos",
    {
      part: "snippet,contentDetails,statistics",
      id: videoId,
    },
    600,
  );

  const item = response.items?.[0];
  return item ? mapVideo(item, videoId) : null;
}

/** Fetches popular videos via the official videos.list chart endpoint. */
export async function getTrendingVideos(maxResults = 12): Promise<YouTubeVideo[]> {
  const response = await requestYouTube<{ items?: VideoItem[] }>(
    "videos",
    {
      part: "snippet,contentDetails,statistics",
      chart: "mostPopular",
      regionCode: "US",
      maxResults: String(Math.min(Math.max(maxResults, 1), 25)),
    },
    600,
  );

  return (response.items ?? []).map((item) => mapVideo(item));
}

/** Parse an ISO 8601 YouTube duration (PT1H2M3S) to seconds. */
export function parseDuration(iso: string | undefined | null): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/** Format seconds as a human-readable duration. */
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

/** Format a raw YouTube view count for display. */
export function formatViewCount(count: string | undefined): string {
  if (!count) return "";
  const value = parseInt(count, 10);
  if (Number.isNaN(value)) return "";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B views`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M views`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K views`;
  return `${value} views`;
}
