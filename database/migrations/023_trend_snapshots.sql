-- Migration 023: AI Shopping Trend — daily attribute-frequency snapshots
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS trend_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date TEXT NOT NULL UNIQUE,   -- YYYY-MM-DD
    attributes    JSONB DEFAULT '{}',     -- {attribute: count}
    created_at    TIMESTAMPTZ DEFAULT now()
);
