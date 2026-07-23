-- ProdRank Business Tables
-- users table: managed by Supabase Auth at auth.users — do not recreate
-- organizations: team management for multi-user accounts
create extension if not exists vector;

create table if not exists organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_id uuid references auth.users(id) on delete cascade,
    created_at timestamptz default now()
);

create table if not exists sites (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    domain text not null,
    platform text,
    platform_confidence int default 0,
    auth_method text,
    access_token text,
    shopify_shop text,
    last_synced_at timestamptz,
    ai_visibility_score int,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists products (
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

create table if not exists entities (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    entity_type text not null,
    entity_name text not null,
    ai_recognized boolean default false,
    confidence int default 0,
    metadata jsonb default '{}',
    created_at timestamptz default now()
);

create table if not exists knowledge_dimensions (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    dimension text not null,
    label text,
    covered boolean default false,
    score int default 0,
    checked_at timestamptz default now()
);

create table if not exists ai_responses (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    ai_agent text not null,
    keyword text not null,
    rank_position int,
    total_mentioned int default 0,
    description text,
    sentiment text,
    raw_response text,
    checked_at timestamptz default now()
);

create table if not exists citations (
    id uuid primary key default gen_random_uuid(),
    ai_response_id uuid references ai_responses(id) on delete cascade,
    source_url text not null,
    source_domain text,
    source_type text,
    influence_weight float default 0.0,
    cited_at timestamptz default now()
);

create table if not exists optimizations (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    rule_applied text not null,
    fix_type text,
    before_state jsonb,
    applied_at timestamptz default now()
);

create table if not exists verifications (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references products(id) on delete cascade,
    snapshot_before jsonb,
    snapshot_after jsonb,
    delta_score int,
    verified_at timestamptz default now()
);

create table if not exists questions (
    id uuid primary key default gen_random_uuid(),
    category text not null,
    question_text text not null,
    search_volume int default 0,
    ai_coverage_pct int default 0,
    added_at timestamptz default now()
);

create table if not exists subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    plan text default 'free',
    paddle_subscription_id text,
    paddle_customer_id text,
    status text default 'active',
    current_period_end timestamptz,
    canceled_at timestamptz,
    created_at timestamptz default now()
);
