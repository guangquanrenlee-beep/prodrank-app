-- 024: sites (user_id, domain) unique constraint — database-level dedup.
-- Run in Supabase SQL Editor. App-level dedup is live in the backend
-- (normalize_domain + idempotent writes), this makes duplicates impossible
-- even for older clients still using naive upserts.

-- Pre-check: the table must be clean first (no duplicate (user_id, domain)).
-- The app has already cleaned existing duplicates (2026-08-07).
select count(*) as dup_rows from (
    select user_id, domain, count(*) c from sites
    where user_id is not null
    group by user_id, domain having count(*) > 1
) t;

alter table sites add constraint sites_user_domain_key unique (user_id, domain);
