import { NextRequest, NextResponse } from 'next/server'
import { createCalendarEvent, isConnected } from '@/lib/google/calendar'
import { requireAdmin } from '@/lib/auth/server'

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(); if (denied) return denied
  try {
    const connected = await isConnected()
    if (!connected) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 })
    }

    const body = await req.json()
    const { summary, description, date, startTime, endTime, location } = body

    if (!summary || !date) {
      return NextResponse.json({ error: 'summary and date required' }, { status: 400 })
    }

    const result = await createCalendarEvent({
      summary,
      description,
      date,
      startTime,
      endTime,
      location,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
