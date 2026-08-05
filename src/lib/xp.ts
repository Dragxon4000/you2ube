import "server-only";
import { db } from "@/db";
import { xpLedger } from "@/db/schema";
import { eq, sum } from "drizzle-orm";
import { createActivity } from "@/lib/social";

// XP rewards for various actions
export const XP_REWARDS = {
  watch_session: 10, // per video watched
  watch_complete: 25, // completing a full video
  search: 2, // performing a search
  daily_login: 50, // first login of the day
  achievement: 0, // varies per achievement
} as const;

export type XpReason = keyof typeof XP_REWARDS;

/**
 * Award XP to a user and record it in the ledger.
 */
export async function awardXp(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<void> {
  const beforeTotal = await getUserTotalXp(userId);
  await db.insert(xpLedger).values({
    userId,
    amount,
    reason,
    referenceId: referenceId ?? null,
  });

  const beforeLevel = calculateLevel(beforeTotal).level;
  const afterTotal = beforeTotal + amount;
  const afterLevel = calculateLevel(afterTotal).level;
  if (afterLevel > beforeLevel) {
    try {
      await createActivity(userId, "level_up", { level: afterLevel, totalXp: afterTotal }, "friends");
    } catch {
      // XP must not fail because the social feed is temporarily unavailable.
    }
  }
}

/**
 * Get total XP for a user.
 */
export async function getUserTotalXp(userId: string): Promise<number> {
  const result = await db
    .select({ total: sum(xpLedger.amount) })
    .from(xpLedger)
    .where(eq(xpLedger.userId, userId));

  return parseInt(result[0]?.total ?? "0", 10);
}

/**
 * Calculate level from total XP. Each level requires progressively more XP.
 * Level 1: 0 XP, Level 2: 100 XP, Level 3: 300 XP, etc.
 * Formula: xpForLevel(n) = 100 * (n-1) * n / 2
 */
export function calculateLevel(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
} {
  let level = 1;
  let accumulatedXp = 0;

  while (true) {
    const xpForNextLevel = level * 100;
    if (accumulatedXp + xpForNextLevel > totalXp) {
      const currentLevelXp = totalXp - accumulatedXp;
      return {
        level,
        currentLevelXp,
        nextLevelXp: xpForNextLevel,
        progress: currentLevelXp / xpForNextLevel,
      };
    }
    accumulatedXp += xpForNextLevel;
    level++;
  }
}

/**
 * Get the recent XP history for a user.
 */
export async function getRecentXpHistory(
  userId: string,
  limit = 20,
) {
  return db
    .select()
    .from(xpLedger)
    .where(eq(xpLedger.userId, userId))
    .orderBy(xpLedger.createdAt)
    .limit(limit);
}
