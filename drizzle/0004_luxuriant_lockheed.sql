CREATE TABLE "muted_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"node_domain" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "is_nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "is_nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "swarm_nodes" ADD COLUMN "is_nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nsfw_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "age_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "muted_nodes" ADD CONSTRAINT "muted_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "muted_nodes_user_idx" ON "muted_nodes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "muted_nodes_domain_idx" ON "muted_nodes" USING btree ("node_domain");--> statement-breakpoint
CREATE INDEX "blocks_blocked_user_idx" ON "blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "mutes_muted_user_idx" ON "mutes" USING btree ("muted_user_id");--> statement-breakpoint
CREATE INDEX "posts_nsfw_idx" ON "posts" USING btree ("is_nsfw");--> statement-breakpoint
CREATE INDEX "swarm_nodes_nsfw_idx" ON "swarm_nodes" USING btree ("is_nsfw");--> statement-breakpoint
CREATE INDEX "users_nsfw_idx" ON "users" USING btree ("is_nsfw");