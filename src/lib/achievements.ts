import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { achievements, userAchievements } from "@/db/schema";
import { awardXp } from "@/lib/xp";
import { createActivity } from "@/lib/social";

/**
 * Single server-side unlock path for future achievement evaluators. It is
 * idempotent at the database level and emits one social activity only when a
 * new unlock is recorded.
 */
export async function unlockAchievement(userId: string, slug: string) {
  const [achievement] = await db
    .select()
    .from(achievements)
    .where(eq(achievements.slug, slug))
    .limit(1);
  if (!achievement) return null;

  const [unlocked] = await db
    .insert(userAchievements)
    .values({ userId, achievementId: achievement.id })
    .onConflictDoNothing()
    .returning({ id: userAchievements.id });

  if (!unlocked) return null;

  if (achievement.xpReward > 0) {
    await awardXp(userId, achievement.xpReward, "achievement", unlocked.id);
  }
  await createActivity(
    userId,
    "achievement_unlock",
    {
      achievementId: achievement.id,
      slug: achievement.slug,
      name: achievement.name,
      xpReward: achievement.xpReward,
    },
    "friends",
  );

  return achievement;
}
