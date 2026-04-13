import { NextRequest, NextResponse } from 'next/server'
import { createCalendarEvent } from '@/lib/google/calendar'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, date, time, end_time, party_size, notes, floor_preference } = body

    if (!name || !date || !time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Build event times
    const startTime = `${date}T${time}:00`
    const endTime = end_time ? `${date}T${end_time}:00` : `${date}T${String(Number(time.split(':')[0]) + 2).padStart(2, '0')}:${time.split(':')[1]}:00`

    const description = [
      `人数: ${party_size}名`,
      floor_preference ? `席: ${floor_preference}` : '',
      notes ? `備考: ${notes}` : '',
    ].filter(Boolean).join('\n')

    const event = await createCalendarEvent({
      summary: `予約: ${name}様 ${party_size}名`,
      description,
      startTime,
      endTime,
      location: 'Felicity',
    })

    return NextResponse.json({ success: true, eventId: event.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync to Google Calendar'
    console.error('Google sync error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
