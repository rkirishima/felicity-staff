import Anthropic from '@anthropic-ai/sdk'

export type ReceiptOcr = {
  date: string | null
  vendor: string | null
  total: number | null
  tax_amount: number | null
  tax_rate: 10 | 8 | null
  items: { name: string; price: number | null; tax_rate?: 10 | 8 | null }[]
  payment_method: string | null
  category_guess: string | null
  registration_number: string | null
  confidence: number
}

const PROMPT = `このレシート/領収書から情報を抽出し、JSON のみを返してください。前置きや説明、コードフェンス（\`\`\`）は不要です。

出力スキーマ:
{
  "date": "YYYY-MM-DD" | null,
  "vendor": "店舗名" | null,
  "total": 税込合計金額（整数・円） | null,
  "tax_amount": 消費税額（整数・円） | null,
  "tax_rate": 10 | 8 | null,
  "items": [{"name": "品目名", "price": 整数・円, "tax_rate": 10 | 8 | null}],
  "payment_method": "現金" | "クレジット" | "電子マネー" | "その他" | null,
  "category_guess": "コーヒー豆仕入" | "食材仕入" | "消耗品費" | "接待交際費" | "通信費" | "旅費交通費" | "広告宣伝費" | "水道光熱費" | "雑費" | null,
  "registration_number": "T1234567890123" 形式のインボイス登録番号 | null,
  "confidence": 0.0〜1.0
}

注意:
- 金額は全て整数（円）。カンマや円記号は除く。
- tax_rate は軽減税率対象（食料品など）が 8、それ以外が 10。
- 不明な項目は null。確信度が低い場合は confidence を下げる。`

export async function extractReceipt(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<ReceiptOcr> {
  const client = new Anthropic()
  const res = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  })

  const text = res.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('OCR response did not contain JSON')
  }
  const json = text.slice(start, end + 1)
  const parsed = JSON.parse(json) as Partial<ReceiptOcr>

  return {
    date: parsed.date ?? null,
    vendor: parsed.vendor ?? null,
    total: typeof parsed.total === 'number' ? Math.round(parsed.total) : null,
    tax_amount: typeof parsed.tax_amount === 'number' ? Math.round(parsed.tax_amount) : null,
    tax_rate: parsed.tax_rate === 10 || parsed.tax_rate === 8 ? parsed.tax_rate : null,
    items: Array.isArray(parsed.items)
      ? parsed.items.map(it => ({
          name: String(it?.name ?? ''),
          price: typeof it?.price === 'number' ? Math.round(it.price) : null,
          tax_rate: it?.tax_rate === 10 || it?.tax_rate === 8 ? it.tax_rate : null,
        }))
      : [],
    payment_method: parsed.payment_method ?? null,
    category_guess: parsed.category_guess ?? null,
    registration_number: parsed.registration_number ?? null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
  }
}
