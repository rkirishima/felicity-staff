import { NextResponse } from 'next/server'

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

  const payload = (await req.json()) as SupabaseWebhookPayload
  if (payload.type !== 'INSERT' || payload.table !== 'orders') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const o = payload.record
  const items = Array.isArray(o.items)
    ? o.items.map(i => `・${i.name} × ${i.qty}`).join('\n')
    : ''

  const text = [
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
    `💰 合計: ¥${o.amount.toLocaleString()}`,
    o.shipping_address ? `\n📍 ${o.shipping_address}` : '',
  ].filter(Boolean).join('\n')

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
