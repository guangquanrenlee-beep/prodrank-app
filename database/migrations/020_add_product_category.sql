-- Migration 020: products.category + knowledge_fields — per-category
-- product inspection (what THIS kind of product should have).
-- Run in Supabase SQL Editor.
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS knowledge_fields JSONB DEFAULT '[]';
