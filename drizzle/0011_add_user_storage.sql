-- Migration: Add user storage columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "storage_provider" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "storage_api_key_encrypted" text;
