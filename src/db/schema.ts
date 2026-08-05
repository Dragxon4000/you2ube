import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================================
// Users — single source of truth for user identity + progression state.
//
// This table is designed to coexist with (and be swappable to) Supabase Auth:
//   - When migrating to Supabase, add an `auth_id uuid` column linked to
//     `auth.users.id`, and keep this table as the "profile" / progression
//     record. `getCurrentUser()` in src/lib/session.ts is the single
//     abstraction layer — replace its internals, routes keep working.
//   - `username` is unique per process/session; in Supabase land it becomes
//     the canonical display handle.
// ============================================================================
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    avatarEmoji: text("avatar_emoji").notNull().default("🎬"),
    bio: text("bio").notNull().default(""),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(1),
    totalVideosWatched: integer("total_videos_watched").notNull().default(0),
    totalPartiesHosted: integer("total_parties_hosted").notNull().default(0),
    totalFriendsInvited: integer("total_friends_invited").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(t.username),
    // DESC index on xp — leaderboard is a hot query.
    xpDescIdx: index("users_xp_desc_idx").on(sql`${t.xp} DESC`),
    levelIdx: index("users_level_idx").on(t.level),
    nonNegativeXp: check("users_xp_non_negative", sql`${t.xp} >= 0`),
    nonNegativeLevel: check("users_level_positive", sql`${t.level} >= 1`),
    nonNegativeVideos: check("users_videos_non_negative", sql`${t.totalVideosWatched} >= 0`),
    nonNegativeParties: check("users_parties_non_negative", sql`${t.totalPartiesHosted} >= 0`),
    nonNegativeFriends: check("users_friends_non_negative", sql`${t.totalFriendsInvited} >= 0`),
  }),
);

// --- Level configuration (database-driven) ---
export const levels = pgTable(
  "levels",
  {
    level: integer("level").primaryKey(),
    title: text("title").notNull(),
    minXp: integer("min_xp").notNull(),
    perk: text("perk").notNull().default(""),
    colorHex: text("color_hex").notNull().default("#6366f1"),
  },
  (t) => ({
    minXpIdx: uniqueIndex("levels_min_xp_idx").on(t.minXp),
    nonNegativeMinXp: check("levels_min_xp_non_negative", sql`${t.minXp} >= 0`),
  }),
);

// --- XP transactions log (append-only ledger) ---
export const xpTransactions = pgTable(
  "xp_transactions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    referenceType: text("reference_type"),
    referenceId: integer("reference_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("xp_tx_user_idx").on(t.userId, t.createdAt),
    // Fast idempotency-key lookup — scoped to user to prevent cross-user reuse.
    idemKeyIdx: uniqueIndex("xp_tx_idem_key_idx").on(t.userId, t.idempotencyKey),
  }),
);

// --- Videos (tracked for XP) ---
export const videos = pgTable(
  "videos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    thumbnailEmoji: text("thumbnail_emoji").notNull().default("🎞️"),
    durationSec: integer("duration_sec").notNull().default(60),
    viewsCount: integer("views_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("videos_user_idx").on(t.userId),
    nonNegativeViews: check("videos_views_non_negative", sql`${t.viewsCount} >= 0`),
    nonNegativeDuration: check("videos_duration_positive", sql`${t.durationSec} > 0`),
  }),
);

// --- Watch sessions (each view grants XP once per video per day) ---
export const watchSessions = pgTable(
  "watch_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: integer("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    xpEarned: integer("xp_earned").notNull().default(0),
    watchedAt: timestamp("watched_at").notNull().defaultNow(),
  },
  (t) => ({
    userVideoIdx: index("watch_sessions_user_video_idx").on(t.userId, t.videoId),
    // Critical for 24h rate-limit query: WHERE user_id = ? AND video_id = ? AND watched_at >= ?
    userVideoTimeIdx: index("watch_sessions_user_video_time_idx").on(
      t.userId,
      t.videoId,
      t.watchedAt,
    ),
    nonNegativeXp: check("watch_sessions_xp_non_negative", sql`${t.xpEarned} >= 0`),
  }),
);

// --- Watch parties ---
export const watchParties = pgTable(
  "watch_parties",
  {
    id: serial("id").primaryKey(),
    hostId: integer("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    attendeeCount: integer("attendee_count").notNull().default(0),
    xpEarned: integer("xp_earned").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    hostIdx: index("watch_parties_host_idx").on(t.hostId, t.createdAt),
    nonNegativeAttendees: check("watch_parties_attendees_non_negative", sql`${t.attendeeCount} >= 0`),
    nonNegativeXp: check("watch_parties_xp_non_negative", sql`${t.xpEarned} >= 0`),
  }),
);

// --- Friend invites ---
export const friendInvites = pgTable(
  "friend_invites",
  {
    id: serial("id").primaryKey(),
    inviterId: integer("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeUsername: text("invitee_username").notNull(),
    xpEarned: integer("xp_earned").notNull().default(0),
    accepted: boolean("accepted").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    inviterIdx: index("friend_invites_inviter_idx").on(t.inviterId, t.createdAt),
    nonNegativeXp: check("friend_invites_xp_non_negative", sql`${t.xpEarned} >= 0`),
  }),
);

// --- Achievement definitions ---
export const achievements = pgTable(
  "achievements",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    icon: text("icon").notNull().default("🏆"),
    category: text("category").notNull().default("general"),
    requirementType: text("requirement_type").notNull(), // videos_watched | parties_hosted | friends_invited | xp_earned | level_reached
    requirementValue: integer("requirement_value").notNull(),
    xpReward: integer("xp_reward").notNull().default(0),
    tier: text("tier").notNull().default("bronze"), // bronze | silver | gold | diamond
  },
  (t) => ({
    categoryIdx: index("achievements_category_idx").on(t.category),
    positiveRequirement: check(
      "achievements_requirement_positive",
      sql`${t.requirementValue} > 0`,
    ),
    nonNegativeReward: check("achievements_xp_reward_non_negative", sql`${t.xpReward} >= 0`),
  }),
);

// --- User achievement progress & unlocks ---
export const userAchievements = pgTable(
  "user_achievements",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: integer("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    progress: integer("progress").notNull().default(0),
    unlocked: boolean("unlocked").notNull().default(false),
    unlockedAt: timestamp("unlocked_at"),
  },
  (t) => ({
    userAchIdx: uniqueIndex("user_ach_unique_idx").on(t.userId, t.achievementId),
    // Fast lookup of unlocked achievements for a user (used in profile counts).
    userUnlockedIdx: index("user_ach_user_unlocked_idx").on(t.userId, t.unlocked),
    nonNegativeProgress: check("user_ach_progress_non_negative", sql`${t.progress} >= 0`),
  }),
);

// --- Badge definitions ---
export const badges = pgTable("badges", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  tier: text("tier").notNull().default("common"), // common | rare | epic | legendary
  requirementText: text("requirement_text").notNull().default(""),
});

// --- User badges ---
export const userBadges = pgTable(
  "user_badges",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeId: integer("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    awardedAt: timestamp("awarded_at").notNull().defaultNow(),
  },
  (t) => ({
    userBadgeIdx: uniqueIndex("user_badge_unique_idx").on(t.userId, t.badgeId),
  }),
);

// --- Reward definitions (unlocked at level thresholds) ---
export const rewards = pgTable(
  "rewards",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    icon: text("icon").notNull().default("🎁"),
    levelRequired: integer("level_required").notNull(),
    type: text("type").notNull().default("cosmetic"), // cosmetic | currency | feature
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    levelIdx: index("rewards_level_idx").on(t.levelRequired),
    positiveLevel: check("rewards_level_positive", sql`${t.levelRequired} >= 1`),
  }),
);

// --- User reward claims ---
export const userRewards = pgTable(
  "user_rewards",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rewardId: integer("reward_id")
      .notNull()
      .references(() => rewards.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at").notNull().defaultNow(),
  },
  (t) => ({
    userRewardIdx: uniqueIndex("user_reward_unique_idx").on(t.userId, t.rewardId),
  }),
);

// --- Notifications ---
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // level_up | achievement | badge | reward | reward_available | xp | system
    title: text("title").notNull(),
    message: text("message").notNull(),
    icon: text("icon").notNull().default("🔔"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // Main feed query: latest N for a user.
    userCreatedAtIdx: index("notif_user_created_idx").on(t.userId, t.createdAt),
    // Unread-count query: WHERE user_id = ? AND read = false.
    userUnreadIdx: index("notif_user_unread_idx").on(t.userId, t.read),
    // Reward-spam prevention: WHERE user_id = ? AND type IN ('reward','reward_available').
    userTypeIdx: index("notif_user_type_idx").on(t.userId, t.type),
  }),
);

// ============================================================================
// Discord accounts — separate from `users` for three reasons:
//   1. OAuth tokens are sensitive; keep them out of the primary users row.
//   2. Unlinking is a clean DELETE instead of NULLing a dozen columns.
//   3. Extensible to other OAuth providers (Google, GitHub) as their own tables.
//
// Each `users.id` maps to AT MOST one `discord_accounts` row (unique FK).
// Each `discord_id` maps to AT MOST one user (unique constraint).
// ============================================================================
export const discordAccounts = pgTable(
  "discord_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    discordId: text("discord_id").notNull(),
    discordUsername: text("discord_username").notNull(),
    discordDiscriminator: text("discord_discriminator").notNull().default("0"),
    discordGlobalName: text("discord_global_name"),
    discordAvatar: text("discord_avatar"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    tokenExpiresAt: timestamp("token_expires_at").notNull(),
    scopes: text("scopes").notNull().default("identify"),
    notifyLevelUps: boolean("notify_level_ups").notNull().default(true),
    notifyAchievements: boolean("notify_achievements").notNull().default(true),
    notifyBadges: boolean("notify_badges").notNull().default(false),
    richPresenceEnabled: boolean("rich_presence_enabled").notNull().default(false),
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userUniqueIdx: uniqueIndex("discord_accounts_user_unique_idx").on(t.userId),
    discordIdUniqueIdx: uniqueIndex("discord_accounts_discord_id_unique_idx").on(t.discordId),
  }),
);

// --- XP rules (database-driven config for how much XP each action grants) ---
export const xpRules = pgTable(
  "xp_rules",
  {
    id: serial("id").primaryKey(),
    action: text("action").notNull().unique(), // watch_video | host_party | invite_friend | daily_login
    baseXp: integer("base_xp").notNull(),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => ({
    nonNegativeBaseXp: check("xp_rules_base_xp_non_negative", sql`${t.baseXp} >= 0`),
  }),
);
