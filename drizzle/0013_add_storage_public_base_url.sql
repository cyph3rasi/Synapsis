-- Migration: Add storage_public_base_url column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "storage_public_base_url" text;
