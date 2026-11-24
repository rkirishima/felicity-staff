import { NextResponse } from 'next/server'
import { PERSIAN_DINNER as EV, cancelDeadline, salesOpen } from '@/lib/events/persian-dinner'
import { createAdminClient } from '@/lib/supabase/admin'
import { reconcile } from '@/lib/events/bookings'
import { createSession, stripeKey } from '@/lib/events/stripe'

// 予約: 定員チェック付きで席を仮押さえ → Stripe Checkout（本番決済）へ。
// 仮押さえは 30 分。Stripe セッションも同時刻に失効させる。
export async function POST(req: Request): Promise<Response> {
  let body: { qty?: unknown; name?: unknown; email?: unknown }
  try { body = await req.json() } catch { body = {} }
  const qty = parseInt(String(body.qty ?? ''), 10)
  if (!Number.isInteger(qty) || qty < 1 || qty > EV.max_per_order) {
    return NextResponse.json({ error: '人数が不正です' }, { status: 400 })
  }
  const name = String(body.name ?? '').trim().slice(0, 100)
  const email = String(body.email ?? '').trim().slice(0, 200)
  if (!name) return NextResponse.json({ error: 'お名前を入力してください' }, { status: 400 })
  if (!salesOpen()) return NextResponse.json({ error: '受付は終了しました / Booking closed' }, { status: 400 })
  if (!stripeKey()) return NextResponse.json({ error: '現在お支払いを受け付けできません。お店にお問い合わせください。' }, { status: 503 })

  await reconcile(EV.slug)

  // Stripe の expires_at は作成から 30 分以上が必要なので少し余裕を持たせる
  const expiresSec = Math.floor(Date.now() / 1000) + 31 * 60
  const sb = createAdminClient()
  const { data: bookingId, error } = await sb.rpc('reserve_event_seats', {
    p_slug: EV.slug, p_capacity: EV.capacity, p_name: name, p_email: email,
    p_qty: qty, p_unit_price: EV.price_jpy, p_expires_at: new Date(expiresSec * 1000).toISOString(),
  })
  if (error) return NextResponse.json({ error: '予約処理に失敗しました' }, { status: 500 })
  if (!bookingId) return NextResponse.json({ error: '残席が足りません / Not enough seats left' }, { status: 409 })

  const origin = new URL(req.url).origin
  const p = new URLSearchParams()
  p.set('mode', 'payment')
  p.set('expires_at', String(expiresSec))
  p.set('client_reference_id', String(bookingId))
  p.set('success_url', `${origin}/events/${EV.slug}/success?b=${bookingId}`)
  p.set('cancel_url', `${origin}/events/${EV.slug}?cancelled=1`)
  p.set('line_items[0][quantity]', String(qty))
  p.set('line_items[0][price_data][currency]', 'jpy')
  p.set('line_items[0][price_data][unit_amount]', String(EV.price_jpy))
  p.set('line_items[0][price_data][product_data][name]', `『${EV.title}』 ${EV.date.replaceAll('-', '/')} ${EV.start_time}`)
  p.set('metadata[event]', EV.slug)
  p.set('metadata[booking_id]', String(bookingId))
  p.set('metadata[name]', name)
  p.set('payment_intent_data[metadata][event]', EV.slug)
  p.set('payment_intent_data[metadata][booking_id]', String(bookingId))
  p.set('custom_text[submit][message]', `${cancelDeadline().replaceAll('-', '/')} 23:59 までのキャンセルは全額返金。以降は返金不可。ドリンクは当日別会計。`)
  if (email) p.set('customer_email', email)

  try {
    const s = await createSession(p)
    await sb.from('event_bookings').update({ stripe_session_id: s.id }).eq('id', bookingId)
    return NextResponse.json({ url: s.url })
  } catch (e) {
    await sb.from('event_bookings').update({ status: 'expired' }).eq('id', bookingId)
    console.error('stripe session failed', e)
    return NextResponse.json({ error: '決済の開始に失敗しました' }, { status: 502 })
  }
}
