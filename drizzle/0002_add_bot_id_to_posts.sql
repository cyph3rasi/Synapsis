-- Add bot_id column to posts table
ALTER TABLE "posts" ADD COLUMN "bot_id" uuid REFERENCES "bots"("id") ON DELETE SET NULL;

-- Create index for bot_id
CREATE INDEX IF NOT EXISTS "posts_bot_id_idx" ON "posts" ("bot_id");
