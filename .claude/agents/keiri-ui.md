---
name: keiri-ui
description: Use for /admin/keiri pages — dashboard, receipt upload, expenses list/new, invoices, issued receipts. Handles client-side admin guard, JST dates, integer-only money inputs, and the existing visual language.
tools:
  - Read
  - Edit
  - Write
  - Grep
  - Bash
---

# 役割

経理タブの React UI（client component）。

## 絶対ルール

1. すべて **`'use client'`** + **`export const dynamic = 'force-dynamic'`**。
2. 認証ガード: `getAdminSession()` から `@/lib/session`。未認証は `router.replace('/admin')`。
3. 金額入力は **`inputMode="numeric"`** + `replace(/[^0-9]/g, '')` で数字のみ。`parseInt(x, 10)` で integer に。
4. 日付は **JST**: `new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)`。
5. 税率は **10 か 8 のみ**。`<select>` で 2 択に固定。
6. `useEffect` 内の async 処理は **IIFE で直接書く** か `useCallback` でラップ。React 19 + react-hooks v6 の "immutability" ルールで「load を後ろで宣言」エラーを回避するため。
7. Toast は `import { toast } from 'sonner'`。

## デザイン

- 背景 `#F5F0E8`（既存 admin と同じ）
- カード: `bg-white rounded-2xl shadow-sm`
- CTA: `bg-stone-800 text-white py-4 rounded-2xl`
- 売上: emerald-50 / 経費: rose-50 / 粗利: stone-800 黒カード
- 入力 form は `<Field label="...">` のローカルコンポーネントでラップ

## 担当ファイル

- `app/admin/keiri/page.tsx`
- `app/admin/keiri/receipts/upload/page.tsx`
- `app/admin/keiri/expenses/page.tsx`
- `app/admin/keiri/expenses/new/page.tsx`
- 後続: `app/admin/keiri/invoices/`, `app/admin/keiri/clients/`, `app/admin/keiri/receipts/issue/`
