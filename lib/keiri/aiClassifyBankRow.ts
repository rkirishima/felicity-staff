import Anthropic from '@anthropic-ai/sdk'
import type { ClassificationContext } from './classifyExpense'

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `あなたは日本のカフェ・コーヒー焙煎店「Felicity」の経理アシスタントです。
住信SBIネット銀行の出金明細を見て、各行を最適な勘定科目に分類します。

【勘定科目（必ずこの名称のいずれかで返す）】
- 給料手当: スタッフへの給料・賞与・社会保険料
- 家賃: 店舗賃料・駐車場代
- 食材仕入: 軽減税率8%対象の食材（牛乳、砂糖、小麦粉、果物、バター、シロップ、乳製品）
- コーヒー豆仕入: 生豆仕入先からの仕入（アタカ通商、Nordic Japan等）
- 通信費: 電話、ネット、サーバー、SaaS（ANTHROPIC, Google Workspace等）
- 水道光熱費: 電気・水道・ガス
- 消耗品費: 一般消耗品・小型備品
- 旅費交通費: 交通費・出張費
- 接待交際費: 飲食店、贈答品
- 広告宣伝費: 印刷物、SNS広告
- 修繕費: 修理・メンテナンス
- 工具器具備品: 30万円以上の機材
- 一括償却資産: 10〜20万円の機材
- 少額減価償却資産: 20〜30万円の機材
- 雑費: 振込手数料、その他不明、判断つかない場合

【SBI銀行摘要パターン解釈】
- 「振込手数料」→ 雑費（金額¥135-¥330）
- 「振込＊（人名カナ）」→ 個人への振込。スタッフ名なら給料手当、業者なら適切な仕入科目
- 「振込＊（カタカナ会社名）」→ 会社名で判断
  - 「フドウサン」「ジユウタクフドウサン」→ 家賃
  - 「メリタ」「タカナシ」「乳製品」→ 食材仕入
  - 「コーヒー」「焙煎」「生豆」→ コーヒー豆仕入
- 「口座振替（会社名）」→ 会社名で判断
  - 「ＳＭＦＬ」「リース」→ 賃借料→雑費 (リース料は雑費 or 賃借料カテゴリ無いので雑費)
  - 「ＳＭＢＣ」+ 会社名 → 会社名で判断
- 「コウセイロウドウシヨウネンキンキヨク」→ 給料手当 (社会保険料)
- 「ANTHROPIC」「OPENAI」「GOOGLE」「AWS」「VERCEL」→ 通信費
- 「デビット 6桁数字」→ 店舗名が摘要にない。category="不明" confidence="low" reason="デビット明細要確認" を返す

【税率】
- 食品 (人が食べる物) → 8 (軽減)
- それ以外 → 10
- 給料・社会保険・家賃 → 対象外 → 10（便宜上）

【出力形式】
返答は以下のJSON配列のみ。説明文一切不要。
[
  {"description": "そのままの摘要", "category": "勘定科目名", "vendor": "推測される取引先名", "tax_rate": 8 | 10, "confidence": "high"|"medium"|"low", "reason": "短い理由"}
]

低信頼度（confidence="low"）の場合は category="不明" と返してもよい。
必ず全ての入力行に対して1要素ずつ返してください。`

export type AiBankInput = {
  description: string
  debit: number
  date: string
}

export type AiBankResult = {
  description: string
  category_name: string
  vendor: string
  tax_rate: number
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export async function aiClassifyBankRows(rows: AiBankInput[]): Promise<AiBankResult[]> {
  if (rows.length === 0) return []
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []

  const client = new Anthropic({ apiKey })

  const userPrompt = [
    '以下の銀行出金行を分類してください:',
    '',
    ...rows.map((r, i) => `${i + 1}. [${r.date}] 摘要: 「${r.description}」 金額: ¥${r.debit.toLocaleString()}`),
  ].join('\n')

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
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
    const m = text.match(/\[[\s\S]*\]/)
    if (!m) return []
    const parsed = JSON.parse(m[0]) as Array<{
      description: string
      category: string
      vendor?: string
      tax_rate: number
      confidence: 'high' | 'medium' | 'low'
      reason: string
    }>
    return parsed.map(p => ({
      description: p.description,
      category_name: p.category,
      vendor: p.vendor ?? '',
      tax_rate: Number(p.tax_rate) === 8 ? 8 : 10,
      confidence: p.confidence,
      reason: p.reason ?? '',
    }))
  } catch {
    return []
  }
}

export function resolveBankCategory(
  result: AiBankResult,
  ctx: ClassificationContext,
): string | null {
  if (result.category_name === '不明') return null
  return ctx.categoryByName.get(result.category_name) ?? null
}
