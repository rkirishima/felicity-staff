-- Probat 取り込み（Mac mini の sync-probat.js）の稼働状況。1行だけ（id = 'p05'）。
-- 書くのは service role の sync-probat.js、読むのは /api/roast/history（service role）。
create table if not exists public.probat_sync_status (
  id text primary key,
  checked_at timestamptz not null,
  status text not null check (status in ('ok', 'unreachable', 'failed')),
  message text,
  last_ok_at timestamptz,
  last_reachable_at timestamptz,
  roaster_entries integer,
  curves_added integer,
  unlinked integer,
  unresolved_names text[]
);

alter table public.probat_sync_status enable row level security;
-- ポリシーなし = anon / authenticated からは読めない（service role のみ）
