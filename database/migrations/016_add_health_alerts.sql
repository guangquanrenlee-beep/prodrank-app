-- Migration 016: Daily Health Check snapshots + Alerts
-- Run in Supabase SQL Editor.

-- 1) Daily health snapshots — one row per shop per day. `details` holds
--    per-product metrics (desc length, price, availability, faq count,
--    schema fields, jsonld types) used for regression diffs.
CREATE TABLE IF NOT EXISTS health_snapshots (
    id uuid primary key default gen_random_uuid(),
    shop text not null,
    snapshot_date date not null,
    score int default 0,
    product_count int default 0,
    details jsonb default '{}',
    created_at timestamptz default now(),
    UNIQUE(shop, snapshot_date)
);

-- 2) Alerts — event-driven warnings (description shortened, schema lost,
--    theme update, price change, review change ...).
CREATE TABLE IF NOT EXISTS alerts (
    id uuid primary key default gen_random_uuid(),
    shop text not null,
    product_id text default '',
    type text not null,           -- description_shortened | schema_lost | faq_lost | theme_change | price_change | review_change
    severity text default 'info', -- info | warning | critical
    message text not null,
    details jsonb default '{}',
    created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_shop ON alerts(shop, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_shop ON health_snapshots(shop, snapshot_date DESC);
