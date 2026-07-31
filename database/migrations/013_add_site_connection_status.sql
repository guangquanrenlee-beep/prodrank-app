-- Migration 013: Site connection lifecycle (⑧ Webhook Listener + ⑩ Health Check)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'active';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_theme_change_at TIMESTAMPTZ DEFAULT NULL;
