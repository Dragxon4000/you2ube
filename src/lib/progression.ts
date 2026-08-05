import { db } from "@/db";
import {
  users,
  levels,
  xpTransactions,
  achievements,
  userAchievements,
  badges,
  userBadges,
  rewards,
  userRewards,
  notifications,
  xpRules,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export type XpAction = "watch_video" | "host_party" | "invite_friend" | "daily_login";

export interface AwardXpOptions {
  userId: number;
  action: XpAction;
  /** Optional multiplier override; otherwise uses level perks. */
  bonusMultiplier?: number;
  /** Optional additional flat XP (e.g. per-attendee bonus). */
  bonusFlat?: number;
  referenceType?: string;
  referenceId?: number;
  /** Extra context to include in notifications. */
  contextMessage?: string;
}

export interface AwardXpResult {
  xpGained: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  newAchievements: Array<{ id: number; name: string; icon: string; xpReward: number }>;
  newBadges: Array<{ id: number; name: string; icon: string; tier: string }>;
  newRewards: Array<{ id: number; name: string; icon: string }>;
}

// Type for transaction client (subset of db we use inside tx)
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Get the level that corresponds to a given XP total, reading from the `levels` table.
 */
export async function getLevelForXp(xp: number): Promise<{ level: number; title: string; colorHex: string; perk: string }> {
  const allLevels = await db
    .select()
    .from(levels)
    .orderBy(sql`${levels.level} asc`);

  const fallback = { level: 1, title: "Couch Potato", minXp: 0, colorHex: "#94a3b8", perk: "" };
  let current: typeof fallback = allLevels[0] ?? fallback;
  for (const lvl of allLevels) {
    if (xp >= lvl.minXp) current = lvl;
    else break;
  }
  return { level: current.level, title: current.title, colorHex: current.colorHex, perk: current.perk };
}

/**
 * Compute progress toward the next level.
 */
export async function getXpProgress(xp: number, currentLevel: number) {
  const current = await db.select().from(levels).where(eq(levels.level, currentLevel)).then(r => r[0]);
  const next = await db.select().from(levels).where(eq(levels.level, currentLevel + 1)).then(r => r[0]);

  const currentMin = current?.minXp ?? 0;
  const nextMin = next?.minXp ?? currentMin + 100;
  const span = Math.max(1, nextMin - currentMin);
  const into = Math.max(0, xp - currentMin);
  const percent = Math.min(100, Math.round((into / span) * 100));
  return {
    currentXp: xp,
    currentLevelMin: currentMin,
    nextLevelMin: nextMin,
    xpIntoLevel: into,
    xpNeededForLevel: span,
    percent,
    nextLevel: next?.level ?? null,
    nextTitle: next?.title ?? null,
  };
}

async function getBaseXpForAction(action: XpAction, tx: Tx): Promise<number> {
  const rule = await tx
    .select()
    .from(xpRules)
    .where(and(eq(xpRules.action, action), eq(xpRules.enabled, true)))
    .then(r => r[0]);
  return rule?.baseXp ?? 0;
}

async function getLevelBonusMultiplier(currentLevel: number, tx: Tx): Promise<number> {
  const lvlRow = await tx.select().from(levels).where(eq(levels.level, currentLevel)).then(r => r[0]);
  if (!lvlRow) return 1;
  const match = lvlRow.perk.match(/(\d+)%\s*bonus\s*XP/i);
  if (!match) return 1;
  return 1 + parseInt(match[1], 10) / 100;
}

interface UserStats {
  xp: number;
  level: number;
  videosWatched: number;
  partiesHosted: number;
  friendsInvited: number;
}

function getStatForRequirement(stats: UserStats, reqType: string): number {
  switch (reqType) {
    case "videos_watched": return stats.videosWatched;
    case "parties_hosted": return stats.partiesHosted;
    case "friends_invited": return stats.friendsInvited;
    case "xp_earned": return stats.xp;
    case "level_reached": return stats.level;
    default: return 0;
  }
}

async function evaluateAchievements(tx: Tx, userId: number, stats: UserStats) {
  const allAch = await tx.select().from(achievements);
  const userAch = await tx
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
  const unlockedIds = new Set(userAch.filter(u => u.unlocked).map(u => u.achievementId));
  const progressById = new Map(userAch.map(u => [u.achievementId, u]));

  const newlyUnlocked: Array<{ id: number; name: string; icon: string; xpReward: number }> = [];

  for (const ach of allAch) {
    const current = getStatForRequirement(stats, ach.requirementType);
    const prev = progressById.get(ach.id);
    const wasUnlocked = prev?.unlocked ?? false;
    const isUnlocked = current >= ach.requirementValue;

    // Upsert progress — preserve original unlockedAt if already unlocked.
    const preservedUnlockedAt = wasUnlocked ? prev!.unlockedAt : (isUnlocked ? new Date() : null);

    await tx
      .insert(userAchievements)
      .values({
        userId,
        achievementId: ach.id,
        progress: Math.min(current, ach.requirementValue),
        unlocked: isUnlocked,
        unlockedAt: preservedUnlockedAt,
      })
      .onConflictDoUpdate({
        target: [userAchievements.userId, userAchievements.achievementId],
        set: {
          progress: Math.min(current, ach.requirementValue),
          unlocked: isUnlocked,
          unlockedAt: preservedUnlockedAt,
        },
      });

    if (isUnlocked && !wasUnlocked) {
      newlyUnlocked.push({ id: ach.id, name: ach.name, icon: ach.icon, xpReward: ach.xpReward });
      await tx.insert(notifications).values({
        userId,
        type: "achievement",
        title: `Achievement Unlocked! ${ach.icon}`,
        message: `${ach.name} — ${ach.description}${ach.xpReward ? ` (+${ach.xpReward} XP bonus)` : ""}`,
        icon: ach.icon,
        metadata: { achievementCode: ach.code, xpReward: ach.xpReward },
      });

      // Grant bonus XP (does not re-trigger achievement evaluation — avoids recursion).
      if (ach.xpReward > 0) {
        await tx.insert(xpTransactions).values({
          userId,
          amount: ach.xpReward,
          reason: "achievement_bonus",
          referenceType: "achievement",
          referenceId: ach.id,
        });
        await tx.update(users).set({ xp: sql`${users.xp} + ${ach.xpReward}` }).where(eq(users.id, userId));
      }
    }
  }
  return newlyUnlocked;
}

async function evaluateBadges(tx: Tx, userId: number, stats: UserStats) {
  const allBadges = await tx.select().from(badges);
  const userBadgesRows = await tx
    .select()
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  const awardedIds = new Set(userBadgesRows.map(b => b.badgeId));

  const newlyAwarded: Array<{ id: number; name: string; icon: string; tier: string }> = [];

  const qualifies = (b: { code: string }): boolean => {
    switch (b.code) {
      case "newbie": return true;
      case "cinephile": return stats.level >= 7;
      case "vip": return stats.level >= 11;
      case "legend": return stats.level >= 15;
      case "mythic": return stats.level >= 20;
      case "host_hero": return stats.partiesHosted >= 25;
      case "social_star": return stats.friendsInvited >= 10;
      case "binge_king": return stats.videosWatched >= 100;
      default: return false;
    }
  };

  for (const b of allBadges) {
    if (awardedIds.has(b.id)) continue;
    if (!qualifies(b)) continue;
    await tx.insert(userBadges).values({ userId, badgeId: b.id }).onConflictDoNothing();
    newlyAwarded.push({ id: b.id, name: b.name, icon: b.icon, tier: b.tier });
    await tx.insert(notifications).values({
      userId,
      type: "badge",
      title: `New Badge Earned! ${b.icon}`,
      message: `${b.name} — ${b.description}`,
      icon: b.icon,
      metadata: { badgeCode: b.code, tier: b.tier },
    });
  }
  return newlyAwarded;
}

/**
 * Check for newly-available rewards. Only sends a notification the FIRST time
 * a reward becomes available (by checking for existing notifications for that
 * reward) — prevents notification spam on every XP grant.
 */
async function evaluateRewards(tx: Tx, userId: number, level: number) {
  const allRewards = await tx.select().from(rewards).where(sql`${rewards.levelRequired} <= ${level}`);
  const claimedRows = await tx.select().from(userRewards).where(eq(userRewards.userId, userId));
  const claimedIds = new Set(claimedRows.map(r => r.rewardId));

  // Pull all existing reward notifications for this user (any type) so we can skip duplicates.
  const existingRewardNotifs = await tx
    .select({ metadata: notifications.metadata })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      sql`${notifications.type} IN ('reward', 'reward_available')`,
    ));
  const alreadyNotifiedRewardIds = new Set<number>();
  for (const n of existingRewardNotifs) {
    const meta = n.metadata as { rewardId?: number } | null;
    if (meta?.rewardId) alreadyNotifiedRewardIds.add(meta.rewardId);
  }

  const newlyUnlocked: Array<{ id: number; name: string; icon: string }> = [];
  for (const r of allRewards) {
    if (claimedIds.has(r.id)) continue;
    if (alreadyNotifiedRewardIds.has(r.id)) continue;

    await tx.insert(notifications).values({
      userId,
      type: "reward_available",
      title: `New Reward Available! ${r.icon}`,
      message: `${r.name} — ${r.description}. Claim it from your profile.`,
      icon: r.icon,
      metadata: { rewardCode: r.code, rewardId: r.id },
    });
    newlyUnlocked.push({ id: r.id, name: r.name, icon: r.icon });
  }
  return newlyUnlocked;
}

/**
 * Core XP-awarding function. Wrapped in a transaction so partial failures
 * (e.g. notification insert fails) don't leave the database in an
 * inconsistent state.
 */
export async function awardXp(opts: AwardXpOptions): Promise<AwardXpResult> {
  return db.transaction(async (tx) => {
    const base = await getBaseXpForAction(opts.action, tx);

    const user = await tx.select().from(users).where(eq(users.id, opts.userId)).then(r => r[0]);
    if (!user) throw new Error(`User ${opts.userId} not found`);

    if (base === 0) {
      return {
        xpGained: 0,
        newTotalXp: user.xp,
        previousLevel: user.level,
        newLevel: user.level,
        leveledUp: false,
        newAchievements: [],
        newBadges: [],
        newRewards: [],
      };
    }

    const levelBonus = opts.bonusMultiplier ?? (await getLevelBonusMultiplier(user.level, tx));
    const rawXp = Math.round((base + (opts.bonusFlat ?? 0)) * levelBonus);
    const previousLevel = user.level;

    // 1) Insert XP transaction row
    await tx.insert(xpTransactions).values({
      userId: opts.userId,
      amount: rawXp,
      reason: opts.action,
      referenceType: opts.referenceType ?? null,
      referenceId: opts.referenceId ?? null,
    });

    // 2) Atomic XP + counter increment (single UPDATE with SQL arithmetic — race-safe)
    const updateSet: {
      xp: ReturnType<typeof sql>;
      totalVideosWatched?: ReturnType<typeof sql>;
      totalPartiesHosted?: ReturnType<typeof sql>;
      totalFriendsInvited?: ReturnType<typeof sql>;
    } = {
      xp: sql`${users.xp} + ${rawXp}`,
    };
    if (opts.action === "watch_video") updateSet.totalVideosWatched = sql`${users.totalVideosWatched} + 1`;
    if (opts.action === "host_party") updateSet.totalPartiesHosted = sql`${users.totalPartiesHosted} + 1`;
    if (opts.action === "invite_friend") updateSet.totalFriendsInvited = sql`${users.totalFriendsInvited} + 1`;

    await tx.update(users).set(updateSet).where(eq(users.id, opts.userId));

    // Re-read the user row so we see the freshly-committed counters
    const refreshedUser = await tx.select().from(users).where(eq(users.id, opts.userId)).then(r => r[0]);
    const newXp = refreshedUser.xp;
    const newLevelInfo = await getLevelForXp(newXp);
    const newLevel = newLevelInfo.level;
    const leveledUp = newLevel > previousLevel;

    // 3) Persist the new level if raised
    if (leveledUp) {
      await tx.update(users).set({ level: newLevel }).where(eq(users.id, opts.userId));
      await tx.insert(notifications).values({
        userId: opts.userId,
        type: "level_up",
        title: `Level Up! 🎉 You're now level ${newLevel}`,
        message: `You've reached "${newLevelInfo.title}". ${newLevelInfo.perk ? `Perk: ${newLevelInfo.perk}` : ""}`,
        icon: "⬆️",
        metadata: { level: newLevel, title: newLevelInfo.title },
      });
    }

    // 4) XP notification (for non-level-up events)
    if (opts.contextMessage && !leveledUp) {
      await tx.insert(notifications).values({
        userId: opts.userId,
        type: "xp",
        title: `+${rawXp} XP`,
        message: opts.contextMessage,
        icon: "✨",
        metadata: { xp: rawXp, action: opts.action },
      });
    }

    // 5) Achievement evaluation
    const statsForAch: UserStats = {
      xp: newXp,
      level: newLevel,
      videosWatched: refreshedUser.totalVideosWatched,
      partiesHosted: refreshedUser.totalPartiesHosted,
      friendsInvited: refreshedUser.totalFriendsInvited,
    };
    const newAchievements = await evaluateAchievements(tx, opts.userId, statsForAch);

    // Re-read XP after achievement bonuses
    const finalUser = await tx.select().from(users).where(eq(users.id, opts.userId)).then(r => r[0]);

    // 6) Badge evaluation
    const newBadges = await evaluateBadges(tx, opts.userId, {
      xp: finalUser.xp,
      level: newLevel,
      videosWatched: finalUser.totalVideosWatched,
      partiesHosted: finalUser.totalPartiesHosted,
      friendsInvited: finalUser.totalFriendsInvited,
    });

    // 7) Reward evaluation (spam-safe)
    const newRewards = await evaluateRewards(tx, opts.userId, newLevel);

    return {
      xpGained: rawXp,
      newTotalXp: finalUser.xp,
      previousLevel,
      newLevel,
      leveledUp,
      newAchievements,
      newBadges,
      newRewards,
    };
  });
}

/**
 * Claim a reward that the user has qualified for (level >= required).
 */
export async function claimReward(userId: number, rewardId: number) {
  return db.transaction(async (tx) => {
    const reward = await tx.select().from(rewards).where(eq(rewards.id, rewardId)).then(r => r[0]);
    if (!reward) throw new Error("Reward not found");
    const user = await tx.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
    if (!user) throw new Error("User not found");
    if (user.level < reward.levelRequired) throw new Error("Level too low to claim this reward");

    const existing = await tx
      .select()
      .from(userRewards)
      .where(and(eq(userRewards.userId, userId), eq(userRewards.rewardId, rewardId)))
      .then(r => r[0]);
    if (existing) return { alreadyClaimed: true, reward };

    await tx.insert(userRewards).values({ userId, rewardId });
    await tx.insert(notifications).values({
      userId,
      type: "reward",
      title: `Reward Claimed! ${reward.icon}`,
      message: `You claimed: ${reward.name}.`,
      icon: "🎁",
      metadata: { rewardCode: reward.code, rewardId: reward.id },
    });
    return { alreadyClaimed: false, reward };
  });
}
