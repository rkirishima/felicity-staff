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

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000) // JST
  const nextMonday = new Date(today)
  nextMonday.setDate(today.getDate() + (8 - today.getDay()) % 7 || 7)
  const nextSunday = new Date(nextMonday)
  nextSunday.setDate(nextMonday.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  const { data: shifts } = await sb
    .from('shifts')
    .select('date, status')
    .gte('date', fmt(nextMonday))
    .lte('date', fmt(nextSunday))
    .eq('status', 'approved')

  const alerts: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(nextMonday)
    d.setDate(nextMonday.getDate() + i)
    const day = d.getDay()
    if (day === 3 || day === 4) continue
    const dateStr = fmt(d)
    const dayShifts = (shifts ?? []).filter(s => s.date === dateStr)
    const required = (day === 0 || day === 6) ? 2 : 1
    if (dayShifts.length < required) {
      const dayName = ['日', '月', '火', '水', '木', '金', '土'][day]
      alerts.push(`${d.getMonth() + 1}/${d.getDate()}(${dayName}) あと${required - dayShifts.length}名`)
    }
  }

  if (alerts.length > 0) {
    const msg = `🔔 シフト募集\n\n来週、スタッフを募集しています：\n\n${alerts.map(a => `・${a}`).join('\n')}\n\n入れる方はアプリから申請を👇\nhttps://felicity-staff.vercel.app/schedule`
    await sendLineMessage(msg)
  }

  return NextResponse.json({ alerts, sent: alerts.length > 0 })
}
