import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = createServiceClient()

  // Get today's date in JST
  const now = new Date()
  const jstOffset = 9 * 60 * 60 * 1000
  const jstDate = new Date(now.getTime() + jstOffset)
  const today = jstDate.toISOString().split('T')[0]

  // Tomorrow for prep alerts
  const tomorrow = new Date(jstDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // Get events with confirmed_date = today
  const { data: confirmedEvents } = await supabase
    .from('events')
    .select('id, title, title_en, description, event_type, floor_block, seats_blocked, time_relation, confirmed_date, prep_tasks')
    .eq('confirmed_date', today)
    .eq('status', 'open')

  // Get event_dates with date = today
  const { data: eventDates } = await supabase
    .from('event_dates')
    .select('id, event_id, date, start_time, end_time, events(id, title, title_en, description, event_type, floor_block, seats_blocked, time_relation, prep_tasks)')
    .eq('date', today)

  // Get event_instances with date = today (recurring events)
  const { data: eventInstances } = await supabase
    .from('event_instances')
    .select('id, event_id, date, start_time, end_time, status, notes, events(id, title, title_en, description, event_type, floor_block, seats_blocked, time_relation, prep_tasks)')
    .eq('date', today)
    .eq('status', 'scheduled')

  // Get prep alerts: events happening TOMORROW that have prep_tasks
  // Check event_instances for tomorrow
  const { data: tomorrowInstances } = await supabase
    .from('event_instances')
    .select('id, event_id, date, start_time, end_time, events(id, title, title_en, prep_tasks, floor_block)')
    .eq('date', tomorrowStr)
    .eq('status', 'scheduled')

  // Check confirmed events for tomorrow
  const { data: tomorrowConfirmed } = await supabase
    .from('events')
    .select('id, title, title_en, prep_tasks, floor_block')
    .eq('confirmed_date', tomorrowStr)
    .eq('status', 'open')

  // Build prep alerts
  interface PrepTask { task: string; task_en?: string }
  const prepAlerts: { eventTitle: string; date: string; startTime?: string; tasks: PrepTask[] }[] = []

  for (const inst of (tomorrowInstances || [])) {
    // events is returned as a joined object from Supabase
    const ev = inst.events as unknown as { id: string; title: string; title_en: string; prep_tasks: PrepTask[] | null; floor_block: string | null } | null
    if (ev?.prep_tasks && Array.isArray(ev.prep_tasks) && ev.prep_tasks.length > 0) {
      prepAlerts.push({
        eventTitle: ev.title,
        date: inst.date,
        startTime: inst.start_time ?? undefined,
        tasks: ev.prep_tasks,
      })
    }
  }

  for (const ev of (tomorrowConfirmed || [])) {
    const tasks = ev.prep_tasks as unknown as PrepTask[] | null
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      prepAlerts.push({
        eventTitle: ev.title,
        date: tomorrowStr,
        tasks,
      })
    }
  }

  return NextResponse.json({
    confirmedEvents: confirmedEvents || [],
    eventDates: eventDates || [],
    eventInstances: eventInstances || [],
    prepAlerts,
  })
}
