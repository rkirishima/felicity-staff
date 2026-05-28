-- Square 売上明細に revenue_category 列を追加して、税理士提出用の4区分に分類できるようにする。
--
-- 4区分:
--   dine_in_10  : 10% 課税・イートイン（店内飲食）
--   goods_10    : 10% 課税・物販（Tシャツ・マグ等）
--   beans_8     : 8% 軽減・豆等の物販
--   takeout_8   : 8% 軽減・テイクアウト食品
--   unknown     : 分類不能（要オーバーライド）
--
-- 既存行も SQL ベースの heuristic で一括分類する。

alter table public.keiri_square_line_items
  add column if not exists revenue_category text;

create index if not exists keiri_square_line_items_revenue_cat_idx
  on public.keiri_square_line_items(revenue_category);

update public.keiri_square_line_items
set revenue_category = case
  when tax_rate = 8 and (
    coalesce(item_name, '') ~* '豆|beans?|drip|ドリップ|ドリップパック|200\s?g|100\s?g|150\s?g|250\s?g'
    or coalesce(category, '') ~* '豆|beans?|drip|ドリップ'
  ) then 'beans_8'
  when tax_rate = 8 then 'takeout_8'
  when tax_rate = 10 and (
    coalesce(item_name, '') ~* 't[\s-]?shirt|シャツ|スウェット|sweat|hoodie|パーカー|mug|マグ|タンブラー|tumbler|cap|キャップ|帽子|グッズ|goods|merch|ステッカー|sticker|エコバッグ|tote|tee|apron|エプロン'
    or coalesce(category, '') ~* 'goods|グッズ|merch|アパレル'
  ) then 'goods_10'
  when tax_rate = 10 then 'dine_in_10'
  else 'unknown'
end
where revenue_category is null;
