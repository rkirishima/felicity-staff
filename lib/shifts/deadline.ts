// シフト申請の「受付締切」ロジック。
// app_settings(key/value) に JSON で保存する。新規マイグレーション不要。
//   key='shift_deadlines'  → { "YYYY-MM": "YYYY-MM-DD" }   月ごとの締切日
//   key='shift_late_allow' → { "YYYY-MM": true }           店長が遅れ申請を一時開放した月

const DEADLINE_KEY = 'shift_deadlines'
const LATE_ALLOW_KEY = 'shift_late_allow'

export type ShiftDeadlineSettings = {
  deadlines: Record<string, string>
  lateAllow: Record<string, boolean>
}

export type DeadlineStatus = {
  deadline: string | null
  /** 締切までの残り日数。締切日当日=0、過ぎていれば負。締切未設定なら null */
  daysLeft: number | null
  /** 締切を過ぎ、かつ遅れ申請が許可されていない＝新規申請ロック */
  locked: boolean
  /** 店長が遅れ申請を一時開放しているか */
  lateAllowed: boolean
}

export function monthKeyOf(date: Date): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
}

/** 'YYYY-MM-DD' どうしの日数差（to - from） */
function daysBetween(fromStr: string, toStr: string): number {
  const a = Date.parse(fromStr + 'T00:00:00')
  const b = Date.parse(toStr + 'T00:00:00')
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

export async function loadShiftDeadlineSettings(sb: any): Promise<ShiftDeadlineSettings> {
  const out: ShiftDeadlineSettings = { deadlines: {}, lateAllow: {} }
  const { data } = await sb
    .from('app_settings')
    .select('key, value')
    .in('key', [DEADLINE_KEY, LATE_ALLOW_KEY])
  ;(data ?? []).forEach((row: any) => {
    try {
      const parsed = JSON.parse(row.value || '{}')
      if (row.key === DEADLINE_KEY && parsed) out.deadlines = parsed
      if (row.key === LATE_ALLOW_KEY && parsed) out.lateAllow = parsed
    } catch {
      /* 壊れた値は無視 */
    }
  })
  return out
}

async function upsertJson(sb: any, key: string, obj: unknown): Promise<{ error: any }> {
  return sb.from('app_settings').upsert(
    { key, value: JSON.stringify(obj), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

/** 対象月の締切日を設定（null で解除）。設定し直すと遅れ申請の開放はリセットする。 */
export async function saveShiftDeadline(
  sb: any,
  monthKey: string,
  deadline: string | null,
): Promise<{ error: any }> {
  const cur = await loadShiftDeadlineSettings(sb)
  const nextDeadlines = { ...cur.deadlines }
  const nextLate = { ...cur.lateAllow }
  if (deadline) nextDeadlines[monthKey] = deadline
  else delete nextDeadlines[monthKey]
  delete nextLate[monthKey] // 締切を変えたら遅れ申請の一時開放は無効化
  const r1 = await upsertJson(sb, DEADLINE_KEY, nextDeadlines)
  if (r1.error) return r1
  return upsertJson(sb, LATE_ALLOW_KEY, nextLate)
}

/** 締切後の「遅れ申請」を一時的に開放/締める。 */
export async function saveLateAllow(
  sb: any,
  monthKey: string,
  allow: boolean,
): Promise<{ error: any }> {
  const cur = await loadShiftDeadlineSettings(sb)
  const next = { ...cur.lateAllow }
  if (allow) next[monthKey] = true
  else delete next[monthKey]
  return upsertJson(sb, LATE_ALLOW_KEY, next)
}

/** todayStr = 'YYYY-MM-DD'（ローカル日付） */
export function deadlineStatusOf(
  monthKey: string,
  settings: ShiftDeadlineSettings,
  todayStr: string,
): DeadlineStatus {
  const deadline = settings.deadlines[monthKey] ?? null
  const lateAllowed = !!settings.lateAllow[monthKey]
  if (!deadline) return { deadline: null, daysLeft: null, locked: false, lateAllowed }
  const daysLeft = daysBetween(todayStr, deadline)
  const past = todayStr > deadline // 締切日「当日」までは申請可、翌日からロック
  return { deadline, daysLeft, locked: past && !lateAllowed, lateAllowed }
}
