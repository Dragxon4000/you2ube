ALTER TABLE "users" ADD COLUMN "session_token_hash" text;--> statement-breakpoint
CREATE INDEX "users_session_token_hash_idx" ON "users" USING btree ("session_token_hash");