-- Migration: Add inject tracking columns to sites table
-- Date: 2026-07-28

ALTER TABLE sites ADD COLUMN IF NOT EXISTS inject_active BOOLEAN DEFAULT false;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN sites.inject_active IS 'Whether the inject.js/inject-saas.js script is installed and pinging';
COMMENT ON COLUMN sites.last_ping_at IS 'Last time the inject script sent a ping';
