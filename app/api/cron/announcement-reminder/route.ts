import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'

// Daily 8:00 JST (23:00 UTC the previous day):
// For each published announcement with event_date == today + 7 (JST) and
// reminded_at_7day is null, send Telegram alert and stamp the row so we
// don't send twice.
export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }
  const sb = createClient(supabaseUrl, serviceKey)

  // today+7 in JST
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const target = new Date(nowJst)
  target.setUTCDate(target.getUTCDate() + 7)
  const targetDate = target.toISOString().slice(0, 10)

  const { data, error } = await sb
    .from('announcements')
    .select('id, title, banner_text, body, event_date, event_start_time, event_end_time, type, link_url')
    .eq('published', true)
    .eq('event_date', targetDate)
    .is('reminded_at_7day', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rows = data ?? []
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, targetDate, found: 0, sent: 0 })
  }

  const sentIds: string[] = []
  const failures: { id: string; error: string }[] = []

  for (const r of rows) {
    const text = formatTelegramMessage({
      title: r.title as string,
      banner_text: r.banner_text as string,
      body: (r.body as string | null) ?? null,
      event_date: r.event_date as string,
      event_start_time: (r.event_start_time as string | null) ?? null,
      event_end_time: (r.event_end_time as string | null) ?? null,
      type: r.type as string,
      link_url: (r.link_url as string | null) ?? null,
      id: r.id as string,
    })
    const result = await sendTelegramMessage({ text, parseMode: 'HTML', disablePreview: true })
    if (result.ok) {
      const { error: upErr } = await sb
        .from('announcements')
        .update({ reminded_at_7day: new Date().toISOString() })
        .eq('id', r.id as string)
      if (upErr) {
        failures.push({ id: r.id as string, error: `upsert: ${upErr.message}` })
      } else {
        sentIds.push(r.id as string)
      }
    } else {
      failures.push({ id: r.id as string, error: result.error })
    }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    targetDate,
    found: rows.length,
    sent: sentIds.length,
    sentIds,
    failures,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatTelegramMessage(a: {
  id: string
  title: string
  banner_text: string
  body: string | null
  event_date: string
  event_start_time: string | null
  event_end_time: string | null
  type: string
  link_url: string | null
}): string {
  const typeEmoji: Record<string, string> = {
    closure: '🏷',
    event: '🎉',
    menu: '☕',
    other: '📌',
  }
  const emoji = typeEmoji[a.type] ?? '📢'

  const date = new Date(a.event_date + 'T00:00:00+09:00')
  const day = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
  const dateLabel = `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${day})`

  const timeLabel = a.event_start_time && a.event_end_time
    ? ` ${a.event_start_time.slice(0, 5)}〜${a.event_end_time.slice(0, 5)}`
    : ''

  const editUrl = `https://staff.felicity.cafe/admin/announcements/${a.id}`

  const lines = [
    `${emoji} <b>1週間前リマインダー</b>`,
    '',
    `<b>${escapeHtml(a.title)}</b>`,
    `📅 ${escapeHtml(dateLabel)}${escapeHtml(timeLabel)}`,
    '',
    escapeHtml(a.banner_text),
  ]
  if (a.body) {
    lines.push('', escapeHtml(a.body))
  }
  lines.push('', `<a href="${editUrl}">▶ 編集ページを開く</a>`)
  if (a.link_url) {
    lines.push(`<a href="${escapeHtml(a.link_url)}">▶ 詳細</a>`)
  }

  return lines.join('\n')
}
