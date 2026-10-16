// 実際の Probat 焙煎から「ベスト焙煎」を選び、それをレシピ（操作表＋目標）に変換する。サーバー専用。
//
// 記録の質が悪いカーブは学習に使わない。1kg で多かった「排出後も記録が続いて、
// 排出後の温度低下をクラッシュと誤判定」するケース（ドロップ温度 < 1ハゼ温度）や、
// 投入を押さずにボトムが取れていないカーブは除外する。
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RoastLevel } from '@/lib/roast-profiles'
import { digestCurve, type CurveDigest, type CurveRow, type CurveSample } from './curve'
import { batchBucket, LEVELS, type RecipeStep, type RecipeTargets } from './recipe'
import { fmtSec } from './profile'

// 重量減の目安（%）。Hoos の帯とこの窯の実測（1kg 14.2 / 2kg 15.1 / 3.6kg 16.0）から
export const WL_BAND: Record<RoastLevel, [number, number]> = {
  light: [11.5, 13.5],
  city: [12.5, 14.5],
  medium: [14, 16.5],
  dark: [16, 19],
}
const FC_C_MACHINE = 200.6 // この窯の 1ハゼ平均（実測 223 本）

type CurveWithLog = CurveRow & {
  roast_log_id: string | null
  bean_id: string | null
  roasted_at: string
  batch_kg: number | null
  notes: string | null
  weight_loss_pct: number | null
  roast_logs: { bean_id: string; green_kg: number; roasted_kg: number | null; roast_level: string | null } | null
}

export type Candidate = {
  curve_id: string
  roasted_at: string
  bean_id: string
  batch_kg: number
  roast_level: RoastLevel
  level_inferred: boolean
  probat_name: string | null
  weight_loss_pct: number | null
  cup: number | null
  digest: CurveDigest
  score: number
  reasons: string[]
  charge_temp_c: number | null
  drum_pct: number | null
  steps: RecipeStep[]
  targets: RecipeTargets
}

/** 学習に使えるカーブか。使えない理由を返す（null = 使える） */
export function recordingProblem(c: CurveRow, d: CurveDigest): string | null {
  if ((c.samples?.length ?? 0) < 200) return 'カーブが短い'
  if (c.metrics?.is_test_roast) return 'テスト焙煎'
  if (d.tp_c == null || d.tp_c > 120 || d.tp_c < 50) return '投入が記録されていない（ボトムが取れない）'
  if (d.fc_s == null || d.fc_c == null) return '1ハゼが記録されていない'
  if (d.drop_c == null || d.drop_c < d.fc_c + 2) return 'ドロップが記録されていない（排出後も記録が続いている）'
  return null
}

function inferLevel(wl: number | null, dropC: number | null): RoastLevel | null {
  if (wl != null) {
    if (wl < 13) return 'light'
    if (wl < 14.5) return 'city'
    if (wl < 16.3) return 'medium'
    return 'dark'
  }
  if (dropC != null) {
    if (dropC < 208) return 'light'
    if (dropC < 213) return 'city'
    if (dropC < 220) return 'medium'
    return 'dark'
  }
  return null
}

/** ガス・ファンの変化点を、人が読める操作表（最大12行）にまとめる */
export function extractSteps(samples: CurveSample[], dropS: number | null): RecipeStep[] {
  const ss = [...samples].filter((s) => typeof s.t === 'number').sort((a, b) => a.t - b.t)
  const end = dropS ?? ss[ss.length - 1]?.t ?? 0
  let bt: number | null = null
  let gas: number | null = null
  let fan: number | null = null
  let drum: number | null = null
  const rows: RecipeStep[] = []
  for (const s of ss) {
    if (s.t > end) break
    if (s.bt != null) bt = s.bt
    const g = s.gas != null ? Math.round(s.gas) : null
    const f = s.air != null ? Math.round(s.air) : null
    const d = s.drum != null ? Math.round(s.drum) : null
    if (s.t <= 10) {
      // 投入時の設定
      if (g != null) gas = g
      if (f != null) fan = f
      if (d != null) drum = d
      continue
    }
    if (!rows.length) rows.push({ t: 0, bt: null, gas, fan, drum })
    const gasCh = g != null && gas != null && Math.abs(g - gas) >= 2
    const fanCh = f != null && fan != null && Math.abs(f - fan) >= 3
    const drumCh = d != null && drum != null && Math.abs(d - drum) >= 2
    if (g != null && gas == null) gas = g
    if (f != null && fan == null) fan = f
    if (d != null && drum == null) { drum = d; rows[0].drum ??= d }
    if (!gasCh && !fanCh && !drumCh) continue
    if (gasCh) gas = g
    if (fanCh) fan = f
    if (drumCh) drum = d
    const last = rows[rows.length - 1]
    // 15秒以内の連続操作は1行にまとめる（最終値を採用）
    if (last.t > 0 && s.t - last.t <= 15) {
      if (gasCh) last.gas = gas
      if (fanCh) last.fan = fan
      if (drumCh) last.drum = drum
      continue
    }
    rows.push({ t: s.t, bt: bt != null ? Math.round(bt) : null, gas: gasCh ? gas : null, fan: fanCh ? fan : null, drum: drumCh ? drum : null })
  }
  if (!rows.length) rows.push({ t: 0, bt: null, gas, fan, drum })
  // 多すぎる時は、間隔が一番短い2行をまとめる
  while (rows.length > 12) {
    let k = 1
    let gap = Infinity
    for (let i = 2; i < rows.length; i++) {
      const d = rows[i].t - rows[i - 1].t
      if (d < gap) { gap = d; k = i }
    }
    const a = rows[k - 1]
    const b = rows[k]
    rows.splice(k - 1, 2, { t: a.t, bt: a.bt, gas: b.gas ?? a.gas, fan: b.fan ?? a.fan, drum: b.drum ?? a.drum })
  }
  return rows
}

function targetsFrom(d: CurveDigest, level: RoastLevel, wl: number | null): RecipeTargets {
  const band = WL_BAND[level]
  return {
    tp_s: d.tp_s, tp_c: d.tp_c,
    yellow_s: d.dry_end_s,
    fc_s: d.fc_s, fc_c: d.fc_c,
    drop_s: d.drop_s, drop_c: d.drop_c,
    dev_s: d.dev_s, dtr_pct: d.dtr_pct,
    // 実測の重量減があればその ±0.5%、無ければレベルの帯
    wl_lo: wl != null ? Math.round((wl - 0.5) * 10) / 10 : band[0],
    wl_hi: wl != null ? Math.round((wl + 0.5) * 10) / 10 : band[1],
  }
}

function score(d: CurveDigest, level: RoastLevel, wl: number | null, name: string | null, roastedAt: string, cup: number | null) {
  let s = 100
  const reasons: string[] = []
  for (const f of d.flags) {
    if (f.code === 'crash_after_fc' || f.code === 'flick_before_drop') {
      s -= f.severity === 'bad' ? 30 : 15
      reasons.push(f.code === 'crash_after_fc' ? '1ハゼ後クラッシュ' : 'フリック')
    } else if (f.code === 'high_ror_at_drop' || f.code === 'ror_rise_into_fc') {
      s -= 8
      reasons.push(f.code === 'high_ror_at_drop' ? 'ドロップ時RoR高め' : '1ハゼ前RoR上昇')
    }
  }
  if (d.fc_c != null && Math.abs(d.fc_c - FC_C_MACHINE) > 4) { s -= 5; reasons.push(`1ハゼ温度 ${d.fc_c}°C`) }
  const band = WL_BAND[level]
  if (wl != null) {
    if (wl >= band[0] - 0.3 && wl <= band[1] + 0.3) { s += 5; reasons.push(`重量減 ${wl}%（帯内）`) }
    else { s -= 8; reasons.push(`重量減 ${wl}%（帯外）`) }
  }
  if (name && /good|final|best|◎|良/i.test(name)) { s += 8; reasons.push(`Probat名「${name}」`) }
  const ageDays = (Date.now() - new Date(roastedAt).getTime()) / 86400e3
  s += Math.max(0, 10 - ageDays / 18) // 新しいほど少し加点（半年でゼロ）
  if (cup != null) { s += (cup - 6) * 5; reasons.push(`カップ ${cup}/10`) }
  if (!reasons.some((r) => /クラッシュ|フリック/.test(r))) reasons.unshift('クラッシュ・フリックなし')
  return { score: Math.round(s), reasons } // 加点で100を超えることがある。並べ替えはこの値、表示は100で頭打ち
}

/** 1つの豆の、学習に使えるカーブ全部をスコア付きで返す（豆×バッチ×レベルでまとめるのは呼び出し側） */
export async function candidatesForBean(sb: SupabaseClient, beanId: string): Promise<{ list: Candidate[]; rejected: number }> {
  // カーブの bean_id は Probat の自由入力名からの推定なので、紐づくログの豆を優先する
  const { data: logs } = await sb.from('roast_logs').select('id').eq('bean_id', beanId)
  const logIds = ((logs as { id: string }[]) ?? []).map((l) => l.id)
  const cols = 'id, roast_log_id, bean_id, roasted_at, batch_kg, samples, events, metrics, total_time_s, fc_start_s, notes, weight_loss_pct, roast_logs(bean_id, green_kg, roasted_kg, roast_level)'
  const [byLog, byBean] = await Promise.all([
    logIds.length ? sb.from('roast_curves').select(cols).in('roast_log_id', logIds) : Promise.resolve({ data: [] }),
    sb.from('roast_curves').select(cols).eq('bean_id', beanId).is('roast_log_id', null),
  ])
  const curves = [...((byLog.data as unknown as CurveWithLog[]) ?? []), ...((byBean.data as unknown as CurveWithLog[]) ?? [])]
  const ids = curves.map((c) => c.roast_log_id).filter((x): x is string => !!x)
  const { data: cups } = ids.length
    ? await sb.from('roast_cuppings').select('roast_log_id, overall').in('roast_log_id', ids)
    : { data: [] }
  const cupBy = new Map<string, number>()
  for (const c of (cups as { roast_log_id: string; overall: number | null }[]) ?? []) {
    if (c.overall != null) cupBy.set(c.roast_log_id, Math.max(cupBy.get(c.roast_log_id) ?? 0, c.overall))
  }

  const list: Candidate[] = []
  let rejected = 0
  for (const c of curves) {
    const d = digestCurve(c)
    if (recordingProblem(c, d)) { rejected++; continue }
    const log = c.roast_logs
    const kg = Number(log?.green_kg ?? c.batch_kg ?? 0)
    if (!kg) { rejected++; continue }
    const wl = log?.roasted_kg && log.green_kg ? Math.round((1 - log.roasted_kg / log.green_kg) * 1000) / 10 : (c.weight_loss_pct != null ? Number(c.weight_loss_pct) : null)
    const logged = log?.roast_level && LEVELS.includes(log.roast_level as RoastLevel) ? (log.roast_level as RoastLevel) : null
    const level = logged ?? inferLevel(wl, d.drop_c)
    if (!level) { rejected++; continue }
    const name = c.notes?.split(' — ')[0] ?? null
    const cup = c.roast_log_id ? cupBy.get(c.roast_log_id) ?? null : null
    const sc = score(d, level, wl, name, c.roasted_at, cup)
    const steps = extractSteps(c.samples ?? [], d.drop_s)
    const drums = (c.samples ?? []).map((s) => s.drum).filter((x): x is number => x != null)
    list.push({
      curve_id: c.id,
      roasted_at: c.roasted_at,
      bean_id: beanId,
      batch_kg: batchBucket(kg),
      roast_level: level,
      level_inferred: !logged,
      probat_name: name,
      weight_loss_pct: wl,
      cup,
      digest: d,
      score: sc.score,
      reasons: sc.reasons,
      charge_temp_c: c.metrics?.charge_temp_c ?? null,
      // 投入時のドラム（途中で変えることはほぼ無い）
      drum_pct: steps[0]?.drum ?? (drums.length ? Math.round(drums.reduce((a, b) => a + b, 0) / drums.length) : null),
      steps,
      targets: targetsFrom(d, level, wl),
    })
  }
  list.sort((a, b) => b.score - a.score)
  return { list, rejected }
}

/** 操作表から「ここだけ見ればいい」1行を作る */
export function watchLine(steps: RecipeStep[], t: RecipeTargets): string {
  const parts: string[] = []
  const fc = t.fc_s
  if (fc != null) {
    // 1ハゼの30秒〜2分半前に入れた、いちばん大きいガス下げ（ハゼ直前のガス操作はクラッシュの元なので、その前に済ませる）
    let prevGas: number | null = null
    let cut: { s: RecipeStep; drop: number } | null = null
    for (const s of steps) {
      if (s.gas == null) continue
      if (prevGas != null && s.t >= fc - 150 && s.t <= fc - 30 && prevGas - s.gas > (cut?.drop ?? 0)) cut = { s, drop: prevGas - s.gas }
      prevGas = s.gas
    }
    if (cut) parts.push(`${fmtSec(cut.s.t)}（${cut.s.bt ?? '—'}°C頃）にガス${cut.s.gas}%へ下げておく`)
    // 1ハゼ時点で効いているガス・ファン
    const at = (k: 'gas' | 'fan') => [...steps].reverse().find((s) => s.t <= fc && s[k] != null)?.[k] ?? null
    parts.push(`1ハゼ ${fmtSec(fc)}・${t.fc_c ?? '—'}°C（ガス${at('gas') ?? '—'}%・ファン${at('fan') ?? '—'}）`)
  }
  if (t.drop_c != null) parts.push(`${t.drop_c}°C・${fmtSec(t.drop_s)} でドロップ（発達 ${fmtSec(t.dev_s)}）`)
  return parts.join(' → ')
}

/** 候補をレシピ行（insert 用）にする */
export function recipeRowFrom(c: Candidate, status: 'suggested' | 'confirmed') {
  const date = new Date(new Date(c.roasted_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10)
  return {
    bean_id: c.bean_id,
    batch_kg: c.batch_kg,
    roast_level: c.roast_level,
    status,
    source: 'best_roast' as const,
    source_curve_id: c.curve_id,
    charge_temp_c: c.charge_temp_c,
    drum_pct: c.drum_pct,
    steps: c.steps,
    targets: c.targets,
    watch: watchLine(c.steps, c.targets),
    why: `${date} の焙煎${c.probat_name ? `「${c.probat_name}」` : ''}が基準。${c.reasons.slice(0, 3).join('・')}${c.level_inferred ? '（レベルは重量減から推定）' : ''}`,
    score: c.score,
    updated_at: new Date().toISOString(),
  }
}
