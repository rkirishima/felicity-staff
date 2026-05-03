# 経理タブ Phase 1 — 仕様書

felicity-staff の `/admin/keiri` 経理タブ Phase 1 の元プロンプト写し。後続フェーズの参照用。

## 既に完了している作業（やり直さない）

### Supabase（プロジェクト epmxfyiscsjyptgzjczq）
- テーブル投入済み: keiri_categories / keiri_clients / keiri_items / keiri_transactions / keiri_receipts / keiri_invoices / keiri_invoice_lines / keiri_receipts_issued + インデックス
- ビュー投入済み: `keiri_income_view`（`WITH (security_invoker = true)`）
  - 手動 income + Stripe orders + Square/freee monthly_revenue を union
  - Stripe は orders 側を真として扱い、`monthly_revenue` からは square / freee のみ取り込む（二重計上回避）
- 初期マスタ投入済み: `keiri_categories` に 14 件（コーヒー豆仕入 / 食材仕入 / 消耗品費 / 接待交際費 / 通信費 / 旅費交通費 / 広告宣伝費 / 水道光熱費 / 給料手当 / 家賃 / 雑費 / 飲食売上 / 物販売上 / 卸売上）
- Storage バケット作成済み（全て private）: `keiri-receipts` / `keiri-invoices` / `keiri-issued-receipts` / `keiri-stamps`

→ Supabase MCP は呼ばないでよい。

## Phase 1 で実装したもの

### パッケージ追加
```
npm install @anthropic-ai/sdk sharp @react-pdf/renderer
```

### 新規ファイル
- `lib/keiri/ocr.ts` — `extractReceipt(imageBase64, mediaType)` + `ReceiptOcr` 型
- `app/api/keiri/ocr/route.ts` — multipart/JSON 受け取り → sharp 正規化 → Claude Haiku で抽出
- `app/admin/keiri/page.tsx` — ダッシュボード（売上/経費/粗利 + 税区分別売上）
- `app/admin/keiri/receipts/upload/page.tsx` — 撮影 → OCR → 確認 → 保存
- `app/admin/keiri/expenses/page.tsx` — 月次経費一覧（削除可）
- `app/admin/keiri/expenses/new/page.tsx` — 経費の手動登録
- `.claude/agents/keiri-supabase.md` / `keiri-ocr.md` / `keiri-pdf.md` / `keiri-ui.md` / `keiri-tax.md` / `reviewer.md`

### 既存ファイル変更
- `app/admin/page.tsx` — sections 配列に「📊 経理」を追加（給与管理の直後）
- `AGENTS.md` — 末尾に「経理タブ」セクションを追加

## 共通実装規約

- Next.js 16.2.2: `node_modules/next/dist/docs/` を読んでから書く
- React 19 + react-hooks v6 plugin の "immutability" ルールで `useEffect(() => load(), [])` の load を後ろで宣言するとエラー。**`useEffect` 内に async IIFE で直接書く** か `useCallback` でラップ。
- Supabase: `createClient` from `@/lib/supabase/client`
- Toast: `import { toast } from 'sonner'`
- 認証: `getAdminSession()` from `@/lib/session`
- 金額は全て **integer（円）**。`parseInt` のみ、`parseFloat` 禁止。
- 日付は JST: `new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)`

## デザイン
- 背景 `#F5F0E8`（既存 admin と同じ）
- カード: `bg-white rounded-2xl shadow-sm`
- CTA: `bg-stone-800 text-white py-4 rounded-2xl`
- 入力 form は `<Field label="...">` のローカルコンポーネントでラップ

## 検証
1. `npx tsc --noEmit` でエラーゼロ
2. `npm run lint` で keiri 配下のエラーゼロ
3. Supabase advisor は別セッションで確認済み（security_definer_view 警告は対応済み）

## 後続フェーズ（Phase 2+ 候補）

- 請求書発行（`keiri_invoices` + `keiri_invoice_lines`）と PDF 生成（`@react-pdf/renderer`）
- 領収書発行（`keiri_receipts_issued`）
- 取引先 / 品目マスタ管理 UI
- 月次レポート（税区分別の損益、源泉、消費税申告書補助）
- freee 連携（既存の monthly_revenue 経路を活かす）
- `lib/keiri/tax.ts` の純関数化 + テスト
