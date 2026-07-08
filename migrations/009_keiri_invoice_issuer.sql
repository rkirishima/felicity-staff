-- 請求書の発行元(会社名義)を選択できるようにする
-- felicity: 株式会社FELICITY(従来どおり・デフォルト)
-- rook:     株式会社ROOK(桐島個人の会社名義。採番は RK- 系列)
-- 適用済み: 2026-07-08 (supabase mcp: add_issuer_to_keiri_invoices)
alter table keiri_invoices
  add column if not exists issuer text not null default 'felicity'
  check (issuer in ('felicity', 'rook'));
