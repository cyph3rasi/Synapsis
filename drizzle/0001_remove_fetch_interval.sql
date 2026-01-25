-- Remove fetch_interval_minutes column from bot_content_sources
ALTER TABLE "bot_content_sources" DROP COLUMN IF EXISTS "fetch_interval_minutes";
