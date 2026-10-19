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

-- クラウド側の外形監視（/api/cron/probat-sync-monitor）が直近に通知した内容。
-- 同じ異常で何度も鳴らさないためのもの。sync-probat.js は触らない。
alter table public.probat_sync_status add column if not exists monitor_alert_key text;
