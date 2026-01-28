CREATE TABLE "chat_device_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"did" text NOT NULL,
	"device_id" text NOT NULL,
	"identity_key" text NOT NULL,
	"signed_pre_key" text NOT NULL,
	"signature" text NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_did" text NOT NULL,
	"recipient_device_id" text,
	"sender_did" text NOT NULL,
	"envelope_json" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_one_time_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bundle_id" uuid NOT NULL,
	"key_id" integer NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_did" text;--> statement-breakpoint
ALTER TABLE "chat_device_bundles" ADD CONSTRAINT "chat_device_bundles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_one_time_keys" ADD CONSTRAINT "chat_one_time_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_one_time_keys" ADD CONSTRAINT "chat_one_time_keys_bundle_id_chat_device_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."chat_device_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_bundles_user_idx" ON "chat_device_bundles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_bundles_did_idx" ON "chat_device_bundles" USING btree ("did");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_bundles_device_unique" ON "chat_device_bundles" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "chat_inbox_recipient_idx" ON "chat_inbox" USING btree ("recipient_did","recipient_device_id");--> statement-breakpoint
CREATE INDEX "chat_inbox_created_idx" ON "chat_inbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_otk_bundle_idx" ON "chat_one_time_keys" USING btree ("bundle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_otk_unique" ON "chat_one_time_keys" USING btree ("bundle_id","key_id");