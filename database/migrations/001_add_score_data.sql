-- Migration: Add score_data JSONB column to sites table
-- Date: 2026-07-27
-- Run in Supabase SQL Editor: https://app.supabase.com

-- Stores the full AI score response including breakdown, recommendation, and analysis timestamp
ALTER TABLE sites ADD COLUMN IF NOT EXISTS score_data JSONB DEFAULT NULL;

-- Index for querying sites by last analyzed date
CREATE INDEX IF NOT EXISTS idx_sites_score_data ON sites USING GIN (score_data);

COMMENT ON COLUMN sites.score_data IS 'Full AI score response: ai_visibility_score, label, breakdown (6 dimensions), recommendation, analyzed_at';
