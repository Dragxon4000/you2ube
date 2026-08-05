import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { log } from "@/lib/api-helpers";

const SESSION_COOKIE = "you2ube_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const USERNAME_PREFIX = "user_";
const USERNAME_SUFFIX_BYTES = 8; // 16 hex chars = 1.8e19 possibilities — collision-safe

// ============================================================================
// Rate limit session creation to prevent abuse.
//
// Each IP can create at most SESSION_CREATE_LIMIT sessions per window.
// This prevents a single attacker from spamming the users table with
// millions of rows.
//
// NOTE: This is in-memory and single-process. For multi-instance deployments,
// swap this Map for Redis (same pattern as checkRateLimit in api-helpers.ts).
// ============================================================================
const SESSION_CREATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SESSION_CREATE_LIMIT = 20;
const sessionCreateBuckets = new Map<string, number[]>();

async function getIpFromRequest(): Promise<string> {
  // Read the client IP from standard proxy headers.
  // In production behind a reverse proxy (nginx, Cloudflare, Vercel), the
  // proxy sets X-Forwarded-For or X-Real-IP. We trust the first IP in the
  // chain (the client) because the proxy overwrites it.
  //
  // SECURITY: Only trust these headers if you control the proxy. If your
  // app is directly exposed to the internet, attackers can spoof these
  // headers. In that case, configure your proxy to set a custom header
  // (e.g., X-Client-IP) and read that instead.
  try {
    const headersList = await headers();
    const forwarded = headersList.get("x-forwarded-for");
    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
      // Take the first one (the original client).
      const first = forwarded.split(",")[0].trim();
      if (first) return first;
    }
    const realIp = headersList.get("x-real-ip");
    if (realIp) return realIp;
    // Fallback: use a stable identifier so the rate limiter still works
    // (even if imperfectly) in dev/test environments without a proxy.
    return process.env.NODE_ENV === "test" ? "test-ip" : "dev-fallback";
  } catch {
    // headers() can throw if called outside a request context (e.g., in
    // server components during build). Fall back to a stable identifier.
    return "unknown-context";
  }
}

async function canCreateSession(): Promise<boolean> {
  const ip = await getIpFromRequest();
  const now = Date.now();
  const windowStart = now - SESSION_CREATE_WINDOW_MS;

  let hits = sessionCreateBuckets.get(ip) ?? [];
  hits = hits.filter(t => t > windowStart);

  if (hits.length >= SESSION_CREATE_LIMIT) {
    sessionCreateBuckets.set(ip, hits);
    return false;
  }
  hits.push(now);
  sessionCreateBuckets.set(ip, hits);
  return true;
}

// Periodically clear stale session-create buckets.
if (typeof globalThis !== "undefined") {
  const g = globalThis as typeof globalThis & { __you2ubeSessionCleanup?: NodeJS.Timeout };
  if (!g.__you2ubeSessionCleanup) {
    g.__you2ubeSessionCleanup = setInterval(() => {
      const cutoff = Date.now() - SESSION_CREATE_WINDOW_MS;
      for (const [key, hits] of sessionCreateBuckets.entries()) {
        const fresh = hits.filter(t => t > cutoff);
        if (fresh.length === 0) sessionCreateBuckets.delete(key);
        else sessionCreateBuckets.set(key, fresh);
      }
    }, 60_000);
    if (typeof g.__you2ubeSessionCleanup.unref === "function") {
      g.__you2ubeSessionCleanup.unref();
    }
  }
}

/**
 * Demo session abstraction. Each browser gets a stable anonymous session id
 * stored in an httpOnly cookie. The session maps 1:1 to a `users` row so
 * progression state is isolated per browser.
 *
 * ## Long-term Supabase Auth migration path
 *
 * Replace the contents of this module:
 *   - `getCurrentUser()` reads the Supabase access token (from the
 *     `sb-access-token` cookie or Authorization header), verifies it with
 *     `supabase.auth.getUser()`, and returns the matching `users` row
 *     looked up by `auth_id` (a new column you'd add to `users`).
 *   - The `SessionUser` interface below stays identical — API routes and
 *     components don't need any changes.
 *   - The `users` table remains the single source of truth for progression
 *     state; Supabase's `auth.users` holds only auth-relevant fields.
 */
export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  avatarEmoji: string;
  bio: string;
  xp: number;
  level: number;
  totalVideosWatched: number;
  totalPartiesHosted: number;
  totalFriendsInvited: number;
  createdAt: Date;
}

function generateSessionId(): string {
  return randomBytes(24).toString("hex");
}

function usernameFromSession(sessionId: string): string {
  return `${USERNAME_PREFIX}${sessionId.slice(0, USERNAME_SUFFIX_BYTES)}`;
}

const AVATAR_CHOICES = ["🎬", "🦊", "🐻", "🐼", "🦁", "🐸", "🦄", "🐙", "🐨", "🦉", "🐯", "🐰", "🐵"];

/**
 * Resolve the current user from the session cookie. If no session exists,
 * creates one along with a brand-new user row (fresh progression state).
 * Returns null only on unrecoverable DB failure.
 *
 * Handles:
 *   - Cookie collisions (two tabs racing on first visit) — the unique
 *     `username` index serializes creation; on conflict we read the
 *     existing row.
 *   - Username collisions (astronomically unlikely with 16 hex chars,
 *     but handled by retrying with a fresh session id).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  let isNewSession = false;

  if (!sessionId) {
    // Rate limit session creation to prevent abuse.
    if (!(await canCreateSession())) {
      log("warn", "Session creation rate limit exceeded");
      return null;
    }
    sessionId = generateSessionId();
    isNewSession = true;
    cookieStore.set({
      name: SESSION_COOKIE,
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  }

  const username = usernameFromSession(sessionId);

  // Try to find the existing user row.
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .then(r => r[0]);

  if (existing) return existing;

  // Create a new user. Use onConflictDoNothing + re-read so concurrent
  // first-visit requests from the same session converge safely.
  const avatar = AVATAR_CHOICES[Math.floor(Math.random() * AVATAR_CHOICES.length)];
  try {
    await db.insert(users).values({
      username,
      displayName: `Viewer ${username.slice(-4)}`,
      avatarEmoji: avatar,
      bio: "New to you2ube. Earning XP every day.",
      xp: 0,
      level: 1,
    }).onConflictDoNothing();
  } catch (err) {
    log("error", "Failed to insert new user row", {
      username,
      error: (err as Error).message,
    });
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .then(r => r[0]);

  if (!user) {
    log("error", "User row missing immediately after insert", { username });
    return null;
  }

  // First-ever session for this user — emit a welcome notification.
  // Idempotent: only inserts if no welcome notification exists yet.
  if (isNewSession) {
    const hasWelcome = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .limit(1)
      .then(r => r.length > 0);
    if (!hasWelcome) {
      await db.insert(notifications).values({
        userId: user.id,
        type: "system",
        title: "Welcome to you2ube! 🎉",
        message: "Start watching videos, hosting watch parties, and inviting friends to earn XP and level up.",
        icon: "👋",
      });
    }
  }

  return user;
}
