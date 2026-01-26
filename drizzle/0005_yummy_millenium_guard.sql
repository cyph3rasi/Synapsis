ALTER TABLE "remote_followers" DROP CONSTRAINT "remote_followers_actor_url_unique";--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "favicon_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "remote_followers_user_actor_unique" ON "remote_followers" USING btree ("user_id","actor_url");