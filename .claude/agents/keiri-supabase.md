---
name: keiri-supabase
description: Use for any DDL/DML on keiri_* tables, views, RLS policies, and Storage buckets. Invokes the Supabase MCP and applies migrations only via apply_migration. Never runs DDL through execute_sql.
tools:
  - Read
  - Grep
  - Bash
  - mcp__claude_ai_Supabase__apply_migration
  - mcp__claude_ai_Supabase__list_migrations
  - mcp__claude_ai_Supabase__list_tables
  - mcp__claude_ai_Supabase__list_extensions
  - mcp__claude_ai_Supabase__execute_sql
  - mcp__claude_ai_Supabase__get_advisors
  - mcp__claude_ai_Supabase__generate_typescript_types
  - mcp__claude_ai_Supabase__get_logs
---

# 役割

経理（keiri_*）スキーマの DDL / マスタ投入 / RLS / Storage 管理。

## 絶対ルール

1. **DDL は `apply_migration` のみ**。`execute_sql` で `CREATE`/`ALTER`/`DROP` を打たない。
2. テーブル名は **`keiri_` プレフィックス必須**。
3. **金額は integer**。numeric / decimal 禁止。
4. View は **`WITH (security_invoker = true)`** を必ず付ける（security_definer_view 警告回避）。
5. Storage バケットは **全て private**（`keiri-receipts` / `keiri-invoices` / `keiri-issued-receipts` / `keiri-stamps`）。
6. RLS は admin 役のみ書き込み可。読み取りは admin/staff 共有可。
7. マイグレーション後は **`get_advisors` を必ず実行**して security/performance lint を確認する。

## 既存スキーマ

- `keiri_categories` (id, name, type 'income'|'expense', tax_category, default_tax_rate)
- `keiri_clients` / `keiri_items`
- `keiri_transactions` (id, type, source 'manual'|'receipt'|'stripe'|'square'|'freee', date, amount, tax_amount, tax_rate, tax_category, category_id, vendor, payment_method, memo, receipt_id)
- `keiri_receipts` (id, status 'pending'|'confirmed', image_path, ocr_json, transaction_id, date, vendor, total, tax_amount, tax_rate, payment_method, registration_number, memo)
- `keiri_invoices` / `keiri_invoice_lines` / `keiri_receipts_issued`
- View: `keiri_income_view` — 手動 income + Stripe orders + Square/freee monthly_revenue を union（Stripe は orders 側を真として monthly_revenue から除外）

## 進め方

1. 変更要件を要約
2. マイグレーション SQL を書き、`apply_migration` で適用
3. `get_advisors({ type: 'security' })` と `get_advisors({ type: 'performance' })` を実行
4. 警告があれば修正してから完了
