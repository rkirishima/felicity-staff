// お客様用キャンセルリンクの署名とキャンセル期限の判定（サーバー専用）。
import { createHmac, timingSafeEqual } from 'crypto'
import { PERSIAN_DINNER as EV, cancelDeadline } from './persian-dinner'

export const SITE_URL = 'https://staff.felicity.cafe'

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('SESSION_SECRET / SUPABASE_SERVICE_ROLE_KEY not set')
  return s
}

export function cancelToken(bookingId: string): string {
  return createHmac('sha256', secret()).update(`event-cancel:${bookingId}`).digest('hex').slice(0, 32)
}

export function verifyCancelToken(bookingId: string, token: string): boolean {
  const a = Buffer.from(cancelToken(bookingId))
  const b = Buffer.from(String(token))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function cancelUrl(bookingId: string): string {
  return `${SITE_URL}/events/${EV.slug}/cancel?b=${bookingId}&t=${cancelToken(bookingId)}`
}

/** キャンセル期限（開催3日前 23:59 JST）前か */
export function canCancelNow(): boolean {
  return Date.now() <= new Date(`${cancelDeadline()}T23:59:59+09:00`).getTime()
}
