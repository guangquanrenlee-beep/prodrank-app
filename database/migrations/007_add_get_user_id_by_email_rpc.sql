-- Migration 007: Create RPC for looking up user ID by email
-- Used by email_api.py to identify users from X-User-Email header
-- Date: 2026-07-29

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email text)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.users.id FROM auth.users WHERE auth.users.email = email LIMIT 1;
$$;
