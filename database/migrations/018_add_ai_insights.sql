-- Migration 018: AI Insights — daily one-call summary for the dashboard.
-- Run in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS ai_insights (
    id uuid primary key default gen_random_uuid(),
    shop text not null,
    insight_date date not null,
    content text not null,
    created_at timestamptz default now(),
    UNIQUE(shop, insight_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_shop ON ai_insights(shop, insight_date DESC);
