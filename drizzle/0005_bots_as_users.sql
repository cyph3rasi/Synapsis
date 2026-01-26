-- Bots as First-Class Users Migration
-- This migration transforms bots to have their own user accounts

-- Add bot-related fields to users table
ALTER TABLE "users" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN "bot_owner_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;

-- Create indexes for bot fields
CREATE INDEX IF NOT EXISTS "users_is_bot_idx" ON "users" ("is_bot");
CREATE INDEX IF NOT EXISTS "users_bot_owner_idx" ON "users" ("bot_owner_id");

-- Add owner_id to bots table (will be populated during migration)
ALTER TABLE "bots" ADD COLUMN "owner_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;

-- Copy existing userId to ownerId (existing bots were owned by the user)
UPDATE "bots" SET "owner_id" = "user_id";

-- Make owner_id NOT NULL after populating
ALTER TABLE "bots" ALTER COLUMN "owner_id" SET NOT NULL;

-- Create index for owner_id
CREATE INDEX IF NOT EXISTS "bots_owner_id_idx" ON "bots" ("owner_id");

-- Remove columns that are now on the user account
-- Note: handle, bio, avatarUrl, publicKey, privateKeyEncrypted move to users table
-- We'll keep them for now and handle migration in application code
-- ALTER TABLE "bots" DROP COLUMN "handle";
-- ALTER TABLE "bots" DROP COLUMN "bio";
-- ALTER TABLE "bots" DROP COLUMN "avatar_url";
-- ALTER TABLE "bots" DROP COLUMN "public_key";
-- ALTER TABLE "bots" DROP COLUMN "private_key_encrypted";

-- Drop the handle index since handle is now on users
DROP INDEX IF EXISTS "bots_handle_idx";
