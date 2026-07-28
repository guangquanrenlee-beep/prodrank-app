-- Migration: Add optimized_schema for auto-fix
ALTER TABLE sites ADD COLUMN IF NOT EXISTS optimized_schema JSONB DEFAULT NULL;
