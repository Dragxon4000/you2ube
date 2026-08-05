import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { watchSessions } from "@/db/schema";
import { awardXp, XP_REWARDS } from "@/lib/xp";
import { createActivity } from "@/lib/social";

export const MAX_TRACKED_PLAYBACK_SECONDS = 24 * 60 * 60;

export type WatchProgressInput = {
  userId: string;
  videoId: string;
  videoTitle: string;
  channelName: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  positionSeconds: number;
  completed: boolean;
};

function clampPlaybackSeconds(value: number, durationSeconds: number | null): number {
  const upperBound = durationSeconds && durationSeconds > 0
    ? Math.min(durationSeconds, MAX_TRACKED_PLAYBACK_SECONDS)
    : MAX_TRACKED_PLAYBACK_SECONDS;

  return Math.min(Math.max(Math.floor(value), 0), upperBound);
}

/**
 * Writes actual player progress. `watchedSeconds` retains the furthest observed
 * timestamp while `resumePositionSeconds` is the exact point to resume from.
 */
export async function saveWatchProgress(input: WatchProgressInput) {
  const durationSeconds = input.durationSeconds
    ? clampPlaybackSeconds(input.durationSeconds, null)
    : null;
  const positionSeconds = clampPlaybackSeconds(input.positionSeconds, durationSeconds);
  const resumePositionSeconds = input.completed ? 0 : positionSeconds;

  let session = (
    await db
      .select()
      .from(watchSessions)
      .where(and(eq(watchSessions.userId, input.userId), eq(watchSessions.videoId, input.videoId)))
      .limit(1)
  )[0];

  if (!session) {
    const inserted = await db
      .insert(watchSessions)
      .values({
        userId: input.userId,
        videoId: input.videoId,
        videoTitle: input.videoTitle,
        channelName: input.channelName,
        thumbnailUrl: input.thumbnailUrl,
        durationSeconds,
        watchedSeconds: positionSeconds,
        resumePositionSeconds,
        completed: input.completed,
      })
      .onConflictDoNothing()
      .returning();

    session = inserted[0];

    if (session) {
      await awardXp(input.userId, XP_REWARDS.watch_session, "watch_session", session.id);
      if (input.completed) {
        await awardXp(input.userId, XP_REWARDS.watch_complete, "watch_complete", session.id);
      }
      try {
        await createActivity(
          input.userId,
          input.completed ? "watch_complete" : "watch_start",
          {
            videoId: input.videoId,
            videoTitle: input.videoTitle,
          },
          "friends",
        );
      } catch {
        // Activity feed failure should not block playback/session persistence.
      }
      return { session, created: true, completedNow: input.completed };
    }

    // A second player tab may have created the same user/video record first.
    session = (
      await db
        .select()
        .from(watchSessions)
        .where(and(eq(watchSessions.userId, input.userId), eq(watchSessions.videoId, input.videoId)))
        .limit(1)
    )[0];
  }

  if (!session) {
    throw new Error("Unable to create or locate watch session.");
  }

  const completedNow = input.completed && !session.completed;
  const [updated] = await db
    .update(watchSessions)
    .set({
      videoTitle: input.videoTitle,
      channelName: input.channelName ?? session.channelName,
      thumbnailUrl: input.thumbnailUrl ?? session.thumbnailUrl,
      durationSeconds: durationSeconds ?? session.durationSeconds,
      watchedSeconds: Math.max(session.watchedSeconds, positionSeconds),
      resumePositionSeconds,
      completed: session.completed || input.completed,
      lastWatchedAt: new Date(),
    })
    .where(eq(watchSessions.id, session.id))
    .returning();

  if (completedNow) {
    await awardXp(input.userId, XP_REWARDS.watch_complete, "watch_complete", updated.id);
    try {
      await createActivity(
        input.userId,
        "watch_complete",
        {
          videoId: input.videoId,
          videoTitle: input.videoTitle,
        },
        "friends",
      );
    } catch {
      // Activity feed failure should not block playback/session persistence.
    }
  }

  return { session: updated, created: false, completedNow };
}

export async function getWatchSession(userId: string, videoId: string) {
  const rows = await db
    .select()
    .from(watchSessions)
    .where(and(eq(watchSessions.userId, userId), eq(watchSessions.videoId, videoId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getRecentWatchSessions(userId: string, limit = 50) {
  return db
    .select()
    .from(watchSessions)
    .where(eq(watchSessions.userId, userId))
    .orderBy(desc(watchSessions.lastWatchedAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}
