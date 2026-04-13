import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // Tomorrow in JST
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const todayStr = now.toISOString().split('T')[0]

  const alerts: { eventTitle: string; date: string; startTime?: string; tasks: { task: string; task_en?: string }[] }[] = []

  // Check event_instances for tomorrow (recurring events)
  const { data: tomorrowInstances } = await sb
    .from('event_instances')
    .select('id, event_id, date, start_time, end_time, events(id, title, title_en, prep_tasks, floor_block)')
    .eq('date', tomorrowStr)
    .eq('status', 'scheduled')

  for (const inst of tomorrowInstances || []) {
    const ev = inst.events as any
    if (ev?.prep_tasks && Array.isArray(ev.prep_tasks) && ev.prep_tasks.length > 0) {
      alerts.push({
        eventTitle: ev.title,
        date: inst.date,
        startTime: inst.start_time ?? undefined,
        tasks: ev.prep_tasks,
      })
    }
  }

  // Check confirmed events for tomorrow
  const { data: tomorrowConfirmed } = await sb
    .from('events')
    .select('id, title, title_en, prep_tasks, floor_block, confirmed_date')
    .eq('confirmed_date', tomorrowStr)
    .eq('status', 'open')

  for (const ev of tomorrowConfirmed || []) {
    const tasks = ev.prep_tasks as any
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      alerts.push({
        eventTitle: ev.title,
        date: tomorrowStr,
        tasks,
      })
    }
  }

  // Also return today's events for awareness
  const todayEvents: { title: string; startTime?: string; endTime?: string; floor?: string; seats?: number }[] = []

  const { data: todayInstances } = await sb
    .from('event_instances')
    .select('start_time, end_time, events(title, floor_block, seats_blocked)')
    .eq('date', todayStr)
    .eq('status', 'scheduled')

  for (const inst of todayInstances || []) {
    const ev = inst.events as any
    if (ev) {
      todayEvents.push({
        title: ev.title,
        startTime: inst.start_time ?? undefined,
        endTime: inst.end_time ?? undefined,
        floor: ev.floor_block ?? undefined,
        seats: ev.seats_blocked,
      })
    }
  }

  const { data: todayConfirmed } = await sb
    .from('events')
    .select('title, floor_block, seats_blocked')
    .eq('confirmed_date', todayStr)
    .eq('status', 'open')

  for (const ev of todayConfirmed || []) {
    todayEvents.push({
      title: ev.title,
      floor: ev.floor_block ?? undefined,
      seats: ev.seats_blocked,
    })
  }

  return NextResponse.json({ prepAlerts: alerts, todayEvents })
}
