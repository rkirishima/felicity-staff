import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'

export type ExtractedPayable = {
  vendor: string | null
  description: string | null
  amount: number | null
  invoice_number: string | null
  order_date: string | null
  due_date: string | null
  confidence: 'high' | 'medium' | 'low'
  notes: string | null
}

const SYSTEM_PROMPT = `あなたは経理アシスタントです。仕入先からのメール本文を読み、支払予定として登録すべき情報を抽出します。

返す JSON のスキーマ:
{
  "vendor": string | null,         // 取引先名（メール送信元 / 署名 から推定）
  "description": string | null,    // 商品・サービス概要 一文。例: "エチオピア生豆 30kg"
  "amount": number | null,         // 税込金額（円）。送料込み・税込みで判定。
  "invoice_number": string | null, // 請求書/注文番号
  "order_date": string | null,     // YYYY-MM-DD。受注日 or 発送日
  "due_date": string | null,       // YYYY-MM-DD。支払期日。明記なければ null（呼び出し側で発注日+デフォルト日数を補う）
  "confidence": "high" | "medium" | "low",
  "notes": string | null           // 補足。配送日や特殊事項があれば。
}

ルール:
- amount は税込み総額。"小計"でなく"合計"を採用。
- 数字は半角整数。¥1,234 → 1234。
- 日付は YYYY-MM-DD JST。
- 「請求書」「お支払いのお願い」「ご注文確認」など、支払いを伴う取引メールでなければ全フィールド null + confidence: "low"。
- 受信ニュース・広告・配送通知のみ等で金額が読み取れない場合も同様。
- 確信が持てないフィールドは null にする。捏造しない。

返答は JSON のみ。他の説明は不要。`

export async function extractPayable(input: {
  vendor_hint: string | null
  from: string
  subject: string
  bodyText: string
  defaultDueDays: number
  receivedAtIso: string
}): Promise<ExtractedPayable | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  const userPrompt = [
    input.vendor_hint ? `想定される取引先: ${input.vendor_hint}` : '',
    `受信日時 (JST): ${input.receivedAtIso}`,
    `デフォルト支払期日日数: ${input.defaultDueDays}日`,
    '',
    `From: ${input.from}`,
    `Subject: ${input.subject}`,
    '',
    'Body:',
    input.bodyText.slice(0, 12000), // truncate excessively long emails
  ].filter(Boolean).join('\n')

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (e) {
    console.error('[extractPayable] anthropic call failed:', e)
    return null
  }

  const content = response.content.find(c => c.type === 'text')
  if (!content || content.type !== 'text') return null
  const text = content.text.trim()
  // Strip markdown fences if any
  const cleaned = text
    .replace(/^```(json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    console.error('[extractPayable] JSON parse failed. raw:', text, e)
    return null
  }

  const num = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
    if (typeof v === 'string') {
      const n = parseInt(v.replace(/[^\d-]/g, ''), 10)
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

  return {
    vendor: str(parsed.vendor),
    description: str(parsed.description),
    amount: num(parsed.amount),
    invoice_number: str(parsed.invoice_number),
    order_date: str(parsed.order_date),
    due_date: str(parsed.due_date),
    confidence: ((['high', 'medium', 'low'].includes(parsed.confidence as string) ? parsed.confidence : 'low') as ExtractedPayable['confidence']),
    notes: str(parsed.notes),
  }
}
