import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()

  // Get today's date in JST
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstDate = new Date(now.getTime() + jstOffset)
  const today = jstDate.toISOString().split('T')[0]

  // Get events with confirmed_date = today
  const { data: confirmedEvents } = await supabase
    .from('events')
    .select('id, title, title_en, description, event_type, floor_block, seats_blocked, time_relation, confirmed_date')
    .eq('confirmed_date', today)
    .eq('status', 'open')

  // Get event_dates with date = today (for events with multiple date options)
  const { data: eventDates } = await supabase
    .from('event_dates')
    .select('id, event_id, date, start_time, end_time, events(id, title, title_en, description, event_type, floor_block, seats_blocked, time_relation)')
    .eq('date', today)

  // Get event_instances with date = today (for recurring events)
  const { data: eventInstances } = await supabase
    .from('event_instances')
    .select('id, event_id, date, start_time, end_time, status, notes, events(id, title, title_en, description, event_type, floor_block, seats_blocked, time_relation)')
    .eq('date', today)
    .eq('status', 'scheduled')

  return NextResponse.json({
    confirmedEvents: confirmedEvents || [],
    eventDates: eventDates || [],
    eventInstances: eventInstances || [],
  })
}
