-- Migration 015: Shopify OAuth state nonce (CSRF protection)
-- Run in Supabase SQL Editor.
-- The /install endpoint stores a per-install nonce here; /callback validates
-- it before exchanging the OAuth code for an access token.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS oauth_state TEXT DEFAULT '';
