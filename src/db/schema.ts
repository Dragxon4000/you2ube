import {
  boolean,
  index,
  pgTable,
  text,
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
  avatarUrl: text("avatar_url"),
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
    // Speeds up "delete all sessions for user" (logout-everywhere / password reset)
    // and any future "list sessions for user" queries.
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
    // Speeds up "find valid token for user" / cleanup-by-user queries.
    index("verification_tokens_user_id_idx").on(table.userId),
  ],
);
