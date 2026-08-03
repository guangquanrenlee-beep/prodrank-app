-- Migration 019: products.schema_present — which of the 12 standard
-- Product-schema fields actually exist on the page (real missing detection).
-- Run in Supabase SQL Editor.
ALTER TABLE products ADD COLUMN IF NOT EXISTS schema_present JSONB DEFAULT '[]';
