// AI レシピ設計。実際の焙煎データが無い豆・バッチ・レベル（新しい豆を含む）の試作レシピを作る。サーバー専用。
// 根拠の優先順: ①この豆の別バッチ/別レベルの実績レシピ ②同じ精製・産地の実績レシピ
// ③この窯の実測値 ④研究レポートの原則（reports/Probat roast profiles by bean.md の要約）。
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoastLevel } from '@/lib/roast-profiles'
import { callJson } from './ai'
import { WL_BAND } from './best'
import { fmtSec } from './profile'
import type { Recipe, RecipeStep, RecipeTargets } from './recipe'

const DESIGN_KNOWLEDGE = `あなたは葉山のカフェ Felicity の焙煎設計者です。焙煎機は PROBAT P05 III（5kg釜・ガス14kW・排気約110m³/h・重量約440kg）。
重く反応が遅い窯なので、ガス操作は効くまで30〜60秒かかる前提で早めに動かします。

【この窯の実測（Probat カーブ223本の中央値）】
- 1kg: 投入BT 190°C前後（記録が正常なもの）/ ボトム 1:06 / 1ハゼ 8:16 / 合計 10:20 / 重量減 14.2%
- 2kg: 投入 191°C / ボトム 1:02 / 1ハゼ 8:07 / 合計 10:28 / ドロップ 216°C / 重量減 15.1%
- 2.5kg: 投入 188°C / 1ハゼ 8:49 / 合計 11:41 / 重量減 16.0%
- 3.6kg: 投入 189°C / ボトム 1:04 / 1ハゼ 9:16 / 合計 11:09 / ドロップ 218°C / 重量減 16.0%
- 1ハゼは豆の種類・バッチによらず 200.6°C ± 3（最も信頼できる基準点）。
- 投入温度はバッチでほとんど変えておらず、差はガスで吸収している。バッチを変える時は投入温度より「ガスの段」を調整する。
- ファン: 1ハゼ前にファンを40未満に抑えると、2kg・3.6kg では1ハゼが約1分早くなる（熱が逃げない）。1kg ではファンが低いとハゼ後のRoRが乱れやすい（振れ幅 7.8 vs 5.1）。基本はファン 30〜40で投入、黄色〜1ハゼで 50〜70 に上げ、ドロップ前に 70〜85。
- ドラム（Probat表示の%。回転数ではない）: 実績は 1kg 平均60（45〜70とばらつく）、2kg 62、2.5〜3.6kg 63〜65。焙煎中に変えることはほぼ無い。
  1kg は豆が少なくプローブが埋まりにくいので、ドラムを上げすぎない（60前後）。大バッチは 63〜65 で豆をよく混ぜる。
- ソーク（投入直後ガス20%以下で約50秒）: ボトムの時刻はほぼ変わらない（1:06 前後）。効果は前半の熱量が減って1ハゼが20〜60秒遅れること。デリケートな豆・小バッチの焦げ防止としては有効、風味を良くする根拠は弱い。投入温度を下げるのと同じ効果と考える。

【原則（研究の要約）】
- 目標はカーブの形より「時間」。ボトム 1:00〜1:30、黄色(150°C) 4:00〜5:30、1ハゼ 8:00〜9:30。
- 発達時間が味を決める主な要因: 短い→果実・酸・甘さ、長い→ロースト・ナッツ・苦味。
  浅煎りドリップ 1:00〜1:30（DTR 15〜20%）、オムニ 1:30〜2:00（18〜22%）、エスプレッソ/深煎り 2:00〜2:45（20〜25%）。
- RoR は1ハゼに向けてなだらかに下げる。1ハゼの瞬間の急なガス変更はクラッシュ→フリックの原因。主なガス下げは1ハゼの60〜120秒前（185〜190°C）に済ませる。
- 重量減: 浅 11.5〜13.5% / シティ 12.5〜14.5% / 中 14〜16.5% / 深 16〜19%。
- バッチを変える時は「黄色→1ハゼ」「1ハゼ→ドロップ」の時間を揃え、ガスとファンで合わせる。

【精製・豆質による調整（2kg・ウォッシュト中密度を基準に）】
- 高地・高密度ウォッシュト（エチオピア、グアテマラ高地）: 投入 +5〜10°C、前半しっかり、1ハゼまで熱を保つ。
- 低密度・低地（ブラジル等）: 投入 −5°C、後半やさしく、1ハゼ前に早めにガスを下げる。焦げ・ロースト感に注意。
- ナチュラル（高地）: 中盤のガスはやや控えめ、1ハゼ15°C前で少し押してハゼを揃える。ハゼ後に引きすぎない。DTR 18〜20%。
- ハニー/パルプドナチュラル: 投入 0〜−10°C、前半やさしく、メイラードを伸ばしすぎない。
- アナエロビック/長期発酵: 投入 −10〜−20°C、長くやさしく、1ハゼ前と1ハゼで熱を抜く、黄色と1ハゼでファンを開ける。色が濃く見えるので色で判断しない。1ハゼの温度幅が広い。
- カルチャード/アナエロビック・ウォッシュト: 投入 −5〜−10°C、なだらかに下げ続ける。
- デカフェ: 投入 −5〜−10°C、乾燥と1ハゼ前で早めに緩める、1ハゼでRoRが跳ねるので先回り、発達は低RoRで長め。色が早く濃くなるので温度と時間で判断。重量減は通常より少ない。
- 大粒（パカマラ等）: 前半に熱を入れ、1ハゼ1〜2分前にしっかり下げる。ハゼで急に走る。
- イエメン: 熱が入りやすいのに1ハゼが遅い。早めにガスを抜き、遅い1ハゼまで惰性で運ぶ。72時間休ませる。
- ゲイシャ: 強い立ち上げはしない、やさしいファン、1ハゼ前に十分下げる。
- 古い生豆（収穫から1年以上）: 投入 −5°C、紙っぽさにはドロップを +2〜4°C。

【禁止】
- 実績レシピに無い操作を勝手に発明しない。必ず一番近い実績レシピを土台にし、変える量と理由を書く。
- 数値は現実的な範囲（ガス 0〜95%、ファン 20〜90、投入 170〜215°C、合計 8:30〜13:30）に収める。`

type Similar = Pick<Recipe, 'bean_id' | 'batch_kg' | 'roast_level' | 'status' | 'charge_temp_c' | 'drum_pct' | 'steps' | 'targets'> & {
  bean_name?: string
  process?: string | null
  origin?: string | null
}

function recipeText(r: Similar): string {
  const t = r.targets ?? {}
  const steps = (r.steps ?? []).map((s) => `${fmtSec(s.t)}${s.bt != null ? `(${s.bt}°C)` : ''} ガス${s.gas ?? '-'} ファン${s.fan ?? '-'}${s.drum != null ? ` ドラム${s.drum}` : ''}`).join(' / ')
  return `[${r.bean_name ?? r.bean_id} / ${r.process ?? '-'} / ${r.origin ?? '-'} / ${r.batch_kg}kg / ${r.roast_level} / ${r.status}] 投入${r.charge_temp_c ?? '-'}°C ドラム${r.drum_pct ?? '-'} | ${steps} | 黄色${fmtSec(t.yellow_s)} 1ハゼ${fmtSec(t.fc_s)}/${t.fc_c ?? '-'}°C ドロップ${fmtSec(t.drop_s)}/${t.drop_c ?? '-'}°C 発達${fmtSec(t.dev_s)} 重量減${t.wl_lo ?? '-'}〜${t.wl_hi ?? '-'}%`
}

const clamp = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 10) / 10)) : null
}

export async function designRecipe(sb: SupabaseClient, beanId: string, batchKg: number, level: RoastLevel) {
  const { data: bean } = await sb.from('roast_beans').select('id, display_name, origin_country, process, notes').eq('id', beanId).maybeSingle()
  if (!bean) return null
  const b = bean as { id: string; display_name: string; origin_country: string | null; process: string | null; notes: string | null }

  const { data: all } = await sb
    .from('roast_recipes')
    .select('bean_id, batch_kg, roast_level, status, charge_temp_c, drum_pct, steps, targets, roast_beans(display_name, process, origin_country)')
    .in('status', ['confirmed', 'suggested'])
  type Row = Similar & { roast_beans: { display_name: string; process: string | null; origin_country: string | null } | null }
  const rows = ((all as unknown as Row[]) ?? []).map((r) => ({ ...r, bean_name: r.roast_beans?.display_name, process: r.roast_beans?.process, origin: r.roast_beans?.origin_country }))
  const own = rows.filter((r) => r.bean_id === beanId)
  const rank = (r: Similar) =>
    (r.process && b.process && r.process === b.process ? 0 : 2) + (r.origin && r.origin === b.origin_country ? 0 : 1)
    + Math.abs(Number(r.batch_kg) - batchKg) + (r.status === 'confirmed' ? 0 : 0.5)
  const similar = rows.filter((r) => r.bean_id !== beanId).sort((x, y) => rank(x) - rank(y)).slice(0, 4)

  const band = WL_BAND[level]
  const user = [
    `設計する豆: ${b.display_name}（産地 ${b.origin_country ?? '-'} / 精製 ${b.process ?? '-'}）`,
    b.notes ? `豆の情報: ${b.notes.slice(0, 500)}` : '',
    `バッチ ${batchKg}kg / ローストレベル ${level}（重量減の帯 ${band[0]}〜${band[1]}%）`,
    '',
    '【この豆の実績レシピ（別バッチ・別レベル）】',
    ...(own.length ? own.map(recipeText) : ['なし（この豆はまだ焙煎データが無い）']),
    '',
    '【似た豆の実績レシピ（精製・産地が近い順）】',
    ...(similar.length ? similar.map(recipeText) : ['なし']),
    '',
    `この豆・このバッチ・このレベルの最初のレシピを設計してください。一番近い実績レシピを土台にし、豆の性質とバッチ差に合わせて調整します。
次の JSON だけを返してください（前後の文章なし）:
{
  "charge_temp_c": 数値,
  "drum_pct": 数値,
  "steps": [{ "t": 投入からの秒(整数), "bt": その時の豆温度の目安(整数 or null), "gas": ガス%(整数 or null=変更なし), "fan": ファン(整数 or null=変更なし), "drum": ドラム(整数 or null=変更なし), "note": "短い操作メモ or null" }],
  "targets": { "tp_s": 秒, "yellow_s": 秒, "fc_s": 秒, "fc_c": 数値, "drop_s": 秒, "drop_c": 数値, "dev_s": 秒, "dtr_pct": 数値, "wl_lo": 数値, "wl_hi": 数値 },
  "watch": "焙煎中に一番気をつけること。60字以内。時刻・温度・ガス%を入れる",
  "why": "どの実績を土台に、何をどれだけ変えたか。100字以内"
}
steps は最初の行を t=0（投入時のガス・ファン・ドラム）にし、時系列で6〜10行。drum_pct は投入時のドラム。`,
  ].filter((x) => x !== '')

  const res = await callJson(DESIGN_KNOWLEDGE, user.join('\n'), 2000)
  if (!res) return null
  const j = res.json as { charge_temp_c?: unknown; drum_pct?: unknown; steps?: unknown; targets?: Record<string, unknown>; watch?: unknown; why?: unknown }

  const steps: RecipeStep[] = (Array.isArray(j.steps) ? j.steps : [])
    .map((s) => s as Record<string, unknown>)
    .map((s) => ({ t: clamp(s.t, 0, 1200) ?? 0, bt: clamp(s.bt, 50, 240), gas: clamp(s.gas, 0, 100), fan: clamp(s.fan, 0, 100), drum: clamp(s.drum, 30, 90), note: typeof s.note === 'string' ? s.note.slice(0, 40) : null }))
    .sort((a, c) => a.t - c.t)
    .slice(0, 12)
  if (steps.length < 3) return null
  const tg = j.targets ?? {}
  const targets: RecipeTargets = {
    tp_s: clamp(tg.tp_s, 30, 150), yellow_s: clamp(tg.yellow_s, 150, 420),
    fc_s: clamp(tg.fc_s, 360, 720), fc_c: clamp(tg.fc_c, 190, 210),
    drop_s: clamp(tg.drop_s, 420, 840), drop_c: clamp(tg.drop_c, 195, 235),
    dev_s: clamp(tg.dev_s, 30, 240), dtr_pct: clamp(tg.dtr_pct, 8, 32),
    wl_lo: clamp(tg.wl_lo, 9, 20) ?? band[0], wl_hi: clamp(tg.wl_hi, 9, 21) ?? band[1],
  }
  return {
    row: {
      bean_id: beanId,
      batch_kg: batchKg,
      roast_level: level,
      status: 'ai_draft' as const,
      source: 'ai' as const,
      source_curve_id: null,
      charge_temp_c: clamp(j.charge_temp_c, 165, 215),
      drum_pct: clamp(j.drum_pct, 40, 80),
      steps,
      targets,
      watch: typeof j.watch === 'string' ? j.watch.slice(0, 120) : null,
      why: typeof j.why === 'string' ? `AI試作（${res.model}）: ${j.why.slice(0, 200)}` : `AI試作（${res.model}）`,
      score: null,
      updated_at: new Date().toISOString(),
    },
  }
}
