-- Migration: Add score_snapshots for trend history
-- Date: 2026-07-28

CREATE TABLE IF NOT EXISTS score_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    ai_visibility_score INT NOT NULL,
    breakdown JSONB DEFAULT '{}',
    label TEXT,
    recommendation TEXT,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_site_date ON score_snapshots(site_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON score_snapshots(user_id);
