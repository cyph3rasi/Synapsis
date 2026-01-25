ALTER TABLE "bots" DROP CONSTRAINT "bots_handle_unique";--> statement-breakpoint
ALTER TABLE "bot_content_items" DROP CONSTRAINT "bot_content_items_post_id_posts_id_fk";
--> statement-breakpoint
DROP INDEX "bots_handle_idx";--> statement-breakpoint
ALTER TABLE "bot_content_sources" ADD COLUMN "source_config" text;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "bot_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bot_owner_id" uuid;--> statement-breakpoint
ALTER TABLE "bot_content_items" ADD CONSTRAINT "bot_content_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bot_owner_id_users_id_fk" FOREIGN KEY ("bot_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bots_owner_id_idx" ON "bots" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "posts_bot_id_idx" ON "posts" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "users_is_bot_idx" ON "users" USING btree ("is_bot");--> statement-breakpoint
CREATE INDEX "users_bot_owner_idx" ON "users" USING btree ("bot_owner_id");--> statement-breakpoint
ALTER TABLE "bot_content_sources" DROP COLUMN "fetch_interval_minutes";--> statement-breakpoint
ALTER TABLE "bots" DROP COLUMN "handle";--> statement-breakpoint
ALTER TABLE "bots" DROP COLUMN "bio";--> statement-breakpoint
ALTER TABLE "bots" DROP COLUMN "avatar_url";--> statement-breakpoint
ALTER TABLE "bots" DROP COLUMN "public_key";--> statement-breakpoint
ALTER TABLE "bots" DROP COLUMN "private_key_encrypted";