-- Migration 010: Product Knowledge Base
-- Users upload product materials (CSV, PDF, images, videos) and AI extracts structured knowledge
-- Date: 2026-07-29

CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL DEFAULT '',
    entity_value TEXT NOT NULL DEFAULT '',
    entity_key TEXT DEFAULT '',
    source_type TEXT DEFAULT 'manual',
    source_url TEXT DEFAULT '',
    source_filename TEXT DEFAULT '',
    confidence REAL DEFAULT 0.0,
    ai_model TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_user ON knowledge_base(user_id);
CREATE INDEX IF NOT EXISTS idx_kb_site ON knowledge_base(site_id);
CREATE INDEX IF NOT EXISTS idx_kb_product ON knowledge_base(product_id);
CREATE INDEX IF NOT EXISTS idx_kb_type ON knowledge_base(entity_type);

COMMENT ON TABLE knowledge_base IS 'AI-extracted structured knowledge from user-uploaded product materials';
COMMENT ON COLUMN knowledge_base.entity_type IS 'e.g. material, audience, size, care, warranty, use_case, comparison, certification';
COMMENT ON COLUMN knowledge_base.source_type IS 'csv, pdf, image, youtube, manual';
COMMENT ON COLUMN knowledge_base.confidence IS 'AI confidence score 0.0-1.0';
