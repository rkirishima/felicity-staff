-- 月末在庫スナップショット。税理士提出要件「⑤月末在庫」対応。
--
-- 食材 / グッズ / 資材 のカテゴリ別に、商品名・仕入単価・残数を保存し、
-- 合計額（unit_price × quantity）を集計する。
--
-- 月末日（YYYY-MM-末日）でスナップショットを管理。同じ日に同じ商品名+カテゴリは
-- 1行のみ（unique 制約）。

create table if not exists public.keiri_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  item_name text not null,
  category text not null check (category in ('ingredients', 'goods', 'supplies')),
  unit_price integer not null default 0,
  quantity numeric not null default 0,
  unit text,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_date, item_name, category)
);

create index if not exists keiri_inventory_date_idx on public.keiri_inventory_snapshots(snapshot_date);
create index if not exists keiri_inventory_cat_idx on public.keiri_inventory_snapshots(category);
