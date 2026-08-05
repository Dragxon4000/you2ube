import { NextResponse } from "next/server";
import { db } from "@/db";
import { videos, watchSessions } from "@/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { awardXp } from "@/lib/progression";
import { seedProgressionSystem } from "@/db/seed";
import { getCurrentUser } from "@/lib/session";

const MAX_VIDEO_ID = 1_000_000;

// POST /api/actions/watch - watch a video and earn XP
export async function POST(req: Request) {
  await seedProgressionSystem();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const videoId = (body as { videoId?: unknown }).videoId;
  if (typeof videoId !== "number" || !Number.isInteger(videoId) || videoId < 1 || videoId > MAX_VIDEO_ID) {
    return NextResponse.json({ error: "videoId must be an integer between 1 and 1000000" }, { status: 400 });
  }

  const video = await db.select().from(videos).where(eq(videos.id, videoId)).then(r => r[0]);
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  // Rate-limit: only award XP once per video per 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentWatch = await db
    .select({ id: watchSessions.id })
    .from(watchSessions)
    .where(
      and(
        eq(watchSessions.userId, user.id),
        eq(watchSessions.videoId, videoId),
        gte(watchSessions.watchedAt, oneDayAgo),
      ),
    )
    .then(r => r[0]);

  // Always bump view count (rate-limit only applies to XP)
  await db.update(videos).set({ viewsCount: sql`${videos.viewsCount} + 1` }).where(eq(videos.id, videoId));

  if (recentWatch) {
    await db.insert(watchSessions).values({ userId: user.id, videoId, xpEarned: 0 });
    return NextResponse.json({
      success: true,
      alreadyWatchedToday: true,
      message: `You already earned XP from "${video.title}" today. Come back tomorrow!`,
      result: null,
    });
  }

  const result = await awardXp({
    userId: user.id,
    action: "watch_video",
    referenceType: "video",
    referenceId: videoId,
    contextMessage: `Watched "${video.title}"`,
  });

  await db.insert(watchSessions).values({ userId: user.id, videoId, xpEarned: result.xpGained });

  return NextResponse.json({
    success: true,
    alreadyWatchedToday: false,
    video: { id: video.id, title: video.title, thumbnailEmoji: video.thumbnailEmoji },
    result,
  });
}
