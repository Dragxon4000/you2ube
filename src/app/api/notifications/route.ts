import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  withAuth, parseJsonBody, apiError, ErrorCode, isPositiveInt, log,
} from "@/lib/api-helpers";

// GET /api/notifications
export async function GET(req: Request) {
  return withAuth(async ({ user }) => {
    try {
      const url = new URL(req.url);
      const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
      const cursorRaw = url.searchParams.get("cursor");
      const cursorDate = cursorRaw ? new Date(cursorRaw) : null;
      const cursorValid = !!cursorDate && !Number.isNaN(cursorDate.getTime());

      // Build a where clause that includes the cursor filter when valid.
      const whereClause = cursorValid
        ? and(
            eq(notifications.userId, user.id),
            // Fetch rows strictly older than the cursor.
            sql`${notifications.createdAt} < ${cursorDate.toISOString()}`,
          )
        : eq(notifications.userId, user.id);

      // Fetch `limit + 1` rows so we can detect whether more pages exist.
      const rows = await db
        .select()
        .from(notifications)
        .where(whereClause)
        .orderBy(desc(notifications.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

      return NextResponse.json({ notifications: page, nextCursor, limit });
    } catch (err) {
      log("error", "notifications GET failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to load notifications");
    }
  });
}

// POST /api/notifications - mark one or all as read (scoped to current user).
export async function POST(req: Request) {
  return withAuth(async ({ user }) => {
    const body = await parseJsonBody<{ id?: unknown; markAll?: unknown }>(req);
    if (!body.ok) return body.response;

    const { id, markAll } = body.data;

    try {
      if (markAll === true) {
        await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
        return NextResponse.json({ success: true, marked: "all" });
      }

      if (isPositiveInt(id, 1_000_000_000)) {
        // IDOR-safe: only mark read if the notification belongs to this user.
        // Atomic single update scoped to user — eliminates race between read + update.
        const result = await db
          .update(notifications)
          .set({ read: true })
          .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
        // Drizzle doesn't expose affected-row counts portably here, so re-check.
        const row = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(eq(notifications.id, id), eq(notifications.userId, user.id), eq(notifications.read, true)))
          .then(r => r[0]);
        if (!row) {
          // Either it doesn't exist OR it doesn't belong to the user.
          const exists = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.id, id)).then(r => r[0]);
          if (!exists) return apiError(404, ErrorCode.NOT_FOUND, "Notification not found");
          return apiError(403, ErrorCode.FORBIDDEN, "Notification does not belong to you");
        }
        return NextResponse.json({ success: true, marked: id });
      }

      return apiError(400, ErrorCode.INVALID_INPUT, "Provide id (positive integer) or markAll: true");
    } catch (err) {
      log("error", "notifications POST failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to mark notifications");
    }
  });
}
