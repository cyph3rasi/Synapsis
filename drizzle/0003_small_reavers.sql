CREATE TABLE "swarm_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"description" text,
	"logo_url" text,
	"public_key" text,
	"software_version" text,
	"user_count" integer,
	"post_count" integer,
	"discovered_via" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_sync_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"trust_score" integer DEFAULT 50 NOT NULL,
	"capabilities" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "swarm_nodes_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "swarm_seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_contact_at" timestamp,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "swarm_seeds_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "swarm_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remote_domain" text NOT NULL,
	"direction" text NOT NULL,
	"nodes_received" integer DEFAULT 0 NOT NULL,
	"nodes_sent" integer DEFAULT 0 NOT NULL,
	"handles_received" integer DEFAULT 0 NOT NULL,
	"handles_sent" integer DEFAULT 0 NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "swarm_nodes_domain_idx" ON "swarm_nodes" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "swarm_nodes_active_idx" ON "swarm_nodes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "swarm_nodes_last_seen_idx" ON "swarm_nodes" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "swarm_nodes_trust_idx" ON "swarm_nodes" USING btree ("trust_score");--> statement-breakpoint
CREATE INDEX "swarm_seeds_enabled_idx" ON "swarm_seeds" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "swarm_seeds_priority_idx" ON "swarm_seeds" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "swarm_sync_log_remote_idx" ON "swarm_sync_log" USING btree ("remote_domain");--> statement-breakpoint
CREATE INDEX "swarm_sync_log_created_idx" ON "swarm_sync_log" USING btree ("created_at");