-- Add private_key_encrypted column to nodes table for cryptographic signing
ALTER TABLE "nodes" ADD COLUMN "private_key_encrypted" text;
