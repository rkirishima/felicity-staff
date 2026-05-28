-- Square 商品名 → 売上区分 の手動オーバーライドテーブル。
-- classifyRevenue() のキーワードベース判定で誤分類 or 未分類になる商品を、
-- スタッフ側で明示的に固定するために使う。
--
-- 例：
--   ('クッキー (chunky)', 'takeout_8')
--   ('(明細なし)', 'takeout_8', 'CUSTOM AMOUNT決済 — 基本クッキー販売')

create table if not exists public.keiri_square_item_overrides (
  item_name text primary key,
  revenue_category text not null check (
    revenue_category in ('dine_in_10','goods_10','beans_8','takeout_8','unknown')
  ),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ユーザー指示：「未分類は基本全部クッキー」→ (明細なし) は 8% テイクアウトに既定
insert into public.keiri_square_item_overrides (item_name, revenue_category, note)
values
  ('(明細なし)', 'takeout_8', 'CUSTOM AMOUNT決済は基本クッキー販売 — テイクアウト食品 8%')
on conflict (item_name) do nothing;
