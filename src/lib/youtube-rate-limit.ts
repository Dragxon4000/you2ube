import "server-only";

const SEARCH_WINDOW_MS = 60_000;
const MAX_SEARCHES_PER_WINDOW = 6;

type SearchRateLimitStore = Map<string, number[]>;

const globalForRateLimit = globalThis as typeof globalThis & {
  __you2ubeSearchRateLimitStore?: SearchRateLimitStore;
};

const searchRateLimitStore =
  globalForRateLimit.__you2ubeSearchRateLimitStore ?? new Map<string, number[]>();

globalForRateLimit.__you2ubeSearchRateLimitStore = searchRateLimitStore;

/**
 * Enforces a best-effort, per-user/IP limit before a search.list call.
 * It is intentionally local-memory only; production multi-instance deployments
 * should replace it with a shared rate-limit store such as Redis.
 */
export function checkYouTubeSearchRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const threshold = now - SEARCH_WINDOW_MS;
  const previous = (searchRateLimitStore.get(key) ?? []).filter((timestamp) => timestamp > threshold);

  if (previous.length >= MAX_SEARCHES_PER_WINDOW) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((previous[0] + SEARCH_WINDOW_MS - now) / 1000),
    );
    searchRateLimitStore.set(key, previous);
    return { allowed: false, retryAfterSeconds };
  }

  previous.push(now);
  searchRateLimitStore.set(key, previous);

  // Opportunistic cleanup keeps the unbounded map from accumulating stale IPs.
  if (searchRateLimitStore.size > 500) {
    for (const [storedKey, timestamps] of searchRateLimitStore) {
      const active = timestamps.filter((timestamp) => timestamp > threshold);
      if (active.length === 0) searchRateLimitStore.delete(storedKey);
      else searchRateLimitStore.set(storedKey, active);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function getRequestRateLimitKey(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
  return `ip:${ip}`;
}
