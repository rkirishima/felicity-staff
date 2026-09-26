// 焙煎の AI フィードバック。サーバー専用。
// 判定（クラッシュ等）は lib/roast/curve.ts が先に数値で出す。AI の役割は
// 「何が起きたかを人の言葉で」「味とカーブを結びつける」「次回変えることを1つだけ」。
import Anthropic from '@anthropic-ai/sdk'
import type { RoastContext, ReviewJson, HistoryItem } from './data'
import type { RecommendedProfile } from './profile'
import { fmtSec } from './profile'

const PRIMARY_MODEL = process.env.ROAST_AI_MODEL || 'claude-sonnet-4-5'
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001'

const KNOWLEDGE = `あなたは葉山のカフェ「Felicity」の焙煎コーチです。焙煎機は Probat P05III（5kg釜・ガス・ドラム式）、通常 1〜2kg、ときどき 3.6kg を焼きます。
焙煎担当は忙しいカフェスタッフと店主。短く、具体的に、次に何をするかがすぐ分かる日本語で答えます。

【この窯の癖（実績から）】
- 前半が走りやすい（1分ほど早く進む傾向）。150°C到達が4分台前半なら速い。
- 2kg はピークガス65%が基本。1kg は釜に対して少量（20%）で、プローブが豆に埋まり切らずRoRがギザつくことがある。
- 蓄熱が大きく、1ハゼ後にガスを残すと RoR が反転（フリック）しやすい。220°C を超えると豆自身が発熱して止まりにくい。
- 1ハゼは「かすかな音」で取る（実績平均 200.6°C ± 3）。DTR は1ハゼ開始から。
- ガスは大きく2〜3回動かすより、小刻みに下げる方が曲線が安定する。

【判断の基準（研究・実験からの要約）】
- RoR は投入後の山から、1ハゼ・ドロップへ向けてなだらかに下がるのが基本形。1ハゼ前に RoR が平ら→上昇すると、1ハゼでクラッシュ→その後フリックになりやすく、甘さが減り、ロースト感・平板さが出る。
- クラッシュがドロップ直前なら影響は小さい。1〜2分前だと影響が大きい。
- ドライエンド（約150〜160°C）以降は豆からの水分放出が減り RoR が下がりにくくなる。約5°Cごとに小さくガスを下げると右肩下がりを保てる。ただし1ハゼの瞬間に下げすぎると RoR が急落し、酸が尖る。
- 150°C→1ハゼ（メイラード）を長くすると甘さ・丸みが増え酸が穏やかになる傾向（ただし総時間も伸びる）。短いと酸・フレーバー寄り。
- 小バッチ（釜容量の2〜3割）では、1ハゼに向けて RoR が「緩やかに」上がる運転でも明るい酸が出る、という現場の意見がある。急な上昇とは区別する。
- 重量減の目安は生豆水分+2〜3%（浅煎り約11〜13%）。同じ豆で0.5%以上ずれたら別の焙煎と考える。
- 味の手がかり: 草・干し草・穀物感＝後半の熱不足/短すぎ。灰・焦げ・焼き菓子の焦げ＝終盤の熱過多・高温メタル（スコーチ）。平板・退屈＝長すぎ/クラッシュ。酸が刺さる＝短すぎ/1ハゼでの急落。トルティーヤ・穀物っぽい甘さ＝途中で温度が落ちて戻った。
- 1回の修正で変えるのは1つだけ。ガスなら「いつ・何%→何%」、時間なら秒で書く。

【禁止】
- 与えられていない数値を作らない。データが無い項目は「データなし」と言う。
- 抽象的な助言（「丁寧に」「様子を見て」だけ）は書かない。`

function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return apiKey ? new Anthropic({ apiKey }) : null
}

async function callJson(system: string, user: string, maxTokens = 1500): Promise<{ json: unknown; model: string } | null> {
  const c = client()
  if (!c) return null
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const res = await c.messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
      })
      const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) continue
      return { json: JSON.parse(m[0]), model }
    } catch (e) {
      console.error(`roast ai (${model}) failed`, e)
    }
  }
  return null
}

function profileLines(p: RecommendedProfile | null): string[] {
  if (!p) return ['（この豆の目標プロファイルは未登録）']
  return [
    `目標プロファイル: ${p.batch_kg}kg / ${p.use_case ?? '-'} / ${p.roast_level ?? '-'}（信頼度 ${p.confidence}）`,
    `  投入BT ${p.charge_temp_c ?? '-'}°C, ドライエンド ${p.dry_end ?? '-'} ${p.dry_end_temp_c ?? ''}°C, 1ハゼ ${p.fc_target ?? '-'} ${p.fc_temp_c ?? ''}°C, ドロップ ${p.drop_target ?? '-'} ${p.drop_temp_c ?? '-'}°C, DTR ${p.dtr_pct ?? '-'}%, 重量減 ${p.weight_loss_pct ?? '-'}%`,
    `  ガス 投入${p.gas_charge_pct ?? '?'} → DE${p.gas_dry_end_pct ?? '?'} → 1ハゼ${p.gas_fc_pct ?? '?'} → ドロップ${p.gas_drop_pct ?? '?'} / ファン ${p.fan_charge_pct ?? '?'}→${p.fan_fc_pct ?? '?'}→${p.fan_drop_pct ?? '?'} / ドロップ時RoR目安 ${p.ror_drop_min ?? '-'}`,
    p.gas_plan ? `  ガスプラン: ${p.gas_plan}` : '',
    p.watchouts ? `  注意: ${p.watchouts.slice(0, 400)}` : '',
  ].filter(Boolean)
}

function historyLines(h: HistoryItem[]): string[] {
  if (!h.length) return ['（同じ豆・近いバッチの過去ローストなし）']
  return h.map((x) => {
    const d = x.digest
    const parts = [
      x.roasted_at.slice(0, 10),
      `${x.green_kg}kg`,
      d ? `1ハゼ ${fmtSec(d.fc_s)}${d.fc_c ? `/${d.fc_c}°` : ''}` : '',
      d ? `ドロップ ${fmtSec(d.drop_s)}${d.drop_c ? `/${d.drop_c}°` : ''}` : '',
      d?.dtr_pct != null ? `DTR ${d.dtr_pct}%` : '',
      d?.ror_at_drop != null ? `RoR@drop ${d.ror_at_drop}` : '',
      x.weight_loss_pct != null ? `重量減 ${x.weight_loss_pct}%` : '',
      d?.flags?.length ? `判定[${d.flags.map((f) => f.code).join(',')}]` : '',
      x.cup ? `カップ ${x.cup.overall ?? '-'}/10 甘${x.cup.sweetness ?? '-'} 酸${x.cup.acidity ?? '-'} ボ${x.cup.body ?? '-'}${x.cup.defects?.length ? ` 欠点:${x.cup.defects.join('・')}` : ''}${x.cup.notes ? ` 「${x.cup.notes.slice(0, 60)}」` : ''}` : 'カップ未評価',
      x.next_time ? `前回の宿題: ${x.next_time}` : '',
    ]
    return '- ' + parts.filter(Boolean).join(' / ')
  })
}

export async function reviewRoast(ctx: RoastContext): Promise<{ review: ReviewJson; model: string } | null> {
  const d = ctx.digest
  const cup = ctx.cuppings[0]
  const lines = [
    `豆: ${ctx.bean_name}`,
    `焙煎日時: ${ctx.log.roasted_at} / 生豆 ${ctx.log.green_kg}kg / 焙煎後 ${ctx.log.roasted_kg ?? '未入力'}kg / 重量減 ${ctx.weight_loss_pct ?? '不明'}%`,
    `用途: ${ctx.log.use_case ?? '-'} / レベル: ${ctx.log.roast_level ?? '-'}`,
    ctx.log.notes ? `焙煎メモ: ${ctx.log.notes}` : '',
    '',
    ...profileLines(ctx.profile),
    '',
    ctx.curve ? '【今回のカーブ（Probat実測から計算済み）】' : '【今回（カーブ未取得。焙煎タイマーの手入力時刻のみ）】',
    d ? [
      `ボトム ${d.tp_c ?? '-'}°C @${fmtSec(d.tp_s)}`,
      `150°C ${fmtSec(d.dry_end_s)} / 175°C ${fmtSec(d.t175_s)}`,
      `1ハゼ ${fmtSec(d.fc_s)} ${d.fc_c ?? ''}°C / ドロップ ${fmtSec(d.drop_s)} ${d.drop_c ?? ''}°C`,
      `発達 ${fmtSec(d.dev_s)} DTR ${d.dtr_pct ?? '-'}% / メイラード ${fmtSec(d.maillard_s)}`,
      `RoR ピーク ${d.ror_peak ?? '-'} / 1ハゼ時 ${d.ror_at_fc ?? '-'} / ドロップ時 ${d.ror_at_drop ?? '-'}`,
    ].join('\n') : 'データなし',
    d?.ror_at?.length ? `RoR 30秒ごと: ${d.ror_at.map((x) => `${fmtSec(x.t)}=${x.ror}`).join(' ')}` : '',
    d?.controls?.length ? `操作: ${d.controls.map((c) => `${fmtSec(c.t)} ${c.what}${c.value}`).join(', ')}` : '',
    d?.flags?.length ? `コード判定: ${d.flags.map((f) => `[${f.severity}] ${f.message}`).join(' / ')}` : 'コード判定: 特記なし',
    '',
    cup
      ? `【カップ評価】総合 ${cup.overall ?? '-'}/10、甘さ ${cup.sweetness ?? '-'}/5、酸 ${cup.acidity ?? '-'}/5、ボディ ${cup.body ?? '-'}/5、欠点: ${cup.defects?.join('・') || 'なし'}、メモ: ${cup.notes ?? '-'}`
      : '【カップ評価】まだなし（カーブと重量減だけで判断）',
    '',
    '【同じ豆の過去ロースト（新しい順）】',
    ...historyLines(ctx.history),
    '',
    `次の JSON だけを返してください（前後の文章・コードフェンス不要）:
{
  "headline": "30字以内。今回の焙煎を一言で",
  "verdict": "good" | "ok" | "fix",
  "summary": "2文以内。目標との差と、その結果（カップ評価があれば味との関係）",
  "what_happened": ["起きたことを最大4つ。時刻と数値を入れる"],
  "cup_link": "カップ評価がある時だけ：味の特徴がカーブのどこから来たか1文。無ければ null",
  "next_time": { "change": "次回変えることを1つだけ。時刻/温度とガス%・秒で具体的に", "why": "理由を1文" },
  "keep": ["次回も変えずに維持すべき良かった点を最大2つ"]
}`,
  ].filter((x) => x !== '')

  const res = await callJson(KNOWLEDGE, lines.join('\n'))
  if (!res) return null
  const j = res.json as Partial<ReviewJson>
  const review: ReviewJson = {
    headline: String(j.headline ?? '').slice(0, 60),
    verdict: j.verdict === 'good' || j.verdict === 'fix' ? j.verdict : 'ok',
    summary: String(j.summary ?? ''),
    what_happened: Array.isArray(j.what_happened) ? j.what_happened.map(String).slice(0, 4) : [],
    cup_link: j.cup_link ? String(j.cup_link) : null,
    next_time: {
      change: String(j.next_time?.change ?? ''),
      why: String(j.next_time?.why ?? ''),
    },
    keep: Array.isArray(j.keep) ? j.keep.map(String).slice(0, 2) : [],
  }
  return { review, model: res.model }
}

export type BriefJson = {
  focus: string
  points: string[]
  watch: { at: string; what: string }[]
}

export async function briefRoast(input: {
  bean_name: string
  green_kg: number
  use_case: string
  profile: RecommendedProfile | null
  history: HistoryItem[]
}): Promise<BriefJson | null> {
  const user = [
    `これから焼く豆: ${input.bean_name} / ${input.green_kg}kg / 用途 ${input.use_case}`,
    '',
    ...profileLines(input.profile),
    '',
    '【同じ豆・近いバッチの直近ロースト（新しい順）】',
    ...historyLines(input.history),
    '',
    `焙煎直前にスタッフが10秒で読む「今日のポイント」を作ってください。前回の宿題とカップ評価を最優先で反映し、過去の失敗を繰り返さないようにします。
次の JSON だけを返してください:
{
  "focus": "今日いちばん大事なこと。25字以内",
  "points": ["具体的な操作や目標を最大3つ。各40字以内。時刻・温度・ガス%を入れる"],
  "watch": [{ "at": "m:ss または 温度（例 175°C）", "what": "その時に確認/操作すること 20字以内" }]
}
watch は最大4つ、時系列順。`,
  ].join('\n')
  const res = await callJson(KNOWLEDGE, user, 800)
  if (!res) return null
  const j = res.json as Partial<BriefJson>
  return {
    focus: String(j.focus ?? ''),
    points: Array.isArray(j.points) ? j.points.map(String).slice(0, 3) : [],
    watch: Array.isArray(j.watch)
      ? j.watch.slice(0, 4).map((w) => ({ at: String((w as { at?: string }).at ?? ''), what: String((w as { what?: string }).what ?? '') }))
      : [],
  }
}
