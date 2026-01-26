-- Add favicon_url column to nodes table
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "favicon_url" text;
