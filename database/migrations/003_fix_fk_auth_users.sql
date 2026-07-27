-- Migration: Fix foreign keys to reference auth.users instead of public.users
-- Date: 2026-07-28
-- Problem: sites.user_id references public.users (empty table), but Supabase Auth
-- creates users in auth.users. This means all site INSERTs were silently failing
-- because the user_id didn't exist in public.users.
-- Fix: Drop FK to public.users and re-point to auth.users.

-- 1. Fix sites.user_id → auth.users
ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_user_id_fkey;
ALTER TABLE sites ADD CONSTRAINT sites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. If sites has owner_id referencing public.users, fix that too
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sites' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_owner_id_fkey;
        ALTER TABLE sites ADD CONSTRAINT sites_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Fix subscriptions.user_id → auth.users
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'subscriptions'
    ) THEN
        ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Fix products if they reference users
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'owner_id'
    ) THEN
        ALTER TABLE products DROP CONSTRAINT IF EXISTS products_owner_id_fkey;
        ALTER TABLE products ADD CONSTRAINT products_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;
