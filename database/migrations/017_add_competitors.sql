-- Migration 017: Competitor Watch
-- Run in Supabase SQL Editor.

-- 1) Competitors the merchant wants to watch (nike.com, uniqlo.com, ...).
CREATE TABLE IF NOT EXISTS competitors (
    id uuid primary key default gen_random_uuid(),
    shop text not null,            -- the merchant's store domain (owner)
    name text default '',
    domain text not null,          -- competitor domain (e.g. nike.com)
    status text default 'active',
    created_at timestamptz default now(),
    UNIQUE(shop, domain)
);

-- 2) Daily competitor snapshots — per-page metrics (price, desc length,
--    faq count, schema types) used for diffs ("Nike added 4 FAQs").
CREATE TABLE IF NOT EXISTS competitor_snapshots (
    id uuid primary key default gen_random_uuid(),
    competitor_id uuid references competitors(id) on delete cascade,
    snapshot_date date not null,
    product_count int default 0,
    details jsonb default '{}',   -- {page_url: {title, price, desc_len, faq_count, schema_types}}
    created_at timestamptz default now(),
    UNIQUE(competitor_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_competitors_shop ON competitors(shop);
CREATE INDEX IF NOT EXISTS idx_comp_snapshots ON competitor_snapshots(competitor_id, snapshot_date DESC);
