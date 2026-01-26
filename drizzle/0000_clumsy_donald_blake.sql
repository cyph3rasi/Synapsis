CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"action" text NOT NULL,
	"details" text NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"url" text NOT NULL,
	"published_at" timestamp NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"is_processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"post_id" uuid,
	"interest_score" integer,
	"interest_reason" text
);
--> statement-breakpoint
CREATE TABLE "bot_content_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"subreddit" text,
	"api_key_encrypted" text,
	"fetch_interval_minutes" integer DEFAULT 30 NOT NULL,
	"keywords" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_fetch_at" timestamp,
	"last_error" text,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"response_post_id" uuid,
	"is_remote" boolean DEFAULT false NOT NULL,
	"remote_actor_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_type" text NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"bio" text,
	"avatar_url" text,
	"personality_config" text NOT NULL,
	"llm_provider" text NOT NULL,
	"llm_model" text NOT NULL,
	"llm_api_key_encrypted" text NOT NULL,
	"schedule_config" text,
	"autonomous_mode" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"suspension_reason" text,
	"suspended_at" timestamp,
	"public_key" text NOT NULL,
	"private_key_encrypted" text NOT NULL,
	"last_post_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bots_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"ap_id" text,
	"pending" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follows_ap_id_unique" UNIQUE("ap_id")
);
--> statement-breakpoint
CREATE TABLE "handle_registry" (
	"handle" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"node_domain" text NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"ap_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "likes_ap_id_unique" UNIQUE("ap_id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid,
	"url" text NOT NULL,
	"alt_text" text,
	"mime_type" text,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"muted_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"long_description" text,
	"rules" text,
	"banner_url" text,
	"accent_color" text DEFAULT '#FFFFFF',
	"public_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nodes_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"post_id" uuid,
	"type" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"reply_to_id" uuid,
	"repost_of_id" uuid,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"reposts_count" integer DEFAULT 0 NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"is_removed" boolean DEFAULT false NOT NULL,
	"removed_at" timestamp,
	"removed_by" uuid,
	"removed_reason" text,
	"ap_id" text,
	"ap_url" text,
	"link_preview_url" text,
	"link_preview_title" text,
	"link_preview_description" text,
	"link_preview_image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "posts_ap_id_unique" UNIQUE("ap_id")
);
--> statement-breakpoint
CREATE TABLE "remote_followers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_url" text NOT NULL,
	"inbox_url" text NOT NULL,
	"shared_inbox_url" text,
	"handle" text,
	"activity_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "remote_followers_actor_url_unique" UNIQUE("actor_url")
);
--> statement-breakpoint
CREATE TABLE "remote_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"target_handle" text NOT NULL,
	"target_actor_url" text NOT NULL,
	"inbox_url" text NOT NULL,
	"activity_id" text NOT NULL,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ap_id" text NOT NULL,
	"author_handle" text NOT NULL,
	"author_actor_url" text NOT NULL,
	"author_display_name" text,
	"author_avatar_url" text,
	"content" text NOT NULL,
	"published_at" timestamp NOT NULL,
	"link_preview_url" text,
	"link_preview_title" text,
	"link_preview_description" text,
	"link_preview_image" text,
	"media_json" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "remote_posts_ap_id_unique" UNIQUE("ap_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"did" text NOT NULL,
	"handle" text NOT NULL,
	"email" text,
	"password_hash" text,
	"display_name" text,
	"bio" text,
	"avatar_url" text,
	"header_url" text,
	"private_key_encrypted" text,
	"public_key" text NOT NULL,
	"node_id" uuid,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"suspension_reason" text,
	"suspended_at" timestamp,
	"is_silenced" boolean DEFAULT false NOT NULL,
	"silence_reason" text,
	"silenced_at" timestamp,
	"moved_to" text,
	"moved_from" text,
	"migrated_at" timestamp,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"posts_count" integer DEFAULT 0 NOT NULL,
	"website" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_did_unique" UNIQUE("did"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_activity_logs" ADD CONSTRAINT "bot_activity_logs_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_content_items" ADD CONSTRAINT "bot_content_items_source_id_bot_content_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."bot_content_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_content_items" ADD CONSTRAINT "bot_content_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_content_sources" ADD CONSTRAINT "bot_content_sources_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_mentions" ADD CONSTRAINT "bot_mentions_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_mentions" ADD CONSTRAINT "bot_mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_mentions" ADD CONSTRAINT "bot_mentions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_mentions" ADD CONSTRAINT "bot_mentions_response_post_id_posts_id_fk" FOREIGN KEY ("response_post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_rate_limits" ADD CONSTRAINT "bot_rate_limits_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muted_user_id_users_id_fk" FOREIGN KEY ("muted_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_followers" ADD CONSTRAINT "remote_followers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_follows" ADD CONSTRAINT "remote_follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_user_idx" ON "blocks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bot_activity_logs_bot_idx" ON "bot_activity_logs" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bot_activity_logs_action_idx" ON "bot_activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "bot_activity_logs_created_idx" ON "bot_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bot_content_items_source_idx" ON "bot_content_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "bot_content_items_processed_idx" ON "bot_content_items" USING btree ("is_processed");--> statement-breakpoint
CREATE INDEX "bot_content_items_external_idx" ON "bot_content_items" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "bot_content_sources_bot_idx" ON "bot_content_sources" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bot_content_sources_type_idx" ON "bot_content_sources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "bot_mentions_bot_idx" ON "bot_mentions" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bot_mentions_processed_idx" ON "bot_mentions" USING btree ("is_processed");--> statement-breakpoint
CREATE INDEX "bot_mentions_created_idx" ON "bot_mentions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bot_rate_limits_bot_window_idx" ON "bot_rate_limits" USING btree ("bot_id","window_start");--> statement-breakpoint
CREATE INDEX "bots_user_id_idx" ON "bots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bots_handle_idx" ON "bots" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "bots_active_idx" ON "bots" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "follows_follower_idx" ON "follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "follows_following_idx" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "handle_registry_updated_idx" ON "handle_registry" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "likes_user_post_idx" ON "likes" USING btree ("user_id","post_id");--> statement-breakpoint
CREATE INDEX "media_user_idx" ON "media" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_post_idx" ON "media" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "mutes_user_idx" ON "mutes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_user_id_idx" ON "posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_reply_to_idx" ON "posts" USING btree ("reply_to_id");--> statement-breakpoint
CREATE INDEX "posts_removed_idx" ON "posts" USING btree ("is_removed");--> statement-breakpoint
CREATE INDEX "remote_followers_user_idx" ON "remote_followers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "remote_followers_actor_idx" ON "remote_followers" USING btree ("actor_url");--> statement-breakpoint
CREATE INDEX "remote_follows_follower_idx" ON "remote_follows" USING btree ("follower_id");--> statement-breakpoint
CREATE INDEX "remote_follows_target_idx" ON "remote_follows" USING btree ("target_handle");--> statement-breakpoint
CREATE INDEX "remote_posts_author_idx" ON "remote_posts" USING btree ("author_handle");--> statement-breakpoint
CREATE INDEX "remote_posts_published_idx" ON "remote_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "remote_posts_ap_id_idx" ON "remote_posts" USING btree ("ap_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_handle_idx" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "users_did_idx" ON "users" USING btree ("did");--> statement-breakpoint
CREATE INDEX "users_suspended_idx" ON "users" USING btree ("is_suspended");--> statement-breakpoint
CREATE INDEX "users_silenced_idx" ON "users" USING btree ("is_silenced");