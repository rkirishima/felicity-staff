import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendLineMessage(message: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: process.env.LINE_STAFF_GROUP_ID,
      messages: [{ type: 'text', text: message }],
    }),
  })
}

// Called daily at 16:00 JST (07:00 UTC) — 1 hour before closing
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Tomorrow in JST
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  const tomorrowDay = dayNames[tomorrow.getDay()]

  const tasks: { eventTitle: string; startTime?: string; items: string[] }[] = []

  // Check event_instances for tomorrow
  const { data: instances } = await sb
    .from('event_instances')
    .select('start_time, events(title, prep_tasks)')
    .eq('date', tomorrowStr)
    .eq('status', 'scheduled')

  for (const inst of instances || []) {
    const ev = inst.events as any
    if (ev?.prep_tasks && Array.isArray(ev.prep_tasks) && ev.prep_tasks.length > 0) {
      tasks.push({
        eventTitle: ev.title,
        startTime: inst.start_time ?? undefined,
        items: ev.prep_tasks.map((t: any) => t.task),
      })
    }
  }

  // Check confirmed events for tomorrow
  const { data: confirmed } = await sb
    .from('events')
    .select('title, prep_tasks')
    .eq('confirmed_date', tomorrowStr)
    .eq('status', 'open')

  for (const ev of confirmed || []) {
    const prepTasks = ev.prep_tasks as any
    if (prepTasks && Array.isArray(prepTasks) && prepTasks.length > 0) {
      tasks.push({
        eventTitle: ev.title,
        items: prepTasks.map((t: any) => t.task),
      })
    }
  }

  if (tasks.length === 0) {
    return NextResponse.json({ sent: false, reason: 'no prep tasks for tomorrow' })
  }

  // Build LINE message
  const lines: string[] = [`🧹 明日の準備リマインド\n${tomorrow.getMonth() + 1}/${tomorrow.getDate()}(${tomorrowDay})\n`]
  for (const t of tasks) {
    lines.push(`📌 ${t.eventTitle}${t.startTime ? ` ${t.startTime.slice(0, 5)}〜` : ''}`)
    for (const item of t.items) {
      lines.push(`  ・${item}`)
    }
    lines.push('')
  }
  lines.push('閉店前に準備をお願いします 🙏')

  await sendLineMessage(lines.join('\n'))

  return NextResponse.json({ sent: true, tasks: tasks.length })
}
