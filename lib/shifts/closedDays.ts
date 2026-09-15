// 定休日（レギュラー休業日）判定と、一日単位の特別日（大掃除・イベント等）。
//   2026年10月から、毎週金曜日を定休日にする。
//   → シフト表ではグレー表示で目立たなくし、募集枠(@1)も生成しない。
//   ただし SPECIAL_DAYS に登録した日は定休日にせず、特別日として表示する。
//
// 判定は 'YYYY-MM-DD'（ローカル日付）文字列ベース。UTCずれを避けるため
// 呼び出し側でローカル日付文字列を渡すこと（Date.toISOString は使わない）。

/** この日付（含む）以降、金曜を定休日にする。 */
export const REGULAR_CLOSED_FROM = '2026-10-01'

/** 定休日の曜日（0=日 … 5=金 … 6=土）。 */
const REGULAR_CLOSED_DOW = 5 // 金曜

/** 一日単位の特別日（大掃除・イベント等）。定休日を上書きして営業日扱いにする。 */
export type SpecialDay = { label: string; start?: string }
export const SPECIAL_DAYS: Record<string, SpecialDay> = {
  '2026-10-02': { label: '大掃除', start: '9:00' },
}

/** dateStr = 'YYYY-MM-DD'。特別日ならその情報、なければ null。 */
export function specialDayOf(dateStr: string | null | undefined): SpecialDay | null {
  if (!dateStr) return null
  return SPECIAL_DAYS[dateStr] ?? null
}

/** dateStr = 'YYYY-MM-DD'。定休日なら true。特別日（大掃除等）は定休日にしない。 */
export function isRegularClosedDay(dateStr: string | null | undefined): boolean {
  if (!dateStr || dateStr < REGULAR_CLOSED_FROM) return false
  if (SPECIAL_DAYS[dateStr]) return false // 特別日は営業日扱い（定休日にしない）
  const d = new Date(dateStr + 'T12:00:00')
  return d.getDay() === REGULAR_CLOSED_DOW
}
