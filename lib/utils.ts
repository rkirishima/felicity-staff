import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 短い触覚フィードバック（対応端末のみ）。タップ確定の手応えに使う。 */
export function haptic(ms = 10) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(ms) } catch {}
  }
}

/** Returns the first day of the next month as "YYYY-MM-DD", for use in exclusive upper-bound queries */
export function nextMonthFirstDay(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`
}
