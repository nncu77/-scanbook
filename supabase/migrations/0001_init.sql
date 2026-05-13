-- ScanBook initial schema
-- Run this in the Supabase SQL editor against your project, or via `supabase db push` if using the CLI.
-- Assumes Supabase Auth is enabled (auth.users table exists).

create extension if not exists "pgcrypto";

----------------------------------------------------------------
-- receipts
----------------------------------------------------------------
create table if not exists public.receipts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  image_url       text not null,
  status          text not null default 'pending'
                  check (status in ('pending','processing','done','error','reviewed')),
  raw_extraction  jsonb,
  corrected_data  jsonb,
  model_used      text,
  processing_ms   integer,
  token_cost_usd  numeric(10,6),
  error_message   text,
  created_at      timestamptz not null default now(),
  reviewed_at     timestamptz
);

create index if not exists receipts_user_id_created_idx
  on public.receipts (user_id, created_at desc);

create index if not exists receipts_status_idx
  on public.receipts (status);

----------------------------------------------------------------
-- eval_runs
----------------------------------------------------------------
create table if not exists public.eval_runs (
  id                  uuid primary key default gen_random_uuid(),
  run_date            timestamptz not null default now(),
  test_set_version    text not null,
  accuracy_metrics    jsonb not null,
  avg_processing_ms   integer,
  total_cost_usd      numeric(10,6),
  notes               text
);

----------------------------------------------------------------
-- Row Level Security
----------------------------------------------------------------
alter table public.receipts  enable row level security;
alter table public.eval_runs enable row level security;

-- Demo user UUID. Keep this in sync with NEXT_PUBLIC_DEMO_USER_ID in .env.local.
-- Pre-seeded demo receipts use this user_id and are publicly readable.
-- (You must also insert a corresponding row in auth.users for this UUID,
--  or seed demo receipts via the service role key bypassing RLS.)
create or replace function public.demo_user_id() returns uuid
language sql immutable as $$ select '00000000-0000-0000-0000-0000000d3000'::uuid $$;

-- receipts: owner can read/write their own rows; demo rows are world-readable
drop policy if exists "receipts_select_own"  on public.receipts;
drop policy if exists "receipts_select_demo" on public.receipts;
drop policy if exists "receipts_insert_own"  on public.receipts;
drop policy if exists "receipts_update_own"  on public.receipts;
drop policy if exists "receipts_delete_own"  on public.receipts;

create policy "receipts_select_own" on public.receipts
  for select using (auth.uid() = user_id);

create policy "receipts_select_demo" on public.receipts
  for select using (user_id = public.demo_user_id());

create policy "receipts_insert_own" on public.receipts
  for insert with check (auth.uid() = user_id);

create policy "receipts_update_own" on public.receipts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "receipts_delete_own" on public.receipts
  for delete using (auth.uid() = user_id);

-- eval_runs: world-readable (this powers the public /eval page), writes via service role only
drop policy if exists "eval_runs_select_public" on public.eval_runs;
create policy "eval_runs_select_public" on public.eval_runs
  for select using (true);

----------------------------------------------------------------
-- Storage bucket setup (run in Supabase Dashboard → Storage,
-- or via the snippets below in the SQL editor)
----------------------------------------------------------------
-- 1. Create a private bucket named "receipts":
--    insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);
--
-- 2. Bucket policies (owner-scoped uploads, owner + demo-prefix reads):
--    create policy "receipts_storage_owner_read" on storage.objects
--      for select using (
--        bucket_id = 'receipts'
--        and (auth.uid()::text = (storage.foldername(name))[1]
--             or (storage.foldername(name))[1] = 'demo')
--      );
--    create policy "receipts_storage_owner_write" on storage.objects
--      for insert with check (
--        bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
--      );
--    create policy "receipts_storage_owner_delete" on storage.objects
--      for delete using (
--        bucket_id = 'receipts' and auth.uid()::text = (storage.foldername(name))[1]
--      );
--
-- Object naming convention: <user_id>/<receipt_id>.<ext>   (or "demo/<id>.<ext>")
