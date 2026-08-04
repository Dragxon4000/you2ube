import { NextResponse } from "next/server";
import { db } from "@/db";
import { watchSessions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { awardXp, XP_REWARDS } from "@/lib/xp";
import { and, eq, desc } from "drizzle-orm";

/**
 * POST /api/watch — start or update a watch session.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    videoId,
    videoTitle,
    channelName,
    thumbnailUrl,
    durationSeconds,
    watchedSeconds,
  } = (body ?? {}) as {
    videoId?: string;
    videoTitle?: string;
    channelName?: string;
    thumbnailUrl?: string;
    durationSeconds?: number;
    watchedSeconds?: number;
  };

  if (!videoId || typeof videoId !== "string") {
    return NextResponse.json({ error: "Missing videoId." }, { status: 400 });
  }
  if (!videoTitle || typeof videoTitle !== "string") {
    return NextResponse.json({ error: "Missing videoTitle." }, { status: 400 });
  }

  // Find existing session for this user + video
  const existing = await db
    .select()
    .from(watchSessions)
    .where(and(eq(watchSessions.userId, user.id), eq(watchSessions.videoId, videoId)))
    .limit(1);

  const watched = Math.max(0, Math.floor(watchedSeconds ?? 0));
  const duration = durationSeconds ? Math.max(0, Math.floor(durationSeconds)) : null;
  const completed = duration ? watched >= duration * 0.9 : false;

  if (existing.length > 0) {
    // Update existing session
    const session = existing[0];
    const wasCompleted = session.completed;

    await db
      .update(watchSessions)
      .set({
        watchedSeconds: Math.max(session.watchedSeconds, watched),
        completed: completed || session.completed,
        lastWatchedAt: new Date(),
        videoTitle,
        channelName: channelName ?? session.channelName,
        thumbnailUrl: thumbnailUrl ?? session.thumbnailUrl,
        durationSeconds: duration ?? session.durationSeconds,
      })
      .where(eq(watchSessions.id, session.id));

    // Award completion XP only the first time
    if (completed && !wasCompleted) {
      await awardXp(user.id, XP_REWARDS.watch_complete, "watch_complete", session.id);
    }

    return NextResponse.json({ sessionId: session.id, updated: true });
  }

  // Create new watch session
  const [session] = await db
    .insert(watchSessions)
    .values({
      userId: user.id,
      videoId,
      videoTitle,
      channelName: channelName ?? null,
      thumbnailUrl: thumbnailUrl ?? null,
      durationSeconds: duration,
      watchedSeconds: watched,
      completed,
    })
    .returning();

  // Award XP for starting a watch session
  await awardXp(user.id, XP_REWARDS.watch_session, "watch_session", session.id);

  if (completed) {
    await awardXp(user.id, XP_REWARDS.watch_complete, "watch_complete", session.id);
  }

  return NextResponse.json({ sessionId: session.id, created: true });
}

/**
 * GET /api/watch — get recent watch history.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const history = await db
    .select()
    .from(watchSessions)
    .where(eq(watchSessions.userId, user.id))
    .orderBy(desc(watchSessions.lastWatchedAt))
    .limit(50);

  return NextResponse.json({ history });
}
