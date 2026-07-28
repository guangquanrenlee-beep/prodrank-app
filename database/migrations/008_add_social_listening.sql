-- Migration 008: Social Listening Module
-- Creates tables for Reddit keyword monitoring, post discovery, user responses, and tracking
-- Date: 2026-07-29

-- 1. Keyword sets per user (up to 3 keyword types: industry, brand, product)
CREATE TABLE IF NOT EXISTS social_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    brand_name TEXT NOT NULL DEFAULT '',
    industry_keywords TEXT[] DEFAULT '{}',
    brand_keywords TEXT[] DEFAULT '{}',
    product_keywords TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_keywords_user ON social_keywords(user_id);
COMMENT ON TABLE social_keywords IS 'User-defined keyword sets for social listening (industry, brand, product)';

-- 2. Discovered posts from Reddit
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    keyword_set_id UUID REFERENCES social_keywords(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'reddit',
    source_post_id TEXT DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    body TEXT DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    author TEXT DEFAULT '',
    subreddit TEXT DEFAULT '',
    is_question BOOLEAN DEFAULT false,
    is_ad BOOLEAN DEFAULT false,
    upvotes INT DEFAULT 0,
    comment_count INT DEFAULT 0,
    posted_at TIMESTAMPTZ,
    matched_keywords TEXT[] DEFAULT '{}',
    matched_type TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_user ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_source ON social_posts(source);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(user_id, is_ad);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_posts_unique ON social_posts(user_id, source_post_id) WHERE source_post_id != '';
COMMENT ON TABLE social_posts IS 'Discovered social media posts matching user keywords';

-- 3. User actions on posts (answered, AI draft, forwarded, ignored)
CREATE TABLE IF NOT EXISTS social_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    action TEXT NOT NULL DEFAULT 'pending',
    response_text TEXT DEFAULT '',
    ai_draft TEXT DEFAULT '',
    ai_model_used TEXT DEFAULT '',
    forwarded_to TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_responses_post ON social_responses(post_id);
CREATE INDEX IF NOT EXISTS idx_social_responses_user ON social_responses(user_id);
COMMENT ON TABLE social_responses IS 'User actions and AI drafts for discovered posts';

-- 4. Response tracking (upvotes, best answer, follow-up mentions)
CREATE TABLE IF NOT EXISTS social_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    response_id UUID NOT NULL REFERENCES social_responses(id) ON DELETE CASCADE,
    upvotes INT DEFAULT 0,
    is_best_answer BOOLEAN DEFAULT false,
    reply_count INT DEFAULT 0,
    follow_up_mentions INT DEFAULT 0,
    last_checked_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_tracking_response ON social_tracking(response_id);
COMMENT ON TABLE social_tracking IS 'Tracks performance of user responses on social platforms';
