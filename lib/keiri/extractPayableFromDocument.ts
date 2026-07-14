import Anthropic from '@anthropic-ai/sdk'
import type { ExtractedPayable } from './extractPayable'

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `あなたは経理アシスタントです。仕入先からの請求書(PDFまたは写真)を読み、支払予定として登録すべき情報を抽出します。

返す JSON のスキーマ:
{
  "vendor": string | null,         // 発行元の会社名・屋号(書面の発行者欄から)
  "description": string | null,    // 商品・サービス概要 一文。例: "エチオピア生豆 30kg"
  "amount": number | null,         // 税込請求金額(円)。「合計」「御請求額」を採用
  "invoice_number": string | null, // 請求書番号
  "order_date": string | null,     // YYYY-MM-DD。発行日 or 締め日
  "due_date": string | null,       // YYYY-MM-DD。支払期日。「翌月末」等は order_date から具体日に換算。明記なければ null
  "confidence": "high" | "medium" | "low",
  "notes": string | null           // 消費税8%/10%の内訳、繰越請求(新規買上0)、表記矛盾など補足
}

ルール:
- amount は今回買上の税込額。前月繰越を含む「御請求額合計」ではなく当月分を優先し、繰越がある場合は notes に書く。
- 新規買上が0円の繰越請求書なら amount: 0 とし notes に「繰越請求」と書く。
- 数字は半角整数。¥1,234 → 1234。
- 日付は YYYY-MM-DD (JST)。
- 請求書・請求明細書でない書類(見積書・領収書・広告等)は全フィールド null + confidence: "low" で notes に書類種別を書く。
- 手書き等で金額が確実に読めない場合は amount: null にする。捏造しない。

返答は JSON のみ。他の説明は不要。`

// PDF/画像の請求書ファイルから支払情報を抽出する。
// extractPayable (メール本文用) の document 版。
export async function extractPayableFromDocument(input: {
  fileName: string
  mimeType: string
  base64: string
}): Promise<ExtractedPayable | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  const isPdf = input.mimeType === 'application/pdf'
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!isPdf && !imageTypes.includes(input.mimeType)) return null

  const fileBlock = isPdf
    ? {
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: input.base64 },
      }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: input.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: input.base64,
        },
      }

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: `ファイル名: ${input.fileName}\nこの請求書から支払情報をJSONで抽出してください。` },
          ],
        },
      ],
    })
  } catch (e) {
    console.error('[extractPayableFromDocument] anthropic call failed:', e)
    return null
  }

  const content = response.content.find(c => c.type === 'text')
  if (!content || content.type !== 'text') return null
  const text = content.text.trim()
  const jsonText = text.startsWith('```')
    ? text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    : text
  try {
    return JSON.parse(jsonText) as ExtractedPayable
  } catch {
    console.error('[extractPayableFromDocument] JSON parse failed:', text.slice(0, 300))
    return null
  }
}
