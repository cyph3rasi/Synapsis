-- Migration: Add logo_data and favicon_data columns for base64 storage
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "logo_data" text;
ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "favicon_data" text;
