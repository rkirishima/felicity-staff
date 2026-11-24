import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBooking } from '@/lib/events/bookings'
import { refundPaymentIntent } from '@/lib/events/stripe'

// 予約を全額返金してキャンセル扱いにする（管理者のみ）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied
  const { id } = await params
  const b = await getBooking(id)
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (b.status !== 'paid' || !b.stripe_payment_intent) {
    return NextResponse.json({ error: '決済済みの予約のみ返金できます' }, { status: 400 })
  }
  try {
    await refundPaymentIntent(b.stripe_payment_intent)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '返金に失敗しました' }, { status: 502 })
  }
  const sb = createAdminClient()
  await sb.from('event_bookings').update({ status: 'refunded', cancelled_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true })
}
