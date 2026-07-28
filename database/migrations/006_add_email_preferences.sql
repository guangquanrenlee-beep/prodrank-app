-- Migration: Email preferences for weekly reports
-- Date: 2026-07-28

CREATE TABLE IF NOT EXISTS email_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    weekly_report_enabled BOOLEAN DEFAULT true,
    competitor_alerts_enabled BOOLEAN DEFAULT true,
    score_drop_alerts_enabled BOOLEAN DEFAULT true,
    last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_prefs_user ON email_preferences(user_id);
