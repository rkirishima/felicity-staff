// 焙煎ログ1件（または豆1種類）について、AI とUIが必要とする情報をまとめて集める。サーバー専用。
import type { SupabaseClient } from '@supabase/supabase-js'
import { digestCurve, digestFromEvents, type CurveDigest, type CurveRow } from './curve'
import type { RecommendedProfile } from './profile'
import { LEVELS, pickRecipe, recipeAsProfile, type Recipe } from './recipe'
import type { RoastLevel } from '@/lib/roast-profiles'

export type RoastLogRow = {
  id: string
  roasted_at: string
  bean_id: string
  bean_raw: string | null
  green_kg: number
  roasted_kg: number | null
  machine: string | null
  roast_level: string | null
  use_case: string | null
  profile_id: string | null
  notes: string | null
  source: string
  events: { dry_end_s?: number | null; fc_s?: number | null; drop_s?: number | null } | null
  roast_beans?: { display_name: string } | null
}

export type CuppingRow = {
  id: string
  roast_log_id: string
  cupped_at: string
  overall: number | null
  sweetness: number | null
  acidity: number | null
  body: number | null
  defects: string[] | null
  notes: string | null
}

export type ReviewJson = {
  headline: string
  verdict: 'good' | 'ok' | 'fix'
  summary: string
  what_happened: string[]
  cup_link?: string | null
  next_time: { change: string; why: string }
  keep?: string[]
}

export type HistoryItem = {
  id: string
  roasted_at: string
  green_kg: number
  roasted_kg: number | null
  weight_loss_pct: number | null
  digest: Partial<CurveDigest> | null
  cup: Pick<CuppingRow, 'overall' | 'sweetness' | 'acidity' | 'body' | 'defects' | 'notes'> | null
  review_headline: string | null
  next_time: string | null
}

const LOG_COLS = 'id, roasted_at, bean_id, bean_raw, green_kg, roasted_kg, machine, roast_level, use_case, profile_id, notes, source, events, roast_beans(display_name)'
const CURVE_COLS = 'id, roast_log_id, samples, events, metrics, total_time_s, fc_start_s'

export function weightLoss(green: number, roasted: number | null): number | null {
  if (!roasted || !green) return null
  return Math.round((1 - Number(roasted) / Number(green)) * 1000) / 10
}

export async function loadCurveForLog(sb: SupabaseClient, logId: string): Promise<CurveRow | null> {
  const { data } = await sb.from('roast_curves').select(CURVE_COLS).eq('roast_log_id', logId).maybeSingle()
  return (data as CurveRow | null) ?? null
}

/** 豆・バッチ・レベルに合うレシピ（roast_recipes）を、旧プロファイル形式で返す */
export async function loadRecipeProfile(sb: SupabaseClient, beanId: string, greenKg: number, level: string | null): Promise<RecommendedProfile | null> {
  const { data } = await sb.from('roast_recipes').select('*, roast_beans(display_name)').eq('bean_id', beanId).neq('status', 'archived')
  const rows = (data as (Recipe & { roast_beans: { display_name: string } | null })[]) ?? []
  const picked = pickRecipe(rows, greenKg, LEVELS.includes(level as RoastLevel) ? (level as RoastLevel) : '')
  if (!picked) return null
  const r = picked.recipe as Recipe & { roast_beans: { display_name: string } | null }
  return recipeAsProfile(r, r.roast_beans?.display_name)
}

export async function loadProfileFor(sb: SupabaseClient, log: RoastLogRow): Promise<RecommendedProfile | null> {
  if (log.profile_id) {
    const { data } = await sb.from('roast_recipes').select('*, roast_beans(display_name)').eq('id', log.profile_id).maybeSingle()
    if (data) {
      const r = data as Recipe & { roast_beans: { display_name: string } | null }
      return recipeAsProfile(r, r.roast_beans?.display_name)
    }
  }
  return loadRecipeProfile(sb, log.bean_id, Number(log.green_kg), log.roast_level)
}

/** 同じ豆・近いバッチの直近ローストを、要約つきで返す（古い→新しい順ではなく新しい順） */
export async function loadBeanHistory(
  sb: SupabaseClient,
  beanId: string,
  greenKg: number,
  opts: { excludeId?: string; limit?: number } = {},
): Promise<HistoryItem[]> {
  const { data: logs } = await sb
    .from('roast_logs')
    .select('id, roasted_at, green_kg, roasted_kg, events')
    .eq('bean_id', beanId)
    .gte('green_kg', greenKg - 0.6)
    .lte('green_kg', greenKg + 0.6)
    .order('roasted_at', { ascending: false })
    .limit((opts.limit ?? 6) + 1)
  const rows = ((logs as { id: string; roasted_at: string; green_kg: number; roasted_kg: number | null; events: RoastLogRow['events'] }[]) ?? [])
    .filter((l) => l.id !== opts.excludeId)
    .slice(0, opts.limit ?? 6)
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [{ data: curves }, { data: cups }, { data: reviews }] = await Promise.all([
    sb.from('roast_curves').select(CURVE_COLS).in('roast_log_id', ids),
    sb.from('roast_cuppings').select('roast_log_id, overall, sweetness, acidity, body, defects, notes, cupped_at').in('roast_log_id', ids).order('cupped_at', { ascending: false }),
    sb.from('roast_reviews').select('roast_log_id, review').in('roast_log_id', ids),
  ])
  const curveBy = new Map(((curves as (CurveRow & { roast_log_id: string })[]) ?? []).map((c) => [c.roast_log_id, c]))
  const cupBy = new Map<string, CuppingRow>()
  for (const c of (cups as CuppingRow[]) ?? []) if (!cupBy.has(c.roast_log_id)) cupBy.set(c.roast_log_id, c)
  const revBy = new Map(((reviews as { roast_log_id: string; review: ReviewJson }[]) ?? []).map((r) => [r.roast_log_id, r.review]))

  return rows.map((l) => {
    const c = curveBy.get(l.id)
    const d = c ? digestCurve(c) : l.events ? digestFromEvents(l.events) : null
    const cup = cupBy.get(l.id) ?? null
    const rev = revBy.get(l.id)
    return {
      id: l.id,
      roasted_at: l.roasted_at,
      green_kg: Number(l.green_kg),
      roasted_kg: l.roasted_kg,
      weight_loss_pct: weightLoss(l.green_kg, l.roasted_kg),
      digest: d ? { tp_c: d.tp_c, dry_end_s: d.dry_end_s, t175_s: d.t175_s, fc_s: d.fc_s, fc_c: d.fc_c, drop_s: d.drop_s, drop_c: d.drop_c, dev_s: d.dev_s, dtr_pct: d.dtr_pct, ror_at_drop: d.ror_at_drop, flags: d.flags } : null,
      cup: cup ? { overall: cup.overall, sweetness: cup.sweetness, acidity: cup.acidity, body: cup.body, defects: cup.defects, notes: cup.notes } : null,
      review_headline: rev?.headline ?? null,
      next_time: rev?.next_time?.change ?? null,
    }
  })
}

export type RoastContext = {
  log: RoastLogRow
  bean_name: string
  curve: CurveRow | null
  digest: Partial<CurveDigest> | null
  profile: RecommendedProfile | null
  cuppings: CuppingRow[]
  history: HistoryItem[]
  weight_loss_pct: number | null
}

export async function loadRoastContext(sb: SupabaseClient, logId: string): Promise<RoastContext | null> {
  const { data } = await sb.from('roast_logs').select(LOG_COLS).eq('id', logId).maybeSingle()
  if (!data) return null
  const log = data as unknown as RoastLogRow
  const [curve, profile, { data: cups }, history] = await Promise.all([
    loadCurveForLog(sb, logId),
    loadProfileFor(sb, log),
    sb.from('roast_cuppings').select('*').eq('roast_log_id', logId).order('cupped_at', { ascending: false }),
    loadBeanHistory(sb, log.bean_id, Number(log.green_kg), { excludeId: logId, limit: 5 }),
  ])
  const digest = curve && (curve.samples?.length ?? 0) > 30
    ? digestCurve(curve, { rorDropMax: profile?.ror_drop_min ?? null })
    : log.events ? digestFromEvents(log.events) : null
  return {
    log,
    bean_name: log.roast_beans?.display_name ?? log.bean_raw ?? log.bean_id,
    curve,
    digest,
    profile,
    cuppings: (cups as CuppingRow[]) ?? [],
    history,
    weight_loss_pct: weightLoss(log.green_kg, log.roasted_kg),
  }
}
