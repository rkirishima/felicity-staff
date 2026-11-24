import { NextResponse } from 'next/server'
import { getPaymentIntent, stripeKey } from '@/lib/events/stripe'
import { getBooking, listBookings } from '@/lib/events/bookings'
import { syncEventOrder } from '@/lib/events/orders'
import { PERSIAN_DINNER as EV } from '@/lib/events/persian-dinner'

export const runtime = 'nodejs'

type OrderRow = {
  id: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  shipping_address: string | null
  items: { name: string; qty: number }[] | null
  amount: number
  status: string
  payment_method: string | null
  created_at: string
}

type SupabaseWebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: OrderRow
  old_record: OrderRow | null
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-webhook-secret')
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_ORDERS_CHAT_ID) {
    return NextResponse.json({ error: 'TELEGRAM env not configured' }, { status: 500 })
  }

  let payload: SupabaseWebhookPayload
  try {
    payload = (await req.json()) as SupabaseWebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (payload.type !== 'INSERT' || payload.table !== 'orders') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const o = payload.record

  // イベント予約の決済なら、予約内容で通知（EC 注文としては扱わない）
  let text: string | null = null
  if (o.id?.startsWith('pi_') && stripeKey()) {
    try {
      const pi = await getPaymentIntent(o.id)
      const bookingId = pi.metadata?.booking_id
      const b = bookingId ? await getBooking(bookingId) : null
      if (b) {
        await syncEventOrder({ ...b, status: 'paid', stripe_payment_intent: o.id })
        const taken = (await listBookings(b.event_slug))
          .filter(r => r.status === 'paid' || r.id === b.id)
          .reduce((s, r) => s + r.qty, 0)
        text = [
          '🎟 *イベント予約*',
          '',
          `『${EV.title}』${EV.date.slice(5).replace('-', '/')} ${EV.start_time}`,
          `お客様: ${b.name}（${b.qty}名）`,
          b.email ? `📧 ${b.email}` : '',
          `💰 ¥${b.amount_jpy.toLocaleString()}`,
          '',
          `予約 ${taken} / ${EV.capacity} 名`,
        ].filter(Boolean).join('\n')
      }
    } catch (e) {
      console.error('event lookup failed', e)
    }
  }

  if (!text) {
  const items = Array.isArray(o.items)
    ? o.items.map(i => `・${i.name} × ${i.qty}`).join('\n')
    : ''

  text = [
    '🛒 *新規 EC 注文*',
    '',
    `注文ID: \`${o.id}\``,
    `お客様: ${o.customer_name || '-'}`,
    o.customer_email ? `📧 ${o.customer_email}` : '',
    o.customer_phone ? `📱 ${o.customer_phone}` : '',
    o.payment_method ? `💳 ${o.payment_method}` : '',
    '',
    '*商品:*',
    items || '-',
    '',
    `💰 合計: ¥${(o.amount ?? 0).toLocaleString()}`,
    o.shipping_address ? `\n📍 ${o.shipping_address}` : '',
  ].filter(Boolean).join('\n')
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_ORDERS_CHAT_ID,
      text,
      parse_mode: 'Markdown',
    }),
  })

  if (!tgRes.ok) {
    const errText = await tgRes.text()
    console.error('Telegram send failed:', errText)
    return NextResponse.json({ error: 'telegram failed', detail: errText }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
