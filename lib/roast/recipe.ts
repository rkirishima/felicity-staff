// 焙煎レシピ（roast_recipes）の型と表示用ヘルパー。クライアント/サーバー共用。
// レシピ = 豆 × バッチ × ローストレベルごとに1つ。実際のベスト焙煎（Probat カーブ）から
// 作るか、データの無い豆は AI が試作する。旧 roast_profiles（推定値の長文）は使わない。
import type { RoastLevel } from '@/lib/roast-profiles'
import { fmtSec, type RecommendedProfile } from './profile'

export type RecipeStatus = 'suggested' | 'confirmed' | 'ai_draft' | 'archived'

/** 操作の1行。t=投入からの秒、bt=その時の豆温度（目安） */
export type RecipeStep = { t: number; bt: number | null; gas: number | null; fan: number | null; drum?: number | null; note?: string | null }

export type RecipeTargets = {
  tp_s?: number | null
  tp_c?: number | null
  yellow_s?: number | null // BT 150°C 到達
  fc_s?: number | null
  fc_c?: number | null
  drop_s?: number | null
  drop_c?: number | null
  dev_s?: number | null
  dtr_pct?: number | null
  wl_lo?: number | null
  wl_hi?: number | null
}

export type Recipe = {
  id: string
  bean_id: string
  batch_kg: number
  roast_level: RoastLevel
  status: RecipeStatus
  source: 'best_roast' | 'ai' | 'manual'
  source_curve_id: string | null
  charge_temp_c: number | null
  drum_pct: number | null
  steps: RecipeStep[]
  targets: RecipeTargets
  watch: string | null
  why: string | null
  score: number | null
  confirmed_by: string | null
  confirmed_at: string | null
  updated_at: string
}

export const LEVELS: RoastLevel[] = ['light', 'city', 'medium', 'dark']
export const BATCHES = [1, 1.5, 2, 2.5, 3, 3.6]

/** 記録・カーブの kg をレシピのバッチ区分に寄せる（3.5〜3.6 は 3.6） */
export function batchBucket(kg: number): number {
  if (kg >= 3.3) return 3.6
  return Math.round(kg * 2) / 2
}

export const STATUS_LABEL: Record<RecipeStatus, { label: string; cls: string }> = {
  confirmed: { label: '確定', cls: 'bg-emerald-900/60 text-emerald-200' },
  suggested: { label: '提案（未確認）', cls: 'bg-sky-900/60 text-sky-200' },
  ai_draft: { label: 'AI試作', cls: 'bg-violet-900/60 text-violet-200' },
  archived: { label: '過去', cls: 'bg-stone-800 text-stone-400' },
}

/** 同じ豆の中から、指定バッチ・レベルに一番合うレシピを選ぶ。完全一致でなければ exact=false */
export function pickRecipe(rows: Recipe[], kg: number, level: RoastLevel | ''): { recipe: Recipe; exact: boolean } | null {
  const live = rows.filter((r) => r.status !== 'archived')
  if (!live.length) return null
  const rank = (s: RecipeStatus) => (s === 'confirmed' ? 0 : s === 'suggested' ? 1 : 2)
  const b = batchBucket(kg)
  const lv = (x: string) => LEVELS.indexOf(x as RoastLevel)
  const sorted = [...live].sort((x, y) =>
    Number(Number(x.batch_kg) !== b) - Number(Number(y.batch_kg) !== b)
    || (level ? Math.abs(lv(x.roast_level) - lv(level)) - Math.abs(lv(y.roast_level) - lv(level)) : 0)
    || Math.abs(Number(x.batch_kg) - b) - Math.abs(Number(y.batch_kg) - b)
    || rank(x.status) - rank(y.status))
  const recipe = sorted[0]
  return { recipe, exact: Number(recipe.batch_kg) === b && (!level || recipe.roast_level === level) }
}

/** 重量減の目標から、焙煎後の重さの目安（kg） */
export function roastedKgRange(greenKg: number, t: RecipeTargets): { lo: number; hi: number } | null {
  if (t.wl_lo == null || t.wl_hi == null || !greenKg) return null
  return { lo: greenKg * (1 - t.wl_hi / 100), hi: greenKg * (1 - t.wl_lo / 100) }
}

/**
 * AIレビュー・今日のポイント・振り返り画面は旧プロファイル形式（文字列の時間幅など）で目標を読むので、
 * レシピをその形に写す。時間の幅は ±20秒、DTR は ±2%。
 */
export function recipeAsProfile(r: Recipe, beanName = r.bean_id): RecommendedProfile {
  const t = r.targets ?? {}
  const win = (s: number | null | undefined, w = 20) => (s == null ? null : `${fmtSec(s - w)}-${fmtSec(s + w)}`)
  const conf = r.status === 'confirmed' ? 'measured' : r.status === 'suggested' ? 'thin' : 'trial'
  const steps = (r.steps ?? []).map((s) => `${s.t === 0 ? '投入' : fmtSec(s.t)}${s.bt != null ? `(${s.bt}°C)` : ''}${s.gas != null ? ` ガス${s.gas}` : ''}${s.fan != null ? ` ファン${s.fan}` : ''}`).join(' → ')
  return {
    id: r.id,
    bean_id: r.bean_id,
    bean_name: beanName,
    batch_kg: Number(r.batch_kg),
    roast_level: r.roast_level,
    use_case: null,
    charge_temp_c: r.charge_temp_c,
    drum_pct: r.drum_pct,
    gas_charge_pct: r.steps?.[0]?.gas ?? null,
    gas_dry_end_pct: null,
    gas_fc_pct: null,
    gas_drop_pct: null,
    fan_charge_pct: r.steps?.[0]?.fan ?? null,
    fan_fc_pct: null,
    fan_drop_pct: null,
    dry_end: win(t.yellow_s),
    dry_end_temp_c: 150,
    fc_target: win(t.fc_s),
    fc_temp_c: t.fc_c ?? null,
    drop_target: win(t.drop_s),
    drop_temp_c: t.drop_c ?? null,
    dtr_pct: t.dtr_pct != null ? `${Math.round(t.dtr_pct - 2)}-${Math.round(t.dtr_pct + 2)}` : null,
    weight_loss_pct: t.wl_lo != null ? `${t.wl_lo}-${t.wl_hi}` : null,
    ror_drop_min: null,
    gas_plan: steps || null,
    watchouts: r.watch,
    evidence: r.why,
    source: r.source === 'ai' ? 'ai-draft' : 'felicity-best-roast',
    confidence: conf,
    confidence_rank: conf === 'measured' ? 1 : conf === 'thin' ? 2 : 3,
  }
}

/** 手入力されたレシピを、保存できる形に整える（範囲外の数値は捨てる）。サーバー・画面共用 */
export function sanitizeRecipeInput(input: {
  charge_temp_c?: unknown; drum_pct?: unknown; steps?: unknown; targets?: unknown; watch?: unknown
}): Pick<Recipe, 'charge_temp_c' | 'drum_pct' | 'steps' | 'targets' | 'watch'> {
  const num = (v: unknown, lo: number, hi: number): number | null => {
    if (v === '' || v == null) return null
    const n = Number(v)
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null
  }
  const steps: RecipeStep[] = (Array.isArray(input.steps) ? input.steps : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      t: num(x.t, 0, 1500) ?? -1,
      bt: num(x.bt, 0, 260),
      gas: num(x.gas, 0, 100),
      fan: num(x.fan, 0, 100),
      drum: num(x.drum, 0, 100),
      note: typeof x.note === 'string' && x.note.trim() ? x.note.trim().slice(0, 40) : null,
    }))
    .filter((x) => x.t >= 0 && (x.gas != null || x.fan != null || x.drum != null || x.note))
    .sort((a, b) => a.t - b.t)
    .slice(0, 20)
  const t = (input.targets ?? {}) as Record<string, unknown>
  const targets: RecipeTargets = {
    tp_s: num(t.tp_s, 0, 300), tp_c: num(t.tp_c, 40, 160),
    yellow_s: num(t.yellow_s, 60, 600),
    fc_s: num(t.fc_s, 240, 1200), fc_c: num(t.fc_c, 170, 230),
    drop_s: num(t.drop_s, 300, 1500), drop_c: num(t.drop_c, 180, 250),
    wl_lo: num(t.wl_lo, 5, 25), wl_hi: num(t.wl_hi, 5, 25),
  }
  if (targets.fc_s != null && targets.drop_s != null && targets.drop_s > targets.fc_s) {
    targets.dev_s = targets.drop_s - targets.fc_s
    targets.dtr_pct = Math.round((targets.dev_s / targets.drop_s) * 1000) / 10
  } else {
    targets.dev_s = null
    targets.dtr_pct = null
  }
  return {
    charge_temp_c: num(input.charge_temp_c, 100, 260),
    drum_pct: num(input.drum_pct, 0, 100),
    steps,
    targets,
    watch: typeof input.watch === 'string' && input.watch.trim() ? input.watch.trim().slice(0, 200) : null,
  }
}
