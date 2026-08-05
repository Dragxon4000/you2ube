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
} from "drizzle-orm/pg-core";

// --- Users ---
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
  },
  (t) => ({
    usernameIdx: uniqueIndex("users_username_idx").on(t.username),
    levelIdx: index("users_level_idx").on(t.level),
    xpIdx: index("users_xp_idx").on(t.xp),
  }),
);

// --- Level configuration (database-driven) ---
export const levels = pgTable("levels", {
  level: integer("level").primaryKey(),
  title: text("title").notNull(),
  minXp: integer("min_xp").notNull(),
  perk: text("perk").notNull().default(""),
  colorHex: text("color_hex").notNull().default("#6366f1"),
});

// --- XP transactions log ---
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("xp_tx_user_idx").on(t.userId),
  }),
);

// --- Videos (tracked for XP) ---
export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  thumbnailEmoji: text("thumbnail_emoji").notNull().default("🎞️"),
  durationSec: integer("duration_sec").notNull().default(60),
  viewsCount: integer("views_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  }),
);

// --- Watch parties ---
export const watchParties = pgTable("watch_parties", {
  id: serial("id").primaryKey(),
  hostId: integer("host_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  attendeeCount: integer("attendee_count").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Friend invites ---
export const friendInvites = pgTable("friend_invites", {
  id: serial("id").primaryKey(),
  inviterId: integer("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inviteeUsername: text("invitee_username").notNull(),
  xpEarned: integer("xp_earned").notNull().default(0),
  accepted: boolean("accepted").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Achievement definitions ---
export const achievements = pgTable("achievements", {
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
});

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
export const rewards = pgTable("rewards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("🎁"),
  levelRequired: integer("level_required").notNull(),
  type: text("type").notNull().default("cosmetic"), // cosmetic | currency | feature
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
});

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
    type: text("type").notNull(), // level_up | achievement | badge | reward | xp
    title: text("title").notNull(),
    message: text("message").notNull(),
    icon: text("icon").notNull().default("🔔"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notif_user_idx").on(t.userId, t.createdAt),
  }),
);

// --- XP rules (database-driven config for how much XP each action grants) ---
export const xpRules = pgTable("xp_rules", {
  id: serial("id").primaryKey(),
  action: text("action").notNull().unique(), // watch_video | host_party | invite_friend
  baseXp: integer("base_xp").notNull(),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
});
