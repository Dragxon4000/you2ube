import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/session";
import { seedProgressionSystem } from "@/db/seed";
import { db } from "@/db";
import { xpTransactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ============================================================================
// Structured logging
// ============================================================================
export type LogLevel = "debug" | "info" | "warn" | "error";

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  switch (level) {
    case "error": console.error(line); break;
    case "warn": console.warn(line); break;
    case "debug": if (process.env.NODE_ENV !== "production") console.debug(line); break;
    default: console.log(line);
  }
}

// ============================================================================
// Standard API error response shape
// ============================================================================
export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorResponse> {
  return NextResponse.json({ error: message, code, details }, { status });
}

// ============================================================================
// Common error codes
// ============================================================================
export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_JSON: "INVALID_JSON",
  INVALID_INPUT: "INVALID_INPUT",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  DUPLICATE_ACTION: "DUPLICATE_ACTION",
  INTERNAL: "INTERNAL",
  CONFLICT: "CONFLICT",
} as const;

// ============================================================================
// Auth wrapper: handles seed + auth in one call.
// ============================================================================
export interface AuthedContext {
  user: SessionUser;
}

/**
 * Run a handler with auth + seed pre-loaded. Handles common failure modes
 * (auth failure, seed failure) with consistent error responses.
 */
export async function withAuth(
  handler: (ctx: AuthedContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    await seedProgressionSystem();
  } catch (err) {
    log("error", "Seed failed", { error: (err as Error).message });
    return apiError(503, ErrorCode.INTERNAL, "Service temporarily unavailable");
  }

  let user: SessionUser | null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    log("error", "getCurrentUser failed", { error: (err as Error).message });
    return apiError(503, ErrorCode.INTERNAL, "Service temporarily unavailable");
  }

  if (!user) {
    return apiError(401, ErrorCode.UNAUTHORIZED, "Not authenticated");
  }

  try {
    return await handler({ user });
  } catch (err) {
    log("error", "Unhandled route error", { error: (err as Error).message, stack: (err as Error).stack });
    return apiError(500, ErrorCode.INTERNAL, "Internal server error");
  }
}

// ============================================================================
// JSON body parsing with error handling
// ============================================================================
export async function parseJsonBody<T = unknown>(req: Request): Promise<
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }
> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return { ok: false, response: apiError(400, ErrorCode.INVALID_JSON, "Invalid JSON body") };
  }
  return { ok: true, data: data as T };
}

// ============================================================================
// Idempotency: if a client retries a POST that previously succeeded,
// return the cached result rather than re-executing (prevents double XP).
// ============================================================================
export interface IdempotencyCheckResult {
  /** True if this exact (user, key) pair was already processed. */
  duplicate: boolean;
  /** The XP amount from the original request (only set when duplicate=true). */
  existingAmount?: number;
  /** True if the key was malformed and rejected — caller should 400. */
  invalid?: boolean;
}

/**
 * Check whether an idempotency key was already used by this user.
 *
 * - Empty/missing key → `{ duplicate: false }` (caller proceeds normally).
 * - Key too short or too long → `{ invalid: true }` (caller should 400).
 * - Key already used → `{ duplicate: true, existingAmount }` (caller replays).
 * - Key not seen → `{ duplicate: false }` (caller proceeds; key stored in
 *   `xp_transactions.idempotency_key` by the caller's insert).
 */
export async function checkIdempotencyKey(
  userId: number,
  idempotencyKey: string | undefined,
): Promise<IdempotencyCheckResult> {
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return { duplicate: false };
  }
  // Idempotency keys must be 8–128 chars of URL-safe characters. Reject
  // malformed keys explicitly so attackers can't bypass the protection by
  // sending a 7-char key and relying on silent fallback.
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return { duplicate: false, invalid: true };
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(idempotencyKey)) {
    return { duplicate: false, invalid: true };
  }
  const existing = await db
    .select({ amount: xpTransactions.amount })
    .from(xpTransactions)
    .where(and(
      eq(xpTransactions.userId, userId),
      eq(xpTransactions.idempotencyKey, idempotencyKey),
    ))
    .then(r => r[0]);
  if (existing) {
    return { duplicate: true, existingAmount: existing.amount };
  }
  return { duplicate: false };
}

// ============================================================================
// Per-action rate limiting (server-side, in-memory, per-process).
// Suitable for single-instance deployments. For multi-instance, swap to Redis.
// ============================================================================
const rateLimitBuckets = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** The configured limit, for inclusion in X-RateLimit-Limit header. */
  limit: number;
}

/**
 * Sliding-window rate limit. Returns `allowed: false` if the user has exceeded
 * `maxRequests` in the last minute.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let hits = rateLimitBuckets.get(key) ?? [];
  // Prune stale entries
  hits = hits.filter(t => t > windowStart);

  const resetAt = hits.length > 0 ? hits[0] + RATE_LIMIT_WINDOW_MS : now + RATE_LIMIT_WINDOW_MS;

  if (hits.length >= maxRequests) {
    rateLimitBuckets.set(key, hits);
    return { allowed: false, remaining: 0, resetAt, limit: maxRequests };
  }
  hits.push(now);
  rateLimitBuckets.set(key, hits);
  return { allowed: true, remaining: maxRequests - hits.length, resetAt, limit: maxRequests };
}

/**
 * Apply standard rate-limit headers to a NextResponse. Uses the IETF
 * RateLimit Headers draft (draft-ietf-httpapi-ratelimit-headers):
 *   - `RateLimit-Limit`     — max requests in the window
 *   - `RateLimit-Remaining` — requests left in the current window
 *   - `RateLimit-Reset`     — seconds until the window resets
 *
 * Also sets the legacy `X-RateLimit-*` variants for older clients.
 */
export function applyRateLimitHeaders<T>(
  response: NextResponse<T>,
  rl: RateLimitResult,
): NextResponse<T> {
  const resetSeconds = Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000));
  response.headers.set("RateLimit-Limit", String(rl.limit));
  response.headers.set("RateLimit-Remaining", String(rl.remaining));
  response.headers.set("RateLimit-Reset", String(resetSeconds));
  response.headers.set("X-RateLimit-Limit", String(rl.limit));
  response.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  response.headers.set("X-RateLimit-Reset", String(resetSeconds));
  return response;
}

// Periodically clear stale buckets to prevent unbounded memory growth.
if (typeof globalThis !== "undefined") {
  const g = globalThis as typeof globalThis & { __you2ubeRateLimitCleanup?: NodeJS.Timeout };
  if (!g.__you2ubeRateLimitCleanup) {
    g.__you2ubeRateLimitCleanup = setInterval(() => {
      const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
      for (const [key, hits] of rateLimitBuckets.entries()) {
        const fresh = hits.filter(t => t > cutoff);
        if (fresh.length === 0) rateLimitBuckets.delete(key);
        else rateLimitBuckets.set(key, fresh);
      }
    }, 60_000);
    // Don't keep the process alive just for this timer.
    if (typeof g.__you2ubeRateLimitCleanup.unref === "function") {
      g.__you2ubeRateLimitCleanup.unref();
    }
  }
}

// ============================================================================
// Input validators
// ============================================================================
export function isPositiveInt(v: unknown, max = 1_000_000): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;
}

export function isNonNegativeInt(v: unknown, max = 1_000_000): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

export function isNonEmptyString(v: unknown, maxLen = 1000): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,30}$/;

/**
 * Detect Postgres unique-constraint violations specifically on the
 * idempotency-key index (`xp_tx_idem_key_idx`). Postgres error code
 * `23505` = unique_violation. We also check the error message to make
 * sure it's the idempotency index, not some other unique constraint.
 *
 * This lets action routes gracefully convert race-condition collisions
 * into the correct `idempotentReplay: true` response instead of a 500.
 */
/**
 * Unwrap an error to find the underlying Postgres error. Drizzle wraps
 * the original pg error, typically in a `cause` property.
 */
function unwrapPgError(err: unknown): { code?: string; message?: string; constraint?: string } | null {
  if (!err || typeof err !== "object") return null;
  let current: unknown = err;
  for (let i = 0; i < 5; i++) {
    if (!current || typeof current !== "object") return null;
    const e = current as { code?: string; message?: string; constraint?: string; cause?: unknown };
    if (e.code && e.code.length === 5 && /^\d{2}[A-Z0-9]{3}$/.test(e.code)) {
      // Looks like a Postgres SQLSTATE code (e.g., "23505").
      return { code: e.code, message: e.message, constraint: e.constraint };
    }
    current = e.cause;
  }
  // Fallback: return the top-level error's message so callers can still
  // pattern-match on it (e.g., check for "duplicate key" text).
  const top = err as { message?: string };
  return { code: undefined, message: top.message, constraint: undefined };
}

export function isIdempotencyKeyCollision(err: unknown): boolean {
  const pg = unwrapPgError(err);
  if (!pg) return false;
  // 23505 = unique_violation
  if (pg.code === "23505") {
    const constraint = pg.constraint ?? "";
    const message = pg.message ?? "";
    return constraint.includes("idem") || message.includes("idem") || constraint.includes("xp_tx");
  }
  // Fallback: pattern-match on the message when the SQLSTATE is unavailable
  // (some Drizzle versions don't forward `code` from pg).
  const msg = (pg.message ?? "").toLowerCase();
  return (msg.includes("duplicate key") || msg.includes("unique constraint")) &&
         (msg.includes("xp_tx_idem_key_idx") || msg.includes("idempotency"));
}
