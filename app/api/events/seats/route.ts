import { NextResponse } from 'next/server'
import { PERSIAN_DINNER as EV, salesOpen } from '@/lib/events/persian-dinner'
import { reconcile, seatsTaken } from '@/lib/events/bookings'
import { stripeKey } from '@/lib/events/stripe'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    await reconcile(EV.slug)
    const taken = await seatsTaken(EV.slug)
    return NextResponse.json({ capacity: EV.capacity, remaining: Math.max(0, EV.capacity - taken), open: salesOpen(), payments: !!stripeKey() })
  } catch {
    return NextResponse.json({ capacity: EV.capacity, remaining: null, open: salesOpen(), payments: !!stripeKey() })
  }
}
