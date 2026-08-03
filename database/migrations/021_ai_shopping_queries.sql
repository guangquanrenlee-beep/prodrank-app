-- Migration 021: AI Shopping Query Engine tables
-- Run this in Supabase SQL Editor

-- ① Query table — structured AI shopping questions
CREATE TABLE IF NOT EXISTS ai_shopping_queries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category    TEXT NOT NULL,
    query       TEXT NOT NULL,
    intent      TEXT,
    price_range TEXT,
    occasion    TEXT,
    audience    TEXT,
    attributes  JSONB DEFAULT '[]',
    season      TEXT,
    language    TEXT DEFAULT 'en',
    country     TEXT DEFAULT 'us',
    difficulty  TEXT DEFAULT 'medium',
    frequency   INTEGER DEFAULT 0,
    source      TEXT DEFAULT 'manual',
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aq_category ON ai_shopping_queries (category);
CREATE INDEX IF NOT EXISTS idx_aq_intent    ON ai_shopping_queries (intent);
CREATE UNIQUE INDEX IF NOT EXISTS idx_aq_unique ON ai_shopping_queries (category, query);

-- ② Results table — AI model responses per test run
CREATE TABLE IF NOT EXISTS ai_query_results (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id    UUID REFERENCES ai_shopping_queries(id) ON DELETE CASCADE,
    site_id     UUID REFERENCES sites(id) ON DELETE CASCADE,
    product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
    model       TEXT NOT NULL,
    answer      TEXT,
    recommended BOOLEAN DEFAULT false,
    rank        INTEGER,
    reason      TEXT,
    citation    TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aqr_query   ON ai_query_results (query_id);
CREATE INDEX IF NOT EXISTS idx_aqr_site    ON ai_query_results (site_id);
CREATE INDEX IF NOT EXISTS idx_aqr_model   ON ai_query_results (model);
