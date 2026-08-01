-- Migration 014: Monthly AI generation usage tracking (per store)
-- Anti-abuse: account-level monthly quota, enforced on every generate call.
CREATE TABLE IF NOT EXISTS usage_tracking (
    shop text not null,
    month text not null,              -- 'YYYY-MM'
    ai_generations int default 0,
    updated_at timestamptz default now(),
    PRIMARY KEY (shop, month)
);
