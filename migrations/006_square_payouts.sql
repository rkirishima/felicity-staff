-- Square Payouts（入金）の取り込みテーブル。
-- /v2/payouts API から週次の銀行振込（入金）と差引手数料を保存する。
--
-- 用途：税理士提出要件「①Squareから入金される入金額、入金額の対象期間、差し引かれる手数料」

create table if not exists public.keiri_square_payouts (
  id uuid primary key default gen_random_uuid(),
  payout_id text not null unique,
  status text,
  initiated_at timestamptz,
  completed_at timestamptz,
  amount integer not null,           -- 実際に入金された金額（net）
  fee_amount integer not null default 0,
  gross_amount integer not null,     -- 売上総額（gross = net + fee）
  period_start date,
  period_end date,
  bank_account_last4 text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists keiri_square_payouts_completed_idx on public.keiri_square_payouts(completed_at);
create index if not exists keiri_square_payouts_period_idx on public.keiri_square_payouts(period_start, period_end);
