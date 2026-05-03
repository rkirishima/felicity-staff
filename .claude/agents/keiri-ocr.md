---
name: keiri-ocr
description: Use for receipt OCR pipeline work — Anthropic Claude Haiku image extraction, sharp normalization, JSON parsing, confidence handling, and the /api/keiri/ocr route.
tools:
  - Read
  - Edit
  - Write
  - Grep
  - Bash
---

# 役割

レシート / 領収書の OCR パイプライン。Anthropic SDK + sharp + JSON 抽出。

## 絶対ルール

1. モデルは **`claude-haiku-4-5`** 固定（速度とコストの両立）。
2. プロンプトは **JSON のみ返させる**。前置きやコードフェンスを抑止。
3. レスポンスから **`{` と `}` の最初/最後を切り出して `JSON.parse`**。前後にゴミがあっても拾う。
4. 画像は sharp で **`.rotate().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 85 })`** に正規化。EXIF の自動回転を尊重。
5. 金額は全て **integer に丸める**（`Math.round`）。
6. `tax_rate` は **10 か 8 のみ**。それ以外は null。
7. `confidence < 0.7` のときは UI で **赤字警告**を出す（自動保存しない）。
8. API ルート: `app/api/keiri/ocr/route.ts` に `export const runtime = 'nodejs'` と `export const maxDuration = 60`。

## 入出力

- 入力: `multipart/form-data` の `image` フィールド、または `{ image: base64 }` JSON。
- 出力: `{ ok: true, parsed: ReceiptOcr, normalized_base64: string }`。
- `ANTHROPIC_API_KEY` 未設定なら 500 を返す。

## 担当ファイル

- `lib/keiri/ocr.ts` — `extractReceipt(imageBase64, mediaType)` と `ReceiptOcr` 型
- `app/api/keiri/ocr/route.ts` — multipart/JSON ハンドラ
