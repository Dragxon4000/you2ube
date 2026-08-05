import { NextResponse } from "next/server";
import { videos, watchSessions } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { awardXp, runProgressionTx } from "@/lib/progression";
import {
  withAuth, parseJsonBody, apiError, ErrorCode,
  checkIdempotencyKey, checkRateLimit, isPositiveInt, log,
} from "@/lib/api-helpers";

const MAX_VIDEO_ID = 1_000_000;
const RATE_LIMIT_PER_MINUTE = 30;

// POST /api/actions/watch - watch a video and earn XP.
export async function POST(req: Request) {
  return withAuth(async ({ user }) => {
    // Rate limit.
    const rl = checkRateLimit(`watch:${user.id}`, RATE_LIMIT_PER_MINUTE);
    if (!rl.allowed) {
      return apiError(429, ErrorCode.RATE_LIMITED, "Too many requests. Try again in a minute.", {
        resetAt: rl.resetAt,
      });
    }

    const body = await parseJsonBody<{ videoId?: unknown; idempotencyKey?: unknown }>(req);
    if (!body.ok) return body.response;

    const { videoId, idempotencyKey } = body.data;
    if (!isPositiveInt(videoId, MAX_VIDEO_ID)) {
      return apiError(400, ErrorCode.INVALID_INPUT, "videoId must be an integer between 1 and 1000000");
    }

    // Idempotency check.
    const idemKey = typeof idempotencyKey === "string" ? idempotencyKey : undefined;
    const idemCheck = await checkIdempotencyKey(user.id, idemKey);
    if (idemCheck.duplicate) {
      return NextResponse.json({
        success: true,
        idempotentReplay: true,
        message: "This action was already processed.",
        result: { xpGained: idemCheck.existingAmount ?? 0 },
      });
    }

    // Everything below runs in a SINGLE transaction so watchSession insert,
    // view count bump, and XP grant either all succeed or all roll back.
    try {
      const result = await runProgressionTx(async (tx) => {
        const video = await tx.select().from(videos).where(eq(videos.id, videoId)).then(r => r[0]);
        if (!video) return { kind: "not_found" as const };

        // 24h rate limit on XP (still allow view count bump).
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentWatch = await tx
          .select({ id: watchSessions.id })
          .from(watchSessions)
          .where(and(
            eq(watchSessions.userId, user.id),
            eq(watchSessions.videoId, videoId),
            gte(watchSessions.watchedAt, oneDayAgo),
          ))
          .then(r => r[0]);

        // Always bump views (atomic).
        await tx.update(videos).set({ viewsCount: sql`${videos.viewsCount} + 1` }).where(eq(videos.id, videoId));

        if (recentWatch) {
          await tx.insert(watchSessions).values({ userId: user.id, videoId, xpEarned: 0 });
          return {
            kind: "already_today" as const,
            video,
            message: `You already earned XP from "${video.title}" today. Come back tomorrow!`,
          };
        }

        const xpResult = await awardXp({
          userId: user.id,
          action: "watch_video",
          referenceType: "video",
          referenceId: videoId,
          contextMessage: `Watched "${video.title}"`,
          idempotencyKey: idemKey,
          tx,
        });

        await tx.insert(watchSessions).values({
          userId: user.id,
          videoId,
          xpEarned: xpResult.xpGained,
        });

        return { kind: "ok" as const, video, result: xpResult };
      });

      if (result.kind === "not_found") {
        return apiError(404, ErrorCode.NOT_FOUND, "Video not found");
      }
      if (result.kind === "already_today") {
        return NextResponse.json({
          success: true,
          alreadyWatchedToday: true,
          message: result.message,
          result: null,
        });
      }
      return NextResponse.json({
        success: true,
        alreadyWatchedToday: false,
        video: {
          id: result.video.id,
          title: result.video.title,
          thumbnailEmoji: result.video.thumbnailEmoji,
        },
        result: result.result,
      });
    } catch (err) {
      log("error", "watch action failed", { userId: user.id, videoId, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to record watch");
    }
  });
}
