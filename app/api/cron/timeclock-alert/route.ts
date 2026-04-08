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

  const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data } = await sb
    .from('timeclock')
    .select('staff_id, clock_in, staff(name)')
    .gte('clock_in', `${todayJST}T00:00:00+09:00`)
    .lte('clock_in', `${todayJST}T23:59:59+09:00`)
    .is('clock_out', null)

  const names = (data ?? []).map(r => (r.staff as any)?.name).filter(Boolean)

  if (names.length > 0) {
    const msg = `⏰ 退勤打刻がまだのスタッフがいます：\n\n${names.map(n => `・${n}`).join('\n')}\n\n退勤打刻をお願いします👇\nhttps://felicity-staff.vercel.app`
    await sendLineMessage(msg)
  }

  return NextResponse.json({ unclockedOut: names, sent: names.length > 0 })
}
