import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const SESSION_COOKIE = "you2ube_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Demo session abstraction. Each browser gets a stable anonymous session id
 * stored in an httpOnly cookie. The session maps 1:1 to a `users` row so
 * progression state is isolated per browser.
 *
 * Phase 7 (or any future auth system) can replace this module without
 * touching API routes — they only depend on `getCurrentUser()`.
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

function generateUsername(sessionId: string): string {
  return `user_${sessionId.slice(0, 8)}`;
}

/**
 * Resolve the current user from the session cookie. If no session exists,
 * creates one along with a brand-new user row (fresh progression state).
 * Returns null only on unrecoverable DB failure.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  let sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  let createdNewSession = false;

  if (!sessionId) {
    sessionId = generateSessionId();
    createdNewSession = true;
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

  const username = generateUsername(sessionId);

  let user = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .then(r => r[0]);

  if (!user) {
    // First visit for this session — create a fresh user row.
    const avatarChoices = ["🎬", "🦊", "🐻", "🐼", "🦁", "🐸", "🦄", "🐙", "🐨", "🦉"];
    const avatar = avatarChoices[Math.floor(Math.random() * avatarChoices.length)];
    const [created] = await db.insert(users).values({
      username,
      displayName: `Viewer ${username.slice(-4)}`,
      avatarEmoji: avatar,
      bio: "New to you2ube. Earning XP every day.",
      xp: 0,
      level: 1,
    }).returning();
    user = created;
    createdNewSession = true;
  }

  // If this is the very first session ever, give them a welcome notification.
  if (createdNewSession && user) {
    const { notifications } = await import("@/db/schema");
    const existingWelcome = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .limit(1);
    if (existingWelcome.length === 0) {
      await db.insert(notifications).values({
        userId: user.id,
        type: "system",
        title: "Welcome to you2ube! 🎉",
        message: "Start watching videos, hosting watch parties, and inviting friends to earn XP and level up.",
        icon: "👋",
      });
    }
  }

  return user ?? null;
}
