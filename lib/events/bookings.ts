// イベント予約の DB 操作（service role、サーバー専用）。
import { createAdminClient } from '@/lib/supabase/admin'
import { expireSession, getSession, refundPaymentIntent, type StripeSession } from './stripe'
import { notifyCancellation, notifyNewBooking } from './notify'
import { syncEventOrder } from './orders'

export type Booking = {
  id: string
  event_slug: string
  name: string
  email: string | null
  qty: number
  unit_price_jpy: number
  amount_jpy: number
  status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded'
  stripe_session_id: string | null
  stripe_payment_intent: string | null
  expires_at: string
  paid_at: string | null
  cancelled_at: string | null
  created_at: string
}

export async function listBookings(slug: string): Promise<Booking[]> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('event_bookings').select('*').eq('event_slug', slug).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as Booking[]
}

export async function getBooking(id: string): Promise<Booking | null> {
  const sb = createAdminClient()
  const { data } = await sb.from('event_bookings').select('*').eq('id', id).maybeSingle()
  return (data as Booking | null) ?? null
}

/** 確定済み + 仮押さえ中の人数 */
export async function seatsTaken(slug: string): Promise<number> {
  const rows = await listBookings(slug)
  const now = Date.now()
  return rows
    .filter(r => r.status === 'paid' || (r.status === 'pending' && new Date(r.expires_at).getTime() > now))
    .reduce((s, r) => s + r.qty, 0)
}

/** 決済完了を記録。初めて paid になったときだけ通知メールを送る。 */
export async function markPaid(booking: Booking, session: StripeSession): Promise<Booking> {
  if (booking.status === 'paid') return booking
  const sb = createAdminClient()
  const { data } = await sb
    .from('event_bookings')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent: session.payment_intent,
      email: session.customer_details?.email || booking.email,
    })
    .eq('id', booking.id)
    .in('status', ['pending', 'expired'])
    .select('*')
  const updated = (data?.[0] as Booking | undefined) ?? null
  if (!updated) return (await getBooking(booking.id)) ?? booking
  try { await syncEventOrder(updated) } catch (e) { console.error('event order sync failed', e) }
  try {
    await notifyNewBooking(updated)
  } catch (e) {
    console.error('event booking notify failed', e)
  }
  return updated
}

/** Stripe の状態を見て 1 件を確定 / 失効に更新 */
export async function syncBooking(booking: Booking): Promise<Booking> {
  if (booking.status !== 'pending' || !booking.stripe_session_id) return booking
  let s = await getSession(booking.stripe_session_id)
  if (s.payment_status === 'paid') return markPaid(booking, s)
  if (new Date(booking.expires_at).getTime() > Date.now()) return booking
  if (s.status === 'open') {
    try { s = await expireSession(s.id) } catch { s = await getSession(s.id) }
    if (s.payment_status === 'paid') return markPaid(booking, s)
  }
  const sb = createAdminClient()
  await sb.from('event_bookings').update({ status: 'expired' }).eq('id', booking.id).eq('status', 'pending')
  return { ...booking, status: 'expired' }
}

/** 期限切れの仮押さえを Stripe と突き合わせる（決済済みなら確定、未決済なら失効） */
export async function reconcile(slug: string): Promise<void> {
  const rows = await listBookings(slug)
  const now = Date.now()
  for (const r of rows) {
    if (r.status === 'pending' && new Date(r.expires_at).getTime() <= now) {
      try { await syncBooking(r) } catch (e) { console.error('reconcile failed', r.id, e) }
    }
  }
}

/** 全額返金してキャンセル扱いにし、主催者とお客様に通知する。 */
export async function refundBooking(b: Booking, by: 'guest' | 'admin'): Promise<Booking> {
  if (b.status !== 'paid' || !b.stripe_payment_intent) throw new Error('決済済みの予約のみ返金できます')
  await refundPaymentIntent(b.stripe_payment_intent)
  const sb = createAdminClient()
  const { data } = await sb
    .from('event_bookings')
    .update({ status: 'refunded', cancelled_at: new Date().toISOString() })
    .eq('id', b.id)
    .eq('status', 'paid')
    .select('*')
  const updated = (data?.[0] as Booking | undefined) ?? { ...b, status: 'refunded' as const }
  try { await syncEventOrder(updated) } catch (e) { console.error('event order sync failed', e) }
  try {
    await notifyCancellation(updated, by)
  } catch (e) {
    console.error('event cancel notify failed', e)
  }
  return updated
}
