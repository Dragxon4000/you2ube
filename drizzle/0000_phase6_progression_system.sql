CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT '🏆' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"requirement_type" text NOT NULL,
	"requirement_value" integer NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'bronze' NOT NULL,
	CONSTRAINT "achievements_code_unique" UNIQUE("code"),
	CONSTRAINT "achievements_requirement_positive" CHECK ("achievements"."requirement_value" > 0),
	CONSTRAINT "achievements_xp_reward_non_negative" CHECK ("achievements"."xp_reward" >= 0)
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"tier" text DEFAULT 'common' NOT NULL,
	"requirement_text" text DEFAULT '' NOT NULL,
	CONSTRAINT "badges_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "friend_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"inviter_id" integer NOT NULL,
	"invitee_username" text NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_invites_xp_non_negative" CHECK ("friend_invites"."xp_earned" >= 0)
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"level" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"min_xp" integer NOT NULL,
	"perk" text DEFAULT '' NOT NULL,
	"color_hex" text DEFAULT '#6366f1' NOT NULL,
	CONSTRAINT "levels_min_xp_non_negative" CHECK ("levels"."min_xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"icon" text DEFAULT '🔔' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT '🎁' NOT NULL,
	"level_required" integer NOT NULL,
	"type" text DEFAULT 'cosmetic' NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "rewards_code_unique" UNIQUE("code"),
	CONSTRAINT "rewards_level_positive" CHECK ("rewards"."level_required" >= 1)
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"achievement_id" integer NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"unlocked" boolean DEFAULT false NOT NULL,
	"unlocked_at" timestamp,
	CONSTRAINT "user_ach_progress_non_negative" CHECK ("user_achievements"."progress" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"badge_id" integer NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"reward_id" integer NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_emoji" text DEFAULT '🎬' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"total_videos_watched" integer DEFAULT 0 NOT NULL,
	"total_parties_hosted" integer DEFAULT 0 NOT NULL,
	"total_friends_invited" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_xp_non_negative" CHECK ("users"."xp" >= 0),
	CONSTRAINT "users_level_positive" CHECK ("users"."level" >= 1),
	CONSTRAINT "users_videos_non_negative" CHECK ("users"."total_videos_watched" >= 0),
	CONSTRAINT "users_parties_non_negative" CHECK ("users"."total_parties_hosted" >= 0),
	CONSTRAINT "users_friends_non_negative" CHECK ("users"."total_friends_invited" >= 0)
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"thumbnail_emoji" text DEFAULT '🎞️' NOT NULL,
	"duration_sec" integer DEFAULT 60 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "videos_views_non_negative" CHECK ("videos"."views_count" >= 0),
	CONSTRAINT "videos_duration_positive" CHECK ("videos"."duration_sec" > 0)
);
--> statement-breakpoint
CREATE TABLE "watch_parties" (
	"id" serial PRIMARY KEY NOT NULL,
	"host_id" integer NOT NULL,
	"title" text NOT NULL,
	"attendee_count" integer DEFAULT 0 NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "watch_parties_attendees_non_negative" CHECK ("watch_parties"."attendee_count" >= 0),
	CONSTRAINT "watch_parties_xp_non_negative" CHECK ("watch_parties"."xp_earned" >= 0)
);
--> statement-breakpoint
CREATE TABLE "watch_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"video_id" integer NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"watched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "watch_sessions_xp_non_negative" CHECK ("watch_sessions"."xp_earned" >= 0)
);
--> statement-breakpoint
CREATE TABLE "xp_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"base_xp" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "xp_rules_action_unique" UNIQUE("action"),
	CONSTRAINT "xp_rules_base_xp_non_negative" CHECK ("xp_rules"."base_xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"reference_type" text,
	"reference_id" integer,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_invites" ADD CONSTRAINT "friend_invites_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rewards" ADD CONSTRAINT "user_rewards_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_parties" ADD CONSTRAINT "watch_parties_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_sessions" ADD CONSTRAINT "watch_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_sessions" ADD CONSTRAINT "watch_sessions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_category_idx" ON "achievements" USING btree ("category");--> statement-breakpoint
CREATE INDEX "friend_invites_inviter_idx" ON "friend_invites" USING btree ("inviter_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_min_xp_idx" ON "levels" USING btree ("min_xp");--> statement-breakpoint
CREATE INDEX "notif_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notif_user_unread_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "notif_user_type_idx" ON "notifications" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "rewards_level_idx" ON "rewards" USING btree ("level_required");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ach_unique_idx" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "user_ach_user_unlocked_idx" ON "user_achievements" USING btree ("user_id","unlocked");--> statement-breakpoint
CREATE UNIQUE INDEX "user_badge_unique_idx" ON "user_badges" USING btree ("user_id","badge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_reward_unique_idx" ON "user_rewards" USING btree ("user_id","reward_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_xp_desc_idx" ON "users" USING btree ("xp" DESC);--> statement-breakpoint
CREATE INDEX "users_level_idx" ON "users" USING btree ("level");--> statement-breakpoint
CREATE INDEX "videos_user_idx" ON "videos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watch_parties_host_idx" ON "watch_parties" USING btree ("host_id","created_at");--> statement-breakpoint
CREATE INDEX "watch_sessions_user_video_idx" ON "watch_sessions" USING btree ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "watch_sessions_user_video_time_idx" ON "watch_sessions" USING btree ("user_id","video_id","watched_at");--> statement-breakpoint
CREATE INDEX "xp_tx_user_idx" ON "xp_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_tx_idem_key_idx" ON "xp_transactions" USING btree ("user_id","idempotency_key");