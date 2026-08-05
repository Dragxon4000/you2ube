import { NextResponse } from "next/server";
import { db } from "@/db";
import { achievements, userAchievements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withAuth, apiError, ErrorCode, log } from "@/lib/api-helpers";

// GET /api/achievements
export async function GET() {
  return withAuth(async ({ user }) => {
    try {
      const all = await db.select().from(achievements).orderBy(achievements.category, achievements.requirementValue);
      const mine = await db.select().from(userAchievements).where(eq(userAchievements.userId, user.id));
      const mineById = new Map(mine.map(m => [m.achievementId, m]));

      const merged = all.map(a => {
        const mine_row = mineById.get(a.id);
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          description: a.description,
          icon: a.icon,
          category: a.category,
          tier: a.tier,
          requirementType: a.requirementType,
          requirementValue: a.requirementValue,
          xpReward: a.xpReward,
          progress: mine_row?.progress ?? 0,
          unlocked: mine_row?.unlocked ?? false,
          unlockedAt: mine_row?.unlockedAt ?? null,
        };
      });

      const grouped: Record<string, typeof merged> = {};
      for (const a of merged) {
        (grouped[a.category] ||= []).push(a);
      }

      return NextResponse.json({
        achievements: merged,
        grouped,
        userStats: {
          xp: user.xp,
          level: user.level,
          videosWatched: user.totalVideosWatched,
          partiesHosted: user.totalPartiesHosted,
          friendsInvited: user.totalFriendsInvited,
        },
      });
    } catch (err) {
      log("error", "achievements GET failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to load achievements");
    }
  });
}
