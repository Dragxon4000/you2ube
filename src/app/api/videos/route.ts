import { NextResponse } from "next/server";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { apiError, ErrorCode, log, withAuth } from "@/lib/api-helpers";
import { sql } from "drizzle-orm";

/**
 * GET /api/videos - demo content feed with cursor-based pagination.
 *
 * Query params:
 *   - `limit`   (int, 1..100, default 20) — page size
 *   - `cursor`  (int, optional) — last seen `id` to paginate forward
 *
 * Response:
 *   - `videos`   — array of video rows for this page
 *   - `nextCursor` — id of the last video (null when no more pages)
 *   - `limit`    — the page size used
 */
export async function GET(req: Request) {
  return withAuth(async () => {
    try {
      const url = new URL(req.url);
      const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
      const cursorRaw = url.searchParams.get("cursor");
      const cursor = cursorRaw ? parseInt(cursorRaw, 10) : null;
      const cursorValid = cursor !== null && Number.isFinite(cursor) && cursor > 0;

      // Cursor-based pagination: fetch `limit + 1` rows so we can detect "has more".
      const rows = await db
        .select()
        .from(videos)
        .where(cursorValid ? sql`${videos.id} > ${cursor}` : undefined)
        .orderBy(videos.id)
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? page[page.length - 1].id : null;

      return NextResponse.json({
        videos: page,
        nextCursor,
        limit,
      });
    } catch (err) {
      log("error", "videos GET failed", { error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to load videos");
    }
  });
}
