CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'direct' NOT NULL,
	"participant1_id" uuid NOT NULL,
	"participant2_handle" text NOT NULL,
	"last_message_at" timestamp,
	"last_message_preview" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_handle" text NOT NULL,
	"sender_display_name" text,
	"sender_avatar_url" text,
	"sender_node_domain" text,
	"encrypted_content" text NOT NULL,
	"swarm_message_id" text,
	"delivered_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_swarm_message_id_unique" UNIQUE("swarm_message_id")
);
--> statement-breakpoint
CREATE TABLE "chat_typing_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_handle" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_participant1_id_users_id_fk" FOREIGN KEY ("participant1_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_typing_indicators" ADD CONSTRAINT "chat_typing_indicators_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_participant1_idx" ON "chat_conversations" USING btree ("participant1_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_last_message_idx" ON "chat_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversations_unique" ON "chat_conversations" USING btree ("participant1_id","participant2_handle");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_swarm_id_idx" ON "chat_messages" USING btree ("swarm_message_id");--> statement-breakpoint
CREATE INDEX "chat_typing_conversation_idx" ON "chat_typing_indicators" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_typing_expires_idx" ON "chat_typing_indicators" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_typing_unique" ON "chat_typing_indicators" USING btree ("conversation_id","user_handle");