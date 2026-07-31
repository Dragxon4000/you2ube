import "server-only";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions, users } from "@/db/schema";
import { generateToken, hashToken } from "./crypto";

export const SESSION_COOKIE_NAME = "you2ube_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  profile: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
};

/** Creates a new server-side session row and returns the raw cookie token. */
export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    id: tokenHash,
    userId,
    expiresAt,
  });

  return token;
}

/** Sets the session cookie on the outgoing response (Server Action / Route Handler context). */
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Looks up the current session's user + profile from the DB, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return getUserByToken(token);
}

export async function getUserByToken(token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);

  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      profileId: profiles.id,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.userId,
    email: row.email,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
    profile: row.profileId
      ? {
          id: row.profileId,
          displayName: row.displayName ?? row.email,
          avatarUrl: row.avatarUrl,
        }
      : null,
  };
}

/** Deletes the current session row and clears the cookie (logout). */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
