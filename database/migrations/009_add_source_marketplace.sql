-- Migration 009: Citation Source Marketplace Module
-- Creates tables for source discovery, outreach pipeline, AI pitches, and follow-ups
-- Date: 2026-07-29

-- 1. Discovered sources from Citation Intelligence data
CREATE TABLE IF NOT EXISTS marketplace_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL DEFAULT '',
    url TEXT DEFAULT '',
    source_type TEXT DEFAULT 'review',
    name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    category TEXT DEFAULT '',
    authority_score INT DEFAULT 0,
    citation_frequency JSONB DEFAULT '{}',
    total_citations INT DEFAULT 0,
    cites_competitors JSONB DEFAULT '[]',
    trend TEXT DEFAULT 'stable',
    estimated_cost TEXT DEFAULT '',
    relevance_score INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_sources_user ON marketplace_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_sources_domain ON marketplace_sources(domain);
CREATE INDEX IF NOT EXISTS idx_marketplace_sources_type ON marketplace_sources(source_type);
COMMENT ON TABLE marketplace_sources IS 'Sources discovered from Citation Intelligence that cite competitors';

-- 2. Outreach pipeline per source
CREATE TABLE IF NOT EXISTS marketplace_outreach (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES marketplace_sources(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'discovered',
    contacted_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    success_at TIMESTAMPTZ,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_outreach_source ON marketplace_outreach(source_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_outreach_user ON marketplace_outreach(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_outreach_status ON marketplace_outreach(status);
COMMENT ON TABLE marketplace_outreach IS 'Outreach pipeline tracking for each source';

-- 3. AI-generated outreach pitches
CREATE TABLE IF NOT EXISTS marketplace_pitches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES marketplace_sources(id) ON DELETE CASCADE,
    outreach_id UUID REFERENCES marketplace_outreach(id) ON DELETE CASCADE,
    style TEXT NOT NULL DEFAULT 'professional',
    pitch_text TEXT NOT NULL DEFAULT '',
    subject_line TEXT DEFAULT '',
    ai_model TEXT DEFAULT '',
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_pitches_source ON marketplace_pitches(source_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_pitches_outreach ON marketplace_pitches(outreach_id);
COMMENT ON TABLE marketplace_pitches IS 'AI-generated outreach pitches for each source';

-- 4. Follow-up reminders (7+ days after contact)
CREATE TABLE IF NOT EXISTS marketplace_follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    outreach_id UUID NOT NULL REFERENCES marketplace_outreach(id) ON DELETE CASCADE,
    due_at TIMESTAMPTZ NOT NULL,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_followups_outreach ON marketplace_follow_ups(outreach_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_followups_due ON marketplace_follow_ups(due_at) WHERE NOT completed;
COMMENT ON TABLE marketplace_follow_ups IS 'Automated follow-up reminders 7 days after contacting a source';
