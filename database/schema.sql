-- ProdRank Database Schema v1
-- Supabase PostgreSQL + pgvector
-- Run: psql < schema.sql or paste into Supabase SQL Editor

-- Enable pgvector for embeddings (semantic search of questions/citations)
create extension if not exists vector;

-- ═══ Users & Organizations ═══

create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    name text,
    avatar_url text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_id uuid references users(id) on delete cascade,
    created_at timestamptz default now()
);

-- ═══ Sites ═══

create table sites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    domain text not null,
    platform text, -- 'shopify', 'woocommerce', 'wordpress', 'bigcommerce', 'magento', 'custom'
    platform_confidence int default 0,
    auth_method text, -- 'oauth', 'rest_api', 'plugin'
    access_token text, -- encrypted
    shopify_shop text,
    last_synced_at timestamptz,
    ai_visibility_score int,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- ═══ Products ═══

create table products (
    id uuid primary key default gen_random_uuid(),
    site_id uuid references sites(id) on delete cascade,
    title text not null,
    description text,
    price text,
    currency text default 'USD',
    sku text,
    gtin text,
    brand text,
    images jsonb default '[]',
    url text,
    in_stock boolean default true,
    schema_fields int default 0,
    content_quality_score int default 0,
    ai_visibility_score int default 0,
    last_audited_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index idx_products_site on products(site_id);
create index idx_products_score on products(ai_visibility_score desc);

-- ═══ Entities ═══

create table entities (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    entity_type text not null, -- 'category', 'brand', 'feature', 'audience'
    entity_name text not null,
    ai_recognized boolean default false,
    confidence int default 0,
    metadata jsonb default '{}',
    created_at timestamptz default now()
);

-- ═══ Knowledge Dimensions (5W1H) ═══

create table knowledge_dimensions (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    dimension text not null, -- 'who', 'what', 'why', 'when', 'where', 'how'
    label text,
    covered boolean default false,
    score int default 0,
    checked_at timestamptz default now()
);

-- ═══ AI Responses / Recommendations ═══

create table ai_responses (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    ai_agent text not null, -- 'chatgpt', 'gemini', 'claude', 'grok', 'perplexity'
    keyword text not null,
    rank_position int,
    total_mentioned int default 0,
    description text,
    sentiment text, -- 'positive', 'neutral', 'negative'
    raw_response text,
    checked_at timestamptz default now()
);

create index idx_ai_responses_product on ai_responses(product_id);
create index idx_ai_responses_agent on ai_responses(ai_agent);

-- ═══ Citations ═══

create table citations (
    id uuid primary key default gen_random_uuid(),
    ai_response_id uuid references ai_responses(id) on delete cascade,
    source_url text not null,
    source_domain text,
    source_type text, -- 'review', 'forum', 'media', 'official', 'social'
    influence_weight float default 0.0,
    cited_at timestamptz default now()
);

create index idx_citations_domain on citations(source_domain);

-- ═══ Optimizations ═══

create table optimizations (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    rule_applied text not null,
    fix_type text, -- 'schema', 'content', 'meta', 'faq'
    before_state jsonb,
    applied_at timestamptz default now()
);

-- ═══ Verification ═══

create table verifications (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    snapshot_before jsonb,  -- AI state before optimization
    snapshot_after jsonb,   -- AI state after optimization
    delta_score int,        -- improvement delta
    verified_at timestamptz default now()
);

-- ═══ Question Library ═══

create table questions (
    id uuid primary key default gen_random_uuid(),
    category text not null,
    question_text text not null,
    search_volume int default 0,
    ai_coverage_pct int default 0,
    added_at timestamptz default now()
);

create index idx_questions_category on questions(category);

-- ═══ Subscription & Billing (Paddle) ═══

create table subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references users(id) on delete cascade,
    plan text default 'free', -- 'free', 'pro', 'growth', 'agency'
    paddle_subscription_id text,
    paddle_customer_id text,
    status text default 'active',
    current_period_end timestamptz,
    canceled_at timestamptz,
    created_at timestamptz default now()
);
