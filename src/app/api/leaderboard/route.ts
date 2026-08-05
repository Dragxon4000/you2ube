import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, levels } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { withAuth, apiError, ErrorCode, log } from "@/lib/api-helpers";

// GET /api/leaderboard
export async function GET() {
  return withAuth(async ({ user }) => {
    try {
      const top = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarEmoji: users.avatarEmoji,
          xp: users.xp,
          level: users.level,
        })
        .from(users)
        .orderBy(desc(users.xp))
        .limit(20);

      const levelRows = await db.select().from(levels);
      const levelByNumber = new Map(levelRows.map(l => [l.level, l]));

      const enriched = top.map((u, idx) => ({
        rank: idx + 1,
        ...u,
        levelTitle: levelByNumber.get(u.level)?.title ?? "—",
        levelColor: levelByNumber.get(u.level)?.colorHex ?? "#64748b",
      }));

      // Rank is defined as (count of users with strictly more XP) + 1.
      //
      // The subquery leverages the `users_xp_desc_idx` index: Postgres can
      // satisfy `count(*) where xp > $xp` with a backward Index Only Scan
      // over the descending-XP index, so this is O(log N) in practice
      // rather than a full sequential scan. For very large user tables
      // (millions of rows), consider materializing rank into the users row
      // and recomputing via a background job.
      const rankRow = await db
        .select({ rank: sql<number>`(select count(*) + 1 from users where xp > ${user.xp})::int` })
        .from(users)
        .where(eq(users.id, user.id))
        .then(r => r[0]);

      return NextResponse.json({
        leaderboard: enriched,
        yourRank: rankRow?.rank ?? null,
        yourUserId: user.id,
      });
    } catch (err) {
      log("error", "leaderboard GET failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to load leaderboard");
    }
  });
}
