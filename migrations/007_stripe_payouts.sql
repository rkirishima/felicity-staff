-- Stripe Payouts（EC入金）の取り込みテーブル。
-- /v1/payouts + /v1/balance_transactions から週次の銀行振込（入金）と
-- 差引手数料を保存する。
--
-- 用途：税理士提出要件「③ECサイト... stripeから入金される入金額、入金額の対象期間、差し引かれる手数料」

create table if not exists public.keiri_stripe_payouts (
  id uuid primary key default gen_random_uuid(),
  payout_id text not null unique,
  status text,
  arrival_date date,
  initiated_at timestamptz,
  amount integer not null,           -- 実際に入金された金額（net、Stripe側でarrival_dateに振込）
  fee_amount integer not null default 0,
  gross_amount integer not null,     -- charge total before fees
  charge_count integer not null default 0,
  refund_count integer not null default 0,
  period_start date,
  period_end date,
  destination_bank_last4 text,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists keiri_stripe_payouts_arrival_idx on public.keiri_stripe_payouts(arrival_date);
create index if not exists keiri_stripe_payouts_period_idx on public.keiri_stripe_payouts(period_start, period_end);
