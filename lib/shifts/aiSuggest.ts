import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `あなたは日本のカフェ・コーヒー焙煎店「Felicity」のシフト編成アシスタントです。
スタッフから出された「シフト申請（=本人の希望）」のプールを見て、店長（桐島）がどの申請を承認すべきかを助言します。最終決定は必ず店長が行うので、あなたは"ある程度のアドバイス"を返すだけです。

【お店の前提】
- 土日・祝日は来客が多く、人手を厚めに。
- 水曜・木曜はキッチンカー営業日になることがある（locationが cafe 以外＝外部出店）。キッチンカーとカフェは別の人員が必要。
- 1営業日あたりカフェは最低1〜2名いると安心。少なすぎる日・多すぎる日を指摘する。

【公平性＝労働時間の均等（最重要の判断軸）】
- シフトは「各スタッフの労働時間がなるべく均等になる」ことを最優先で調整する。
- 入力の「現在の労働時間ランキング（少ない順）」を必ず見ること。累計時間が少ない人ほど approve を優先する。
- 同じ日・同じ時間帯に複数人の申請が重なって人手が余る場合は、累計時間が最も少ない人を approve、多い人は hold にする。
- 理由には可能なら数値の根拠を入れる（例:「今月8hで最少のため優先」「今月22hで多めのため保留」）。
- ただし人手ゼロになる営業日を埋める申請は、累計時間が多い人でも approve を優先してよい（穴埋め＞均等）。

【あなたの仕事】
入力された「承認待ちの申請(pending)」それぞれについて、承認をおすすめするか(approve)、一旦保留がよいか(hold)を判定し、短い理由を日本語で添える。判断は上記「労働時間の均等」を軸にする。
さらに全体の所見(summary)と、注意点(warnings)を返す。

【warningsに入れる例】
- 同じ人が同じ日の同じ時間帯に二重で入っている（ダブルブッキング）
- 営業日なのに承認済み・申請ともに誰もいない日（人手ゼロ）
- 一人にシフトが集中しすぎている（労働時間が突出している）
- キッチンカー日にカフェ側の人員がいない 等

【出力形式】
返答は以下のJSONのみ。前後の説明文・コードフェンス一切不要。
{
  "summary": "全体の所見を1〜2文で",
  "recommendations": [
    { "id": "申請のid", "action": "approve" | "hold", "reason": "短い理由（20字程度）" }
  ],
  "warnings": ["注意点1", "注意点2"]
}

recommendations には入力された全ての pending 申請を1件ずつ必ず含めてください。`

export type AiShiftPending = {
  id: string
  staffName: string
  date: string
  start_time: string
  end_time: string
  location: string | null
}

export type AiShiftApproved = {
  staffName: string
  date: string
  start_time: string
  end_time: string
  location: string | null
}

export type AiShiftStaff = {
  name: string
  role: string
  /** 対象月の承認済みシフトの累計労働時間（時間） */
  hours?: number
  /** 対象月の承認済みシフトの本数 */
  shiftCount?: number
}

export type AiShiftInput = {
  month: string
  pending: AiShiftPending[]
  approved: AiShiftApproved[]
  staff: AiShiftStaff[]
}

export type AiShiftRecommendation = { id: string; action: 'approve' | 'hold'; reason: string }

export type AiShiftResult = {
  summary: string
  recommendations: AiShiftRecommendation[]
  warnings: string[]
}

const DOW = ['日', '月', '火', '水', '木', '金', '土']
function fmt(s: { date: string; start_time: string; end_time: string; location: string | null; staffName: string }) {
  const d = new Date(s.date + 'T12:00:00')
  const dow = DOW[d.getDay()]
  const loc = s.location && s.location !== 'cafe' ? `［${s.location}］` : ''
  return `${s.date}(${dow}) ${s.start_time?.slice(0, 5)}〜${s.end_time?.slice(0, 5)} ${s.staffName}${loc}`
}

export async function aiSuggestShifts(input: AiShiftInput): Promise<AiShiftResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  if (input.pending.length === 0) {
    return { summary: '承認待ちの申請がありません。', recommendations: [], warnings: [] }
  }

  const client = new Anthropic({ apiKey })

  // 労働時間の少ない順にランキング化（公平性＝均等の判断材料）
  const ranking = [...input.staff]
    .map(s => ({ name: s.name, hours: s.hours ?? 0, shiftCount: s.shiftCount ?? 0 }))
    .sort((a, b) => a.hours - b.hours)

  const userPrompt = [
    `対象月: ${input.month}`,
    '',
    `スタッフ一覧: ${input.staff.map(s => s.name).join('、') || '（なし）'}`,
    '',
    '【現在の労働時間ランキング（対象月の承認済み合計・少ない順＝シフトが少ない人ほど上）】',
    '※ 上にいる人ほど approve を優先する。',
    ...(ranking.length
      ? ranking.map((s, i) => `${i + 1}. ${s.name}：${s.hours}h（${s.shiftCount}回）`)
      : ['（データなし）']),
    '',
    '【承認待ちの申請（=スタッフの希望。これを承認するか判定して）】',
    ...input.pending.map(p => `- id=${p.id} ｜ ${fmt(p)}`),
    '',
    '【すでに承認済み・確定しているシフト（参考。重複や偏りの判断に使う）】',
    ...(input.approved.length ? input.approved.map(a => `- ${fmt(a)}`) : ['（まだなし）']),
  ].join('\n')

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = res.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const parsed = JSON.parse(m[0]) as {
      summary?: string
      recommendations?: Array<{ id?: string; action?: string; reason?: string }>
      warnings?: string[]
    }
    const validIds = new Set(input.pending.map(p => p.id))
    return {
      summary: parsed.summary ?? '',
      recommendations: (parsed.recommendations ?? [])
        .filter(r => r.id && validIds.has(r.id))
        .map(r => ({
          id: r.id as string,
          action: r.action === 'approve' ? 'approve' : 'hold',
          reason: r.reason ?? '',
        })),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter(Boolean) : [],
    }
  } catch (e) {
    console.error('aiSuggestShifts failed', e)
    return null
  }
}
