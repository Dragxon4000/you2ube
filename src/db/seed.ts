import { db } from "@/db";
import {
  levels,
  achievements,
  badges,
  rewards,
  xpRules,
  users,
  videos,
  notifications,
} from "@/db/schema";
import { sql } from "drizzle-orm";

// Process-level memoization so we don't re-run the 5 COUNT queries on every request.
// Cleared automatically when the server process restarts.
let seedMemo: Promise<void> | null = null;

/**
 * Idempotent seed: populates progression system config tables only when empty.
 * Safe to call multiple times; memoized per server process.
 */
export function seedProgressionSystem(): Promise<void> {
  if (!seedMemo) {
    seedMemo = runSeed().catch(err => {
      seedMemo = null; // allow retry on failure
      throw err;
    });
  }
  return seedMemo;
}

async function runSeed() {
  // --- Levels (1..25, exponential curve) ---
  const existingLevels = await db.select({ count: sql<number>`count(*)::int` }).from(levels);
  if ((existingLevels[0]?.count ?? 0) === 0) {
    const levelRows = Array.from({ length: 25 }, (_, i) => {
      const lvl = i + 1;
      const minXp = Math.floor(100 * Math.pow(1.45, i));
      const titles = [
        "Couch Potato", "Channel Surfer", "Binge Beginner", "Popcorn Pro",
        "Stream Savant", "Viewing Veteran", "Media Maven", "Content Connoisseur",
        "Watch Wizard", "Cinema Sage", "Reel Royalty", "Screen Sovereign",
        "Broadcast Baron", "Pixel Pioneer", "Stream Legend", "Viewing Virtuoso",
        "Media Monarch", "Content Champion", "Watch Warlord", "Cinema Celestial",
        "Reel Ruler", "Screen Star", "Broadcast Boss", "Pixel Prophet", "Ultimate You2uber",
      ];
      const perks = [
        "Welcome to you2ube!", "Unlock custom avatar frames", "Post longer comments",
        "Access to trending playlists", "Host watch parties up to 5 friends",
        "Earn 10% bonus XP", "Unlock the 'Cinephile' badge", "Host parties up to 10 friends",
        "Access exclusive content", "Earn 20% bonus XP", "Unlock the 'VIP' badge",
        "Custom party themes", "Priority in recommendations", "Earn 30% bonus XP",
        "Unlock the 'Legend' badge", "Early access to features", "Host mega-parties (25 friends)",
        "Custom profile banner", "Earn 50% bonus XP", "Unlock the 'Mythic' badge",
        "Featured on the leaderboard", "Custom emoji reactions", "Earn 75% bonus XP",
        "Unlock the 'Ultimate' badge", "Founding member status",
      ];
      const colors = [
        "#94a3b8", "#64748b", "#0ea5e9", "#06b6d4", "#14b8a6",
        "#10b981", "#22c55e", "#84cc16", "#eab308", "#f59e0b",
        "#f97316", "#ef4444", "#e11d48", "#ec4899", "#d946ef",
        "#a855f7", "#8b5cf6", "#6366f1", "#3b82f6", "#2563eb",
        "#0891b2", "#059669", "#65a30d", "#ca8a04", "#dc2626",
      ];
      return {
        level: lvl,
        title: titles[i] ?? `Level ${lvl}`,
        minXp,
        perk: perks[i] ?? "—",
        colorHex: colors[i] ?? "#6366f1",
      };
    });
    await db.insert(levels).values(levelRows).onConflictDoNothing();
  }

  // --- XP rules ---
  const existingRules = await db.select({ count: sql<number>`count(*)::int` }).from(xpRules);
  if ((existingRules[0]?.count ?? 0) === 0) {
    await db.insert(xpRules).values([
      { action: "watch_video", baseXp: 25, description: "Watch a video (once per video per day)" },
      { action: "host_party", baseXp: 75, description: "Host a watch party (+10 per attendee)" },
      { action: "invite_friend", baseXp: 50, description: "Invite a friend who accepts" },
      { action: "daily_login", baseXp: 10, description: "Daily login bonus" },
    ]).onConflictDoNothing();
  }

  // --- Achievements ---
  const existingAch = await db.select({ count: sql<number>`count(*)::int` }).from(achievements);
  if ((existingAch[0]?.count ?? 0) === 0) {
    await db.insert(achievements).values([
      // Videos watched
      { code: "first_watch", name: "First Watch", description: "Watch your first video", icon: "👀", category: "watching", requirementType: "videos_watched", requirementValue: 1, xpReward: 20, tier: "bronze" },
      { code: "casual_viewer", name: "Casual Viewer", description: "Watch 10 videos", icon: "📺", category: "watching", requirementType: "videos_watched", requirementValue: 10, xpReward: 50, tier: "bronze" },
      { code: "binge_watcher", name: "Binge Watcher", description: "Watch 50 videos", icon: "🍿", category: "watching", requirementType: "videos_watched", requirementValue: 50, xpReward: 150, tier: "silver" },
      { code: "video_addict", name: "Video Addict", description: "Watch 200 videos", icon: "🎬", category: "watching", requirementType: "videos_watched", requirementValue: 200, xpReward: 500, tier: "gold" },
      { code: "legendary_viewer", name: "Legendary Viewer", description: "Watch 1000 videos", icon: "👑", category: "watching", requirementType: "videos_watched", requirementValue: 1000, xpReward: 2000, tier: "diamond" },

      // Parties
      { code: "first_party", name: "Party Starter", description: "Host your first watch party", icon: "🎉", category: "social", requirementType: "parties_hosted", requirementValue: 1, xpReward: 30, tier: "bronze" },
      { code: "social_butterfly", name: "Social Butterfly", description: "Host 10 watch parties", icon: "🦋", category: "social", requirementType: "parties_hosted", requirementValue: 10, xpReward: 100, tier: "silver" },
      { code: "party_legend", name: "Party Legend", description: "Host 50 watch parties", icon: "🪩", category: "social", requirementType: "parties_hosted", requirementValue: 50, xpReward: 400, tier: "gold" },

      // Friends
      { code: "first_invite", name: "Friendly", description: "Invite your first friend", icon: "👋", category: "social", requirementType: "friends_invited", requirementValue: 1, xpReward: 25, tier: "bronze" },
      { code: "networker", name: "Networker", description: "Invite 5 friends", icon: "🤝", category: "social", requirementType: "friends_invited", requirementValue: 5, xpReward: 100, tier: "silver" },
      { code: "community_builder", name: "Community Builder", description: "Invite 25 friends", icon: "🏛️", category: "social", requirementType: "friends_invited", requirementValue: 25, xpReward: 500, tier: "gold" },

      // XP / Level
      { code: "level_5", name: "Rising Star", description: "Reach level 5", icon: "⭐", category: "progression", requirementType: "level_reached", requirementValue: 5, xpReward: 100, tier: "bronze" },
      { code: "level_10", name: "Shining Bright", description: "Reach level 10", icon: "🌟", category: "progression", requirementType: "level_reached", requirementValue: 10, xpReward: 250, tier: "silver" },
      { code: "level_20", name: "Supernova", description: "Reach level 20", icon: "💫", category: "progression", requirementType: "level_reached", requirementValue: 20, xpReward: 1000, tier: "diamond" },
      { code: "xp_1000", name: "Thousandaire", description: "Earn 1,000 total XP", icon: "💰", category: "progression", requirementType: "xp_earned", requirementValue: 1000, xpReward: 50, tier: "bronze" },
      { code: "xp_10000", name: "XP Mogul", description: "Earn 10,000 total XP", icon: "💎", category: "progression", requirementType: "xp_earned", requirementValue: 10000, xpReward: 250, tier: "gold" },
    ]).onConflictDoNothing();
  }

  // --- Badges ---
  const existingBadges = await db.select({ count: sql<number>`count(*)::int` }).from(badges);
  if ((existingBadges[0]?.count ?? 0) === 0) {
    await db.insert(badges).values([
      { code: "newbie", name: "Newbie", description: "Joined you2ube", icon: "🌱", tier: "common", requirementText: "Automatically awarded on signup" },
      { code: "cinephile", name: "Cinephile", description: "Lover of all things cinema", icon: "🎞️", tier: "rare", requirementText: "Reach level 7" },
      { code: "vip", name: "VIP", description: "Very Important Viewer", icon: "🎫", tier: "epic", requirementText: "Reach level 11" },
      { code: "legend", name: "Legend", description: "A true you2ube legend", icon: "🏅", tier: "legendary", requirementText: "Reach level 15" },
      { code: "mythic", name: "Mythic", description: "Beyond legendary status", icon: "🔱", tier: "legendary", requirementText: "Reach level 20" },
      { code: "host_hero", name: "Host Hero", description: "Hosted 25+ watch parties", icon: "🎤", tier: "epic", requirementText: "Host 25 watch parties" },
      { code: "social_star", name: "Social Star", description: "Invited 10+ friends", icon: "✨", tier: "rare", requirementText: "Invite 10 friends" },
      { code: "binge_king", name: "Binge King", description: "Watched 100+ videos", icon: "👑", tier: "epic", requirementText: "Watch 100 videos" },
    ]).onConflictDoNothing();
  }

  // --- Rewards (unlocked at level milestones) ---
  const existingRewards = await db.select({ count: sql<number>`count(*)::int` }).from(rewards);
  if ((existingRewards[0]?.count ?? 0) === 0) {
    await db.insert(rewards).values([
      { code: "frame_gold", name: "Gold Avatar Frame", description: "A shiny gold frame for your avatar", icon: "🖼️", levelRequired: 3, type: "cosmetic", value: { frame: "gold" } },
      { code: "emoji_pack_1", name: "Reaction Pack Vol. 1", description: "Unlock 10 new reaction emojis", icon: "😎", levelRequired: 5, type: "cosmetic", value: { emojis: ["🔥", "💯", "🙌", "😍", "🤩", "👏", "🎊", "🥳", "🤯", "💥"] } },
      { code: "coins_500", name: "500 Coins", description: "In-app currency for gifts and tips", icon: "🪙", levelRequired: 7, type: "currency", value: { coins: 500 } },
      { code: "party_theme_neon", name: "Neon Party Theme", description: "Host watch parties with a neon vibe", icon: "💡", levelRequired: 10, type: "feature", value: { theme: "neon" } },
      { code: "frame_diamond", name: "Diamond Avatar Frame", description: "The rarest frame in the game", icon: "💎", levelRequired: 15, type: "cosmetic", value: { frame: "diamond" } },
      { code: "coins_2000", name: "2,000 Coins", description: "A hefty coin drop for loyal viewers", icon: "💰", levelRequired: 20, type: "currency", value: { coins: 2000 } },
      { code: "custom_banner", name: "Custom Profile Banner", description: "Upload your own profile banner", icon: "🎨", levelRequired: 18, type: "feature", value: { feature: "custom_banner" } },
    ]).onConflictDoNothing();
  }

  // --- Demo users + demo content (only if none exist) ---
  const existingUsers = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if ((existingUsers[0]?.count ?? 0) === 0) {
    const [you] = await db.insert(users).values([
      { username: "you", displayName: "You", avatarEmoji: "🎬", bio: "Your you2ube journey starts here.", xp: 0, level: 1 },
      { username: "alice", displayName: "Alice Binger", avatarEmoji: "🦊", bio: "I watch everything.", xp: 2450, level: 6 },
      { username: "bob", displayName: "Bob Party", avatarEmoji: "🐻", bio: "Watch-party host extraordinaire.", xp: 5200, level: 9 },
      { username: "cara", displayName: "Cara Stream", avatarEmoji: "🐼", bio: "Community builder.", xp: 12800, level: 14 },
    ]).returning();

    // Seed a few demo videos for the "watch video" action
    if (you) {
      await db.insert(videos).values([
        { userId: you.id, title: "How to make the perfect espresso", thumbnailEmoji: "☕", durationSec: 240 },
        { userId: you.id, title: "Sunset timelapse over the mountains", thumbnailEmoji: "🌄", durationSec: 120 },
        { userId: you.id, title: "Beginner's guide to watercolor painting", thumbnailEmoji: "🎨", durationSec: 480 },
        { userId: you.id, title: "Top 10 indie games of the year", thumbnailEmoji: "🎮", durationSec: 360 },
        { userId: you.id, title: "Lo-fi beats for studying", thumbnailEmoji: "🎧", durationSec: 1800 },
        { userId: you.id, title: "Street food tour: Tokyo edition", thumbnailEmoji: "🍜", durationSec: 540 },
        { userId: you.id, title: "Quick 10-minute home workout", thumbnailEmoji: "💪", durationSec: 600 },
        { userId: you.id, title: "Behind the scenes of a film set", thumbnailEmoji: "🎥", durationSec: 420 },
      ]);
    }

    // Welcome notification
    if (you) {
      await db.insert(notifications).values({
        userId: you.id,
        type: "system",
        title: "Welcome to you2ube! 🎉",
        message: "Start watching videos, hosting watch parties, and inviting friends to earn XP and level up.",
        icon: "👋",
      });
    }
  }
}
