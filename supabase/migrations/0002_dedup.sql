-- ScanBook 0002: image-hash dedup
-- Run in Supabase SQL Editor after 0001_init.sql.

alter table public.receipts
  add column if not exists image_hash text;

-- Lookup index for the dedup check in /api/receipts POST.
create index if not exists receipts_user_image_hash_idx
  on public.receipts (user_id, image_hash);

-- Defense-in-depth: unique constraint on (user_id, image_hash) for non-error
-- rows. Error rows are excluded so a failed upload doesn't block retry of
-- the same image after fixing whatever went wrong.
create unique index if not exists receipts_user_image_hash_unique
  on public.receipts (user_id, image_hash)
  where image_hash is not null and status != 'error';
