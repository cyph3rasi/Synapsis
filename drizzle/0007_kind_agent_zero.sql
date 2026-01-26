CREATE TABLE "remote_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"actor_handle" text NOT NULL,
	"actor_node_domain" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_reposts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"actor_handle" text NOT NULL,
	"actor_node_domain" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "turnstile_site_key" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "turnstile_secret_key" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "swarm_reply_to_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "swarm_reply_to_content" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "swarm_reply_to_author" text;--> statement-breakpoint
ALTER TABLE "remote_likes" ADD CONSTRAINT "remote_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_reposts" ADD CONSTRAINT "remote_reposts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "remote_likes_post_idx" ON "remote_likes" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "remote_likes_actor_idx" ON "remote_likes" USING btree ("actor_handle","actor_node_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "remote_likes_unique" ON "remote_likes" USING btree ("post_id","actor_handle","actor_node_domain");--> statement-breakpoint
CREATE INDEX "remote_reposts_post_idx" ON "remote_reposts" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "remote_reposts_actor_idx" ON "remote_reposts" USING btree ("actor_handle","actor_node_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "remote_reposts_unique" ON "remote_reposts" USING btree ("post_id","actor_handle","actor_node_domain");