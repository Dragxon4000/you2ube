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
export async function checkIdempotencyKey(
  userId: number,
  idempotencyKey: string | undefined,
): Promise<{ duplicate: boolean; existingAmount?: number }> {
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return { duplicate: false };
  }
  // Idempotency keys must look like random strings (prevent accidental collisions).
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return { duplicate: false };
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
    return { allowed: false, remaining: 0, resetAt };
  }
  hits.push(now);
  rateLimitBuckets.set(key, hits);
  return { allowed: true, remaining: maxRequests - hits.length, resetAt };
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
