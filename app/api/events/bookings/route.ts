import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server'
import { PERSIAN_DINNER as EV } from '@/lib/events/persian-dinner'
import { listBookings, reconcile } from '@/lib/events/bookings'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const denied = await requireAdmin(); if (denied) return denied
  await reconcile(EV.slug)
  const rows = await listBookings(EV.slug)
  return NextResponse.json({ event: { title: EV.title, date: EV.date, start_time: EV.start_time, capacity: EV.capacity }, bookings: rows })
}
