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

/**
 * Promise を失敗時に数回まで再試行する。主にログイン前画面のサーバーアクション
 * （listActiveStaff / getScheduleMonth 等）用。コールド起動時、DbPassGate の
 * syncDbPass と同時にサーバーアクションが飛ぶと片方が net::ERR_ABORTED で中断され、
 * catch も再試行も無いと一覧が空のまま固まっていた。一過性の失敗から自動回復させる。
 * 成功時に空配列が返るのは正当な結果なので再試行しない（reject のみ再試行）。
 */
export async function retryOnReject<T>(fn: () => Promise<T>, attempts = 3, delayMs = 300): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw lastErr
}

/** Returns the first day of the next month as "YYYY-MM-DD", for use in exclusive upper-bound queries */
export function nextMonthFirstDay(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`
}
