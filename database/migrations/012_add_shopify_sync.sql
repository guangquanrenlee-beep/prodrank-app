-- Migration 012: Shopify Store Connection + Product Sync + AI Content Storage
-- Run in Supabase SQL Editor.

-- ② Product Sync — extended product fields from Shopify Admin API
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS collections JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor TEXT;

-- ③ AI Content Storage + ⑦ Rollback — every AI generation is versioned here.
-- Metafields hold only the CURRENT published value; history lives in this table,
-- so merchants can roll back to any previous version and provenance is traceable.
CREATE TABLE IF NOT EXISTS content_drafts (
    id uuid primary key default gen_random_uuid(),
    shop text not null,
    shopify_product_id text not null,
    field text not null,             -- description | faq | pros | cons | comparison | use_cases | buying_guide | specification | schema | ai_summary
    content jsonb not null,          -- the AI-generated content payload
    status text default 'draft',     -- draft | published | scheduled | superseded
    version int default 1,
    provenance jsonb default '{}',   -- model, prompt_version, generated_at, human_edited, edited_at
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_content_drafts_product ON content_drafts(shop, shopify_product_id, field);
