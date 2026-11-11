import { NextResponse } from 'next/server'
import { PERSIAN_DINNER as EV, cancelDeadline } from '@/lib/events/persian-dinner'

// ペルシャディナー（テスト版）の Stripe Checkout セッション作成。
// STRIPE_TEST_SECRET_KEY（sk_test_...）のみ使用。live キーでは絶対に動かさない。
// キー未設定時はデモモード（Stripe を呼ばず成功ページへ）。
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

  const origin = new URL(req.url).origin
  const total = EV.price_jpy * qty
  const key = process.env.STRIPE_TEST_SECRET_KEY

  if (!key || !key.startsWith('sk_test_')) {
    const u = new URL(`/events/${EV.slug}/success`, origin)
    u.searchParams.set('demo', '1')
    u.searchParams.set('qty', String(qty))
    u.searchParams.set('total', String(total))
    return NextResponse.json({ url: u.toString(), demo: true })
  }

  const p = new URLSearchParams()
  p.set('mode', 'payment')
  p.set('success_url', `${origin}/events/${EV.slug}/success?session_id={CHECKOUT_SESSION_ID}&qty=${qty}&total=${total}`)
  p.set('cancel_url', `${origin}/events/${EV.slug}`)
  p.set('line_items[0][quantity]', String(qty))
  p.set('line_items[0][price_data][currency]', 'jpy')
  p.set('line_items[0][price_data][unit_amount]', String(EV.price_jpy))
  p.set('line_items[0][price_data][product_data][name]', `${EV.title} ${EV.date.replaceAll('-', '/')} ${EV.start_time}`)
  p.set('metadata[event]', EV.slug)
  p.set('metadata[name]', name)
  p.set('metadata[qty]', String(qty))
  p.set('metadata[cancel_deadline]', cancelDeadline())
  p.set('custom_text[submit][message]', `${cancelDeadline().replaceAll('-', '/')} 23:59 までのキャンセルは全額返金。以降は返金不可。ドリンクは当日別会計。`)
  if (email) p.set('customer_email', email)

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p,
  })
  const json = await res.json()
  if (!res.ok || !json.url) {
    return NextResponse.json({ error: json?.error?.message ?? 'Stripe エラー' }, { status: 502 })
  }
  return NextResponse.json({ url: json.url, demo: false })
}
