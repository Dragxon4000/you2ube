CREATE TABLE "discord_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"discord_id" text NOT NULL,
	"discord_username" text NOT NULL,
	"discord_discriminator" text DEFAULT '0' NOT NULL,
	"discord_global_name" text,
	"discord_avatar" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"scopes" text DEFAULT 'identify' NOT NULL,
	"notify_level_ups" boolean DEFAULT true NOT NULL,
	"notify_achievements" boolean DEFAULT true NOT NULL,
	"notify_badges" boolean DEFAULT false NOT NULL,
	"rich_presence_enabled" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_accounts" ADD CONSTRAINT "discord_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discord_accounts_user_unique_idx" ON "discord_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_accounts_discord_id_unique_idx" ON "discord_accounts" USING btree ("discord_id");