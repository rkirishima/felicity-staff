// EC サイトの Stripe Webhook は全決済を orders に記録する（イベント予約も「不明」で入る）。
// イベント予約の行に名前・内容を補完し、status を completed にして発送リストから外す
// （売上集計は paid/shipped/completed を数えるので経理には残る）。返金時は cancelled。
import { createAdminClient } from '@/lib/supabase/admin'
import { PERSIAN_DINNER as EV } from './persian-dinner'
import type { Booking } from './bookings'

export function eventOrderItems(b: Booking) {
  return [{
    id: `event-${b.event_slug}`,
    name: `『${EV.title}』${EV.date.slice(5).replace('-', '/')} ${EV.start_time} 予約`,
    qty: b.qty,
    price: b.unit_price_jpy,
  }]
}

export async function syncEventOrder(b: Booking): Promise<void> {
  if (!b.stripe_payment_intent) return
  const sb = createAdminClient()
  if (b.status === 'paid') {
    await sb.from('orders').update({
      customer_name: b.name,
      customer_email: b.email ?? '',
      items: eventOrderItems(b),
      payment_method: 'stripe',
      shipping_address: '店舗イベント（発送なし）',
      status: 'completed',
    }).eq('id', b.stripe_payment_intent).in('status', ['paid', 'completed'])
  } else if (b.status === 'refunded' || b.status === 'cancelled') {
    await sb.from('orders').update({ status: 'cancelled' }).eq('id', b.stripe_payment_intent)
  }
}
