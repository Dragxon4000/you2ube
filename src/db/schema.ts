import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Authentication schema
//
// This app uses ONE custom, self-hosted credentials-based auth system built
// directly on top of this PostgreSQL database via Drizzle. There is no
// Supabase/NextAuth/Clerk involved — sessions are opaque tokens stored
// (hashed) in the `sessions` table and handed to the browser as an httpOnly
// cookie. Email verification / password reset tokens follow the same
// hashed-token pattern in `verification_tokens`.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Automatically created alongside every new user (one-to-one "profile").
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  location: text("location"),
  websiteUrl: text("website_url"),
  avatarUrl: text("avatar_url"),
  avatarPath: text("avatar_path"),
  profileVisibility: text("profile_visibility", { enum: ["public", "friends", "private"] })
    .notNull()
    .default("public"),
  showWatchHistory: boolean("show_watch_history").notNull().default(true),
  showXp: boolean("show_xp").notNull().default(true),
  showAchievements: boolean("show_achievements").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Server-side session store. The cookie only ever holds the raw opaque
// token; we persist a SHA-256 hash of it here so a DB leak can't be used to
// hijack sessions directly.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token) hex digest
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
  ],
);

// Shared table for both email verification and password reset flows.
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    type: text("type", { enum: ["email_verification", "password_reset"] }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verification_tokens_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Social / XP / Watch Sessions schema (Phase 3)
// ---------------------------------------------------------------------------

// Tracks XP earned by users through various activities
export const xpLedger = pgTable(
  "xp_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(), // e.g. "watch_session", "achievement", "daily_login"
    referenceId: text("reference_id"), // optional FK to the source (e.g. watch_session id)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("xp_ledger_user_id_idx").on(table.userId),
  ],
);

// YouTube watch sessions — tracks what the user watched and for how long
export const watchSessions = pgTable(
  "watch_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(), // YouTube video ID
    videoTitle: text("video_title").notNull(),
    channelName: text("channel_name"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"), // total video duration
    watchedSeconds: integer("watched_seconds").notNull().default(0), // furthest observed playback time
    resumePositionSeconds: integer("resume_position_seconds").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastWatchedAt: timestamp("last_watched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("watch_sessions_user_video_unique").on(table.userId, table.videoId),
    index("watch_sessions_user_id_idx").on(table.userId),
    index("watch_sessions_video_id_idx").on(table.videoId),
  ],
);

// Achievement definitions
export const achievements = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("🏆"),
  xpReward: integer("xp_reward").notNull().default(0),
  requirement: text("requirement").notNull(), // JSON string describing the condition
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// User achievements (many-to-many)
export const userAchievements = pgTable(
  "user_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_achievements_user_achievement_unique").on(table.userId, table.achievementId),
    index("user_achievements_user_id_idx").on(table.userId),
    index("user_achievements_achievement_id_idx").on(table.achievementId),
  ],
);

// Search history for the user
export const searchHistory = pgTable(
  "search_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    resultCount: integer("result_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("search_history_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Social system (Phase 4)
// ---------------------------------------------------------------------------

export const friendRequestStatus = ["pending", "accepted", "rejected", "cancelled"] as const;
export type FriendRequestStatus = (typeof friendRequestStatus)[number];

// One-sided friend requests. A pending row means from → to is awaiting response.
// Accepted requests are mirrored into the `friendships` table for fast queries.
export const friendRequests = pgTable(
  "friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: friendRequestStatus }).notNull().default("pending"),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("friend_requests_unique_pending_pair_idx")
      .on(
        sql`LEAST(${table.senderId}, ${table.receiverId})`,
        sql`GREATEST(${table.senderId}, ${table.receiverId})`,
      )
      .where(sql`${table.status} = 'pending'`),
    index("friend_requests_sender_id_idx").on(table.senderId),
    index("friend_requests_receiver_id_idx").on(table.receiverId),
    index("friend_requests_status_idx").on(table.status),
  ],
);

// Canonical friendship edge. The application always writes the lexicographically
// smaller UUID to user_a and the larger UUID to user_b, so one row represents
// the relationship in both directions.
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userA: uuid("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: uuid("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("friendships_user_pair_unique").on(table.userA, table.userB),
    index("friendships_user_a_idx").on(table.userA),
    index("friendships_user_b_idx").on(table.userB),
  ],
);

// Public activity feed entries (watched, achievement unlocked, level up, etc.)
export const activityType = [
  "watch_start",
  "watch_complete",
  "level_up",
  "achievement_unlock",
  "friend_added",
] as const;

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: activityType }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    visibility: text("visibility", { enum: ["public", "friends", "private"] })
      .notNull()
      .default("friends"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activities_user_id_idx").on(table.userId),
    index("activities_created_at_idx").on(table.createdAt),
    index("activities_type_idx").on(table.type),
  ],
);

// Lightweight user presence — updated periodically by the client.
export const presenceStatus = ["online", "away", "offline"] as const;

export const presence = pgTable(
  "presence",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: presenceStatus }).notNull().default("offline"),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    currentVideoId: text("current_video_id"),
    currentVideoTitle: text("current_video_title"),
    customStatus: text("custom_status"),
  },
  (table) => [
    index("presence_status_idx").on(table.status),
    index("presence_last_seen_idx").on(table.lastSeen),
  ],
);

