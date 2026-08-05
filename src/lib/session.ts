import { cookies } from "next/headers";
import { db } from "@/db";
import { users, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { log } from "@/lib/api-helpers";

const SESSION_COOKIE = "you2ube_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const USERNAME_PREFIX = "user_";
const USERNAME_SUFFIX_BYTES = 8; // 16 hex chars = 1.8e19 possibilities — collision-safe

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
