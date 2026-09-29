// 推奨プロファイル（roast_profile_recommended ビュー）の型と選び方。
// RoastProfileCard と焙煎タイマーの両方で同じ行を使うため、選択ロジックをここに一本化する。

export type UseCase = 'drip' | 'espresso' | 'omni'

export type RecommendedProfile = {
  id: string
  bean_id: string
  bean_name: string
  batch_kg: number
  roast_level: string | null
  use_case: string | null
  charge_temp_c: number | null
  drum_pct: number | null
  gas_charge_pct: number | null
  gas_dry_end_pct: number | null
  gas_fc_pct: number | null
  gas_drop_pct: number | null
  fan_charge_pct: number | null
  fan_fc_pct: number | null
  fan_drop_pct: number | null
  dry_end: string | null
  dry_end_temp_c: number | null
  fc_target: string | null
  fc_temp_c: number | null
  drop_target: string | null
  drop_temp_c: number | null
  dtr_pct: string | null
  weight_loss_pct: string | null
  ror_drop_min: number | null
  gas_plan: string | null
  watchouts: string | null
  evidence: string | null
  source: string | null
  confidence: 'measured' | 'thin' | 'trial' | 'estimated'
  confidence_rank: number
}

/** ガス・ファンの具体的な数値を持っているか（旧推定行は全てNULL） */
export function hasNumbers(p: RecommendedProfile): boolean {
  return [
    p.gas_charge_pct, p.gas_dry_end_pct, p.gas_fc_pct, p.gas_drop_pct,
    p.fan_charge_pct, p.fan_fc_pct, p.fan_drop_pct,
  ].some((v) => v != null)
}

/** A/Bテストや動画ベースの試作プロファイル。日常の推奨には、他に候補が無い時だけ出す */
export function isTrial(p: Pick<RecommendedProfile, 'source'>): boolean {
  return !!p.source && (p.source.startsWith('ab-test') || p.source.startsWith('youtube-'))
}

/**
 * 並び順は「数値がある → バッチが近い → 信頼度が高い」。
 * 用途が一致するものがあればそれだけから選ぶ。バッチが違うと投入温度と
 * 1ハゼ時刻は必ずずれるので、バッチ一致を信頼度より優先する。
 */
export function pickProfile(
  rows: RecommendedProfile[],
  greenKg: number,
  useCase: UseCase,
): RecommendedProfile | null {
  const byUse = rows.filter((r) => r.use_case === useCase)
  const pool = byUse.length ? byUse : rows
  return [...pool].sort((a, b) =>
    Number(hasNumbers(b)) - Number(hasNumbers(a))
    || Number(isTrial(a)) - Number(isTrial(b))
    || Math.abs(Number(a.batch_kg) - greenKg) - Math.abs(Number(b.batch_kg) - greenKg)
    || a.confidence_rank - b.confidence_rank
  )[0] ?? null
}

/** "m:ss" → 秒 */
export function mmssToSec(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** "9:15-9:55" / "9:30" → {lo, hi}（秒）。解釈できなければ null */
export function parseWindow(s: string | null | undefined): { lo: number; hi: number } | null {
  if (!s) return null
  const parts = s.split(/[-〜~]/).map((x) => mmssToSec(x)).filter((x): x is number => x != null)
  if (parts.length === 0) return null
  return { lo: parts[0], hi: parts[parts.length - 1] }
}

/** 秒 → "m:ss" */
export function fmtSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "12-14" → {lo:12, hi:14} */
export function parseRange(s: string | null | undefined): { lo: number; hi: number } | null {
  if (!s) return null
  const nums = s.match(/\d+(\.\d+)?/g)?.map(Number) ?? []
  if (nums.length === 0) return null
  return { lo: nums[0], hi: nums[nums.length - 1] }
}

export type Checkpoint = {
  key: 'charge' | 'dry_end' | 'fc' | 'drop'
  label: string
  window: { lo: number; hi: number } | null
  tempC: number | null
  gas: number | null
  fan: number | null
}

/** プロファイルから焙煎中に見るチェックポイント列を作る */
export function checkpointsOf(p: RecommendedProfile): Checkpoint[] {
  return [
    { key: 'charge', label: '投入', window: { lo: 0, hi: 0 }, tempC: p.charge_temp_c, gas: p.gas_charge_pct, fan: p.fan_charge_pct },
    { key: 'dry_end', label: 'ドライエンド', window: parseWindow(p.dry_end), tempC: p.dry_end_temp_c, gas: p.gas_dry_end_pct, fan: null },
    { key: 'fc', label: '1ハゼ', window: parseWindow(p.fc_target), tempC: p.fc_temp_c, gas: p.gas_fc_pct, fan: p.fan_fc_pct },
    { key: 'drop', label: 'ドロップ', window: parseWindow(p.drop_target), tempC: p.drop_temp_c, gas: p.gas_drop_pct, fan: p.fan_drop_pct },
  ]
}

export const USE_CASE_LABEL: Record<UseCase, string> = {
  drip: 'ドリップ',
  espresso: 'エスプレッソ',
  omni: 'オムニ',
}
