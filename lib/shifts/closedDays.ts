// 定休日（レギュラー休業日）判定。
//   2026年10月から、毎週金曜日を定休日にする。
//   → シフト表ではグレー表示で目立たなくし、募集枠(@1)も生成しない。
//
// 判定は 'YYYY-MM-DD'（ローカル日付）文字列ベース。UTCずれを避けるため
// 呼び出し側でローカル日付文字列を渡すこと（Date.toISOString は使わない）。

/** この日付（含む）以降、金曜を定休日にする。 */
export const REGULAR_CLOSED_FROM = '2026-10-01'

/** 定休日の曜日（0=日 … 5=金 … 6=土）。 */
const REGULAR_CLOSED_DOW = 5 // 金曜

/** dateStr = 'YYYY-MM-DD'。定休日なら true。 */
export function isRegularClosedDay(dateStr: string | null | undefined): boolean {
  if (!dateStr || dateStr < REGULAR_CLOSED_FROM) return false
  const d = new Date(dateStr + 'T12:00:00')
  return d.getDay() === REGULAR_CLOSED_DOW
}
