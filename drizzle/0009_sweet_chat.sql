CREATE TABLE "remote_identity_cache" (
	"did" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signed_action_dedupe" (
	"action_id" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"nonce" text NOT NULL,
	"ts" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_encrypted_content" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_chat_public_key" text;--> statement-breakpoint
ALTER TABLE "nodes" ADD COLUMN "private_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_public_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "chat_private_key_encrypted" text;--> statement-breakpoint
CREATE INDEX "signed_action_dedupe_created_idx" ON "signed_action_dedupe" USING btree ("created_at");