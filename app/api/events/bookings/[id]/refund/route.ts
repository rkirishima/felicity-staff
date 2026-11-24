import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { getBooking, refundBooking } from '@/lib/events/bookings'

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
    await refundBooking(b, 'admin')
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '返金に失敗しました' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
