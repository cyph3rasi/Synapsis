-- Add source_config column for Brave News and News API query builder configurations
ALTER TABLE "bot_content_sources" ADD COLUMN "source_config" text;
