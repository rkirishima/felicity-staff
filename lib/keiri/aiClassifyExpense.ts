import Anthropic from '@anthropic-ai/sdk'
import type { ClassificationContext } from './classifyExpense'

const MODEL = 'claude-haiku-4-5-20251001'

const BUSINESS_CONTEXT = `あなたは日本のカフェ・コーヒー焙煎店「Felicity」の経理アシスタントです。
このお店ではコーヒー豆の焙煎、店内カフェ営業、グッズ販売、EC販売を行っています。
仕入れる商品の用途は以下のいずれか:
- 店内営業の備品・消耗品（カップ、ストロー、洗剤、文具、梱包材）
- 食材（牛乳、砂糖、シロップ、小麦粉、バター、果物）
- コーヒー器具（グラインダー、エスプレッソマシン、ドリッパー、フィルター）
- 焙煎・包装関連（袋、ラベル、麻袋、シール）
- 店舗運営機材（冷蔵庫、オーブン、エアコン、PC、iPad、レジ）
- 配送・梱包資材
- 修理メンテナンス部品

Amazonで購入する物は全て事業経費として処理します。`

const SYSTEM_PROMPT = `${BUSINESS_CONTEXT}

商品ごとに、最適な勘定科目を以下の中から1つ選んでください。

【勘定科目（必ずこの名称のいずれかで返す）】
- 消耗品費: 10万円未満の備品、文具、梱包材、洗剤、紙皿、カップ、ストロー、トイレ用品、小型機材
- 食材仕入: 軽減税率8%対象の食材（牛乳、砂糖、小麦粉、果物、バター、シロップ等）
- コーヒー豆仕入: 焙煎用の生豆（業者からの直接仕入れが主、Amazonでは稀）
- 通信費: ルーター、SIM、Wi-Fi機器
- 旅費交通費: 出張・移動関連
- 接待交際費: 贈答品、お土産
- 広告宣伝費: チラシ、名刺、ポスター、販促物
- 水道光熱費: 電気・水・ガス関連（Amazonでは稀）
- 修繕費: 修理部品、メンテナンス部品、交換用パーツ
- 工具器具備品: 30万円以上の機材（冷蔵庫、焙煎機、エスプレッソマシン、PC等）
- 一括償却資産: 10万円〜20万円の機材
- 少額減価償却資産: 20万円〜30万円の機材
- 家賃: 店舗賃料（Amazonでは該当なし）
- 雑費: 上記いずれにも当てはまらない場合のみ

【金額階層ルール（厳守）】
機材・備品系（冷蔵庫、オーブン、PC、家具等）は金額により自動判定:
- 10万円未満 → 消耗品費
- 10〜20万円 → 一括償却資産
- 20〜30万円 → 少額減価償却資産
- 30万円以上 → 工具器具備品

【税率】
- 食品（人が食べる物）→ 8（軽減税率）
- それ以外 → 10

【出力形式】
返答は以下のJSON配列のみ。説明文一切不要。
[
  {"item_name": "そのまま入力された商品名", "category": "勘定科目名", "tax_rate": 8 | 10, "confidence": "high" | "medium" | "low", "reason": "短い理由（10文字以内）"}
]

confidence:
- high: 明確に該当する。
- medium: 推測だがおそらく正しい。
- low: 判断材料が不足。雑費として返してもよい。

必ず入力された全ての item_name に対して1要素ずつ返してください。
`

export type AiItemInput = {
  item_name: string
  amount: number
}

export type AiClassificationResult = {
  item_name: string
  category_name: string
  tax_rate: number
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export async function aiClassifyItems(items: AiItemInput[]): Promise<AiClassificationResult[]> {
  if (items.length === 0) return []
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  const client = new Anthropic({ apiKey })

  const userPrompt = [
    '以下の商品を分類してください:',
    '',
    ...items.map((it, i) => `${i + 1}. ${it.item_name} (¥${it.amount.toLocaleString()})`),
  ].join('\n')

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = res.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      item_name: string
      category: string
      tax_rate: number
      confidence: 'high' | 'medium' | 'low'
      reason: string
    }>
    return parsed.map(p => ({
      item_name: p.item_name,
      category_name: p.category,
      tax_rate: Number(p.tax_rate) === 8 ? 8 : 10,
      confidence: p.confidence,
      reason: p.reason ?? '',
    }))
  } catch {
    return []
  }
}

export function resolveAiResult(
  result: AiClassificationResult,
  ctx: ClassificationContext,
): { category_id: string; tax_rate: number; confidence: AiClassificationResult['confidence'] } | null {
  const id = ctx.categoryByName.get(result.category_name)
  if (!id) return null
  return { category_id: id, tax_rate: result.tax_rate, confidence: result.confidence }
}
