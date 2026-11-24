import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { getBooking } from '@/lib/events/bookings'
import { notifyNewBooking } from '@/lib/events/notify'

// 主催者宛の予約通知メールを再送（お客様には送らない）。
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied
  const { id } = await params
  const b = await getBooking(id)
  if (!b || b.status !== 'paid') return NextResponse.json({ error: '確定済みの予約のみ再送できます' }, { status: 400 })
  try {
    await notifyNewBooking(b, { organizersOnly: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '送信に失敗しました' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
