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
import { log } from "@/lib/api-helpers";

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
  /** Idempotency key — prevents double-XP on retry. Optional. */
  idempotencyKey?: string;
  /**
   * Optional transaction to reuse. When provided, `awardXp` will NOT create
   * its own transaction — the caller is responsible for commit/rollback.
   * This lets action routes include their side-writes (watch_sessions,
   * watch_parties updates, etc.) in the SAME atomic unit as the XP grant.
   */
  tx?: Tx;
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
  /** True when an idempotency-key collision was detected (no new work was done). */
  idempotentReplay?: boolean;
}

// Transaction-client type — the callback argument of db.transaction(...)
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Get the level that corresponds to a given XP total, reading from the `levels` table.
 * Accepts an optional tx so callers inside a transaction see their own writes.
 */
export async function getLevelForXp(
  xp: number,
  tx?: Tx,
): Promise<{ level: number; title: string; colorHex: string; perk: string }> {
  const reader = tx ?? db;
  const allLevels = await reader
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
  const progressById = new Map(userAch.map(u => [u.achievementId, u]));

  const newlyUnlocked: Array<{ id: number; name: string; icon: string; xpReward: number }> = [];

  for (const ach of allAch) {
    const current = getStatForRequirement(stats, ach.requirementType);
    const prev = progressById.get(ach.id);
    const wasUnlocked = prev?.unlocked ?? false;
    const isUnlocked = current >= ach.requirementValue;

    // Preserve the original unlockedAt — never overwrite an existing timestamp.
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
        await tx.update(users).set({
          xp: sql`${users.xp} + ${ach.xpReward}`,
          updatedAt: new Date(),
        }).where(eq(users.id, userId));
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

  // Use the (user_id, type) index to quickly find existing reward notifications.
  const existingRewardNotifs = await tx
    .select({ metadata: notifications.metadata, type: notifications.type })
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
 * Core XP-awarding logic, extracted so it can run inside either a fresh
 * transaction (default) or a caller-provided transaction (when action routes
 * need to co-locate their side-writes with the XP grant atomically).
 */
async function awardXpInTx(tx: Tx, opts: AwardXpOptions): Promise<AwardXpResult> {
  const base = await getBaseXpForAction(opts.action, tx);

  // Lock the user row to serialize concurrent XP grants for the same user.
  // Combined with atomic `SET xp = xp + N` updates, this prevents races where
  // two parallel grants both read stale level/counter values.
  const userRows = await tx.execute(
    sql`SELECT id, xp, level, total_videos_watched, total_parties_hosted, total_friends_invited
        FROM users WHERE id = ${opts.userId} FOR UPDATE`,
  );
  // node-postgres returns a QueryResult; the rows live on `.rows`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (userRows as any).rows as Array<{
    id: number; xp: number; level: number;
    total_videos_watched: number; total_parties_hosted: number; total_friends_invited: number;
  }>;
  const userRow = rows[0];
  if (!userRow) throw new Error(`User ${opts.userId} not found`);
  const user = {
    id: userRow.id,
    xp: userRow.xp,
    level: userRow.level,
    totalVideosWatched: userRow.total_videos_watched,
    totalPartiesHosted: userRow.total_parties_hosted,
    totalFriendsInvited: userRow.total_friends_invited,
  };

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

  // 1) Insert XP transaction row (carries idempotency key if provided).
  await tx.insert(xpTransactions).values({
    userId: opts.userId,
    amount: rawXp,
    reason: opts.action,
    referenceType: opts.referenceType ?? null,
    referenceId: opts.referenceId ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
  });

  // 2) Atomic XP + counter increment (single UPDATE with SQL arithmetic — race-safe).
  const updateSet: {
    xp: ReturnType<typeof sql>;
    updatedAt: Date;
    totalVideosWatched?: ReturnType<typeof sql>;
    totalPartiesHosted?: ReturnType<typeof sql>;
    totalFriendsInvited?: ReturnType<typeof sql>;
  } = {
    xp: sql`${users.xp} + ${rawXp}`,
    updatedAt: new Date(),
  };
  if (opts.action === "watch_video") updateSet.totalVideosWatched = sql`${users.totalVideosWatched} + 1`;
  if (opts.action === "host_party") updateSet.totalPartiesHosted = sql`${users.totalPartiesHosted} + 1`;
  if (opts.action === "invite_friend") updateSet.totalFriendsInvited = sql`${users.totalFriendsInvited} + 1`;

  await tx.update(users).set(updateSet).where(eq(users.id, opts.userId));

  // Re-read the user row so we see the freshly-committed counters.
  const refreshedUser = await tx.select().from(users).where(eq(users.id, opts.userId)).then(r => r[0]);
  const newLevelInfo = await getLevelForXp(refreshedUser.xp, tx);
  const newLevel = newLevelInfo.level;
  const leveledUp = newLevel > previousLevel;

  // 3) Persist the new level if raised.
  if (leveledUp) {
    await tx.update(users).set({ level: newLevel, updatedAt: new Date() }).where(eq(users.id, opts.userId));
    await tx.insert(notifications).values({
      userId: opts.userId,
      type: "level_up",
      title: `Level Up! 🎉 You're now level ${newLevel}`,
      message: `You've reached "${newLevelInfo.title}". ${newLevelInfo.perk ? `Perk: ${newLevelInfo.perk}` : ""}`,
      icon: "⬆️",
      metadata: { level: newLevel, title: newLevelInfo.title },
    });
  }

  // 4) XP notification (for non-level-up events).
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

  // 5) Achievement evaluation (uses post-grant XP + counters).
  const statsForAch: UserStats = {
    xp: refreshedUser.xp,
    level: newLevel,
    videosWatched: refreshedUser.totalVideosWatched,
    partiesHosted: refreshedUser.totalPartiesHosted,
    friendsInvited: refreshedUser.totalFriendsInvited,
  };
  const newAchievements = await evaluateAchievements(tx, opts.userId, statsForAch);

  // 6) Re-read XP after achievement bonuses AND recompute level — this is the
  //    fix for the bug where achievement-granted XP could push the user past
  //    a level threshold without the `level` column updating.
  const finalUser = await tx.select().from(users).where(eq(users.id, opts.userId)).then(r => r[0]);
  const finalLevelInfo = await getLevelForXp(finalUser.xp, tx);
  if (finalLevelInfo.level > newLevel) {
    await tx.update(users).set({ level: finalLevelInfo.level, updatedAt: new Date() }).where(eq(users.id, opts.userId));
    await tx.insert(notifications).values({
      userId: opts.userId,
      type: "level_up",
      title: `Level Up! 🎉 You're now level ${finalLevelInfo.level}`,
      message: `Achievement XP pushed you to "${finalLevelInfo.title}". ${finalLevelInfo.perk ? `Perk: ${finalLevelInfo.perk}` : ""}`,
      icon: "⬆️",
      metadata: { level: finalLevelInfo.level, title: finalLevelInfo.title, source: "achievement_bonus" },
    });
  }

  // 7) Badge evaluation.
  const newBadges = await evaluateBadges(tx, opts.userId, {
    xp: finalUser.xp,
    level: finalLevelInfo.level,
    videosWatched: finalUser.totalVideosWatched,
    partiesHosted: finalUser.totalPartiesHosted,
    friendsInvited: finalUser.totalFriendsInvited,
  });

  // 8) Reward evaluation (spam-safe).
  const newRewards = await evaluateRewards(tx, opts.userId, finalLevelInfo.level);

  return {
    xpGained: rawXp,
    newTotalXp: finalUser.xp,
    previousLevel,
    newLevel: finalLevelInfo.level,
    leveledUp: finalLevelInfo.level > previousLevel,
    newAchievements,
    newBadges,
    newRewards,
  };
}

/**
 * Core XP-awarding function. Accepts an optional `tx` so callers can
 * co-locate their side-writes (watch_sessions, watch_parties updates, etc.)
 * in the same atomic unit as the XP grant. If no tx is provided, a fresh
 * transaction is created internally.
 */
export async function awardXp(opts: AwardXpOptions): Promise<AwardXpResult> {
  if (opts.tx) {
    return awardXpInTx(opts.tx, opts);
  }
  return db.transaction(async (tx) => awardXpInTx(tx, opts));
}

/**
 * Run arbitrary progression-aware work inside a transaction. Action routes
 * use this to make their side-writes atomic with the XP grant.
 *
 *   await runProgressionTx(async (tx) => {
 *     await db.insert(watchSessions)...   // use tx instead of db
 *     const result = await awardXp({ ..., tx });
 *     await db.update(watchParties)...    // use tx instead of db
 *     return result;
 *   });
 */
export async function runProgressionTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
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

// Export log helper so other modules can use it consistently.
export { log };
