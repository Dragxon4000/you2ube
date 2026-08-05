import { NextResponse } from "next/server";
import { db } from "@/db";
import { videos, discordAccounts } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { getLevelForXp, getXpProgress } from "@/lib/progression";
import {
  withAuth, apiError, ErrorCode, log,
} from "@/lib/api-helpers";
import { getAvatarUrl } from "@/lib/discord";
import {
  users, notifications, achievements, userAchievements, userBadges, badges, rewards, userRewards, xpTransactions,
} from "@/db/schema";

// GET /api/profile - full profile card data
export async function GET() {
  return withAuth(async ({ user }) => {
    try {
      const levelInfo = await getLevelForXp(user.xp);
      const progress = await getXpProgress(user.xp, user.level);

      const ownedBadges = await db
        .select({
          id: badges.id,
          code: badges.code,
          name: badges.name,
          description: badges.description,
          icon: badges.icon,
          tier: badges.tier,
          awardedAt: userBadges.awardedAt,
        })
        .from(userBadges)
        .innerJoin(badges, eq(userBadges.badgeId, badges.id))
        .where(eq(userBadges.userId, user.id))
        .orderBy(userBadges.awardedAt);

      const claimedRewards = await db
        .select({
          id: rewards.id,
          code: rewards.code,
          name: rewards.name,
          icon: rewards.icon,
          claimedAt: userRewards.claimedAt,
        })
        .from(userRewards)
        .innerJoin(rewards, eq(userRewards.rewardId, rewards.id))
        .where(eq(userRewards.userId, user.id))
        .orderBy(userRewards.claimedAt);

      const unlockedCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userAchievements)
        .where(and(eq(userAchievements.userId, user.id), eq(userAchievements.unlocked, true)))
        .then(r => r[0]?.count ?? 0);

      const totalAch = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(achievements)
        .then(r => r[0]?.count ?? 0);

      const recentTx = await db
        .select()
        .from(xpTransactions)
        .where(eq(xpTransactions.userId, user.id))
        .orderBy(xpTransactions.createdAt)
        .limit(5);

      const unreadNotifs = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.read, false)))
        .then(r => r[0]?.count ?? 0);

      // Discord link (if any). Never returns tokens.
      const discordRow = await db
        .select()
        .from(discordAccounts)
        .where(eq(discordAccounts.userId, user.id))
        .then(r => r[0]);
      const discord = discordRow ? {
        linked: true,
        discordId: discordRow.discordId,
        username: discordRow.discordUsername,
        discriminator: discordRow.discordDiscriminator,
        globalName: discordRow.discordGlobalName,
        avatarUrl: getAvatarUrl({
          id: discordRow.discordId,
          username: discordRow.discordUsername,
          discriminator: discordRow.discordDiscriminator,
          global_name: discordRow.discordGlobalName,
          avatar: discordRow.discordAvatar,
        }),
        linkedAt: discordRow.linkedAt,
        notifyLevelUps: discordRow.notifyLevelUps,
        notifyAchievements: discordRow.notifyAchievements,
        notifyBadges: discordRow.notifyBadges,
        richPresenceEnabled: discordRow.richPresenceEnabled,
      } : { linked: false };

      return NextResponse.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarEmoji: user.avatarEmoji,
          bio: user.bio,
          xp: user.xp,
          level: user.level,
          totalVideosWatched: user.totalVideosWatched,
          totalPartiesHosted: user.totalPartiesHosted,
          totalFriendsInvited: user.totalFriendsInvited,
          createdAt: user.createdAt,
        },
        level: levelInfo,
        progress,
        ownedBadges,
        claimedRewards,
        achievements: { unlocked: unlockedCount, total: totalAch },
        recentTransactions: recentTx,
        unreadNotifications: unreadNotifs,
        discord,
      });
    } catch (err) {
      log("error", "profile GET failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to load profile");
    }
  });
}
