-- Migration 022: Match Engine — pgvector embeddings for shopping queries
-- Run this in Supabase SQL Editor

-- 1. Enable vector extension (needed for similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to ai_shopping_queries
ALTER TABLE ai_shopping_queries ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);

-- 3. HNSW index for fast similarity search (small dataset, still worth it)
CREATE INDEX IF NOT EXISTS idx_aq_embedding
ON ai_shopping_queries USING hnsw (embedding vector_cosine_ops);
