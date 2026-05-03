<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 経理タブ（/admin/keiri）

### 絶対ルール
- 金額は全て **integer（円）**。`parseFloat` 禁止、`parseInt(x, 10)` のみ。
- 消費税率は **10 か 8 のいずれか**。それ以外を保存しない。
- 日付は **JST**: `new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)`。
- 領収書/請求書の **連番** は再利用しない（欠番が出ても埋めない）。
- インボイス **登録番号 (T+13桁)** は受領した形式そのまま保持。検証は別関数。
- **税区分別** (10%/軽減8%/対象外) で売上・経費を集計する。月次レポートはこの 3 区分が基本。
- 領収書 PDF の **印影** は固定 PNG を `keiri-stamps` バケットから取得。アップロードのたびに変えない。

### Supabase
- 経理関連テーブル/ビューは **`keiri_` プレフィックス**:
  - `keiri_categories` / `keiri_clients` / `keiri_items`
  - `keiri_transactions` / `keiri_receipts` / `keiri_invoices` / `keiri_invoice_lines` / `keiri_receipts_issued`
- `keiri_income_view` は売上の真。`monthly_revenue` から **square / freee のみ** 取り込み、Stripe は `orders` を真として扱う（二重計上回避）。
- Storage バケットは全て **private**: `keiri-receipts` / `keiri-invoices` / `keiri-issued-receipts` / `keiri-stamps`。
- DDL は **Supabase MCP の `apply_migration` のみ**で投入する。`execute_sql` で DDL を打たない。

### 既存テーブルとの関係
- `orders`: Stripe 決済を保存（**真の売上ソース**）。`monthly_revenue` 側の Stripe 行は無視。
- `monthly_revenue`: square / freee の月次総額のみを `keiri_income_view` に取り込む。

### コミット前チェック
1. `npx tsc --noEmit` でエラーゼロ
2. `npm run lint` で keiri 配下のエラーゼロ
3. Supabase advisor で security_definer_view 警告が出ていない（ビューは `WITH (security_invoker = true)`）
