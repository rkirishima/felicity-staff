import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'

// Daily 8:00 JST (23:00 UTC the previous day):
// Scans both announcements (event_date == today + 7) and event_instances
// (date == today + 7, status='scheduled'), sends Telegram alert per row,
// stamps reminded_at_7day so the same item is never alerted twice.
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

  // today+7 in JST + today
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const target = new Date(nowJst)
  target.setUTCDate(target.getUTCDate() + 7)
  const targetDate = target.toISOString().slice(0, 10)
  const todayDate = nowJst.toISOString().slice(0, 10)

  const announcementsResult = await processAnnouncements(sb, targetDate)
  const eventsResult = await processEvents(sb, targetDate)
  const payables7dayResult = await processPayables7Day(sb, targetDate)
  const payablesTodayResult = await processPayablesToday(sb, todayDate)
  const invoiceReminderResult = await processMissingInvoiceReminders(sb)

  const totalSent =
    announcementsResult.sent + eventsResult.sent + payables7dayResult.sent + payablesTodayResult.sent + invoiceReminderResult.sent
  const totalFound =
    announcementsResult.found + eventsResult.found + payables7dayResult.found + payablesTodayResult.found + invoiceReminderResult.found
  const allFailures = [
    ...announcementsResult.failures,
    ...eventsResult.failures,
    ...payables7dayResult.failures,
    ...payablesTodayResult.failures,
    ...invoiceReminderResult.failures,
  ]

  return NextResponse.json({
    ok: allFailures.length === 0,
    targetDate,
    todayDate,
    found: totalFound,
    sent: totalSent,
    announcements: announcementsResult,
    events: eventsResult,
    payables7day: payables7dayResult,
    payablesToday: payablesTodayResult,
    invoiceReminders: invoiceReminderResult,
  })
}

async function processMissingInvoiceReminders(sb: SbClient) {
  // Remind to upload invoice PDF for paid payables.
  // Schedule: 2日後 → 5日後 → 10日後 にエスカレート。最大3回まで。
  const nowMs = Date.now()
  const { data, error } = await sb
    .from('keiri_payables')
    .select('id, vendor, description, amount, paid_at, paid_via, reminded_invoice_at, reminded_invoice_count')
    .eq('status', 'paid')
    .is('invoice_file_path', null)
    .not('paid_at', 'is', null)
  if (error) return { found: 0, sent: 0, sentIds: [], failures: [{ id: 'query', error: error.message }] }

  const rows = (data ?? []) as Array<{
    id: string
    vendor: string
    description: string | null
    amount: number
    paid_at: string
    paid_via: string | null
    reminded_invoice_at: string | null
    reminded_invoice_count: number
  }>

  const sentIds: string[] = []
  const failures: { id: string; error: string }[] = []

  for (const r of rows) {
    const paidMs = new Date(r.paid_at).getTime()
    const daysSincePaid = Math.floor((nowMs - paidMs) / 86400000)
    const count = r.reminded_invoice_count ?? 0

    // Send schedule based on days since paid AND how many times reminded already
    let shouldSend = false
    if (count === 0 && daysSincePaid >= 2) shouldSend = true
    else if (count === 1 && daysSincePaid >= 5) shouldSend = true
    else if (count === 2 && daysSincePaid >= 10) shouldSend = true

    if (!shouldSend) continue

    const text = formatInvoiceReminderMessage(
      {
        id: r.id,
        vendor: r.vendor,
        description: r.description,
        amount: r.amount,
        paid_at: r.paid_at,
        paid_via: r.paid_via,
      },
      count + 1,
    )
    const result = await sendTelegramMessage({ text, parseMode: 'HTML', disablePreview: true })
    if (result.ok) {
      const { error: upErr } = await sb
        .from('keiri_payables')
        .update({
          reminded_invoice_at: new Date().toISOString(),
          reminded_invoice_count: count + 1,
        })
        .eq('id', r.id)
      if (upErr) failures.push({ id: r.id, error: `stamp: ${upErr.message}` })
      else sentIds.push(r.id)
    } else {
      failures.push({ id: r.id, error: result.error })
    }
  }
  return { found: rows.length, sent: sentIds.length, sentIds, failures }
}

function formatInvoiceReminderMessage(
  p: {
    id: string
    vendor: string
    description: string | null
    amount: number
    paid_at: string
    paid_via: string | null
  },
  attempt: number,
): string {
  const heading =
    attempt === 1 ? '📄 請求書アップ忘れ（1回目）' :
    attempt === 2 ? '⚠️ 請求書アップ忘れ（2回目）' :
    '🚨 請求書アップ忘れ（最終）'
  const paidDate = new Date(p.paid_at).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
  const lines = [
    `<b>${heading}</b>`,
    '',
    `<b>${escapeHtml(p.vendor)}</b>  ¥${p.amount.toLocaleString()}`,
    `💳 ${paidDate} 支払済 (${escapeHtml(p.paid_via ?? '不明')})`,
  ]
  if (p.description) lines.push(escapeHtml(p.description))
  lines.push(
    '',
    '請求書・領収書PDFをアップしてください。税理士提出に必要です。',
    '',
    `<a href="https://staff.felicity.cafe/admin/keiri/payables/${p.id}">▶ この未払を開く</a>`,
  )
  return lines.join('\n')
}

// Type loose intentionally — Supabase generated types are narrow but we only need basic table ops here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbClient = any

async function processAnnouncements(sb: SbClient, targetDate: string) {
  const { data, error } = await sb
    .from('announcements')
    .select('id, title, banner_text, body, event_date, event_start_time, event_end_time, type, link_url')
    .eq('published', true)
    .eq('event_date', targetDate)
    .is('reminded_at_7day', null)

  if (error) return { found: 0, sent: 0, sentIds: [], failures: [{ id: 'query', error: error.message }] }
  const rows = data ?? []
  const sentIds: string[] = []
  const failures: { id: string; error: string }[] = []

  for (const r of rows) {
    const text = formatAnnouncementMessage({
      id: r.id as string,
      title: r.title as string,
      banner_text: r.banner_text as string,
      body: (r.body as string | null) ?? null,
      event_date: r.event_date as string,
      event_start_time: (r.event_start_time as string | null) ?? null,
      event_end_time: (r.event_end_time as string | null) ?? null,
      type: r.type as string,
      link_url: (r.link_url as string | null) ?? null,
    })
    const result = await sendTelegramMessage({ text, parseMode: 'HTML', disablePreview: true })
    if (result.ok) {
      const { error: upErr } = await sb
        .from('announcements')
        .update({ reminded_at_7day: new Date().toISOString() })
        .eq('id', r.id as string)
      if (upErr) failures.push({ id: r.id as string, error: `stamp: ${upErr.message}` })
      else sentIds.push(r.id as string)
    } else {
      failures.push({ id: r.id as string, error: result.error })
    }
  }

  return { found: rows.length, sent: sentIds.length, sentIds, failures }
}

async function processEvents(sb: SbClient, targetDate: string) {
  const { data, error } = await sb
    .from('event_instances')
    .select('id, date, start_time, end_time, status, notes, event_id, events(title, title_en, description, event_type)')
    .eq('date', targetDate)
    .eq('status', 'scheduled')
    .is('reminded_at_7day', null)

  if (error) return { found: 0, sent: 0, sentIds: [], failures: [{ id: 'query', error: error.message }] }
  const rows = data ?? []
  const sentIds: string[] = []
  const failures: { id: string; error: string }[] = []

  for (const r of rows) {
    const ev = r.events as unknown as { title: string; title_en?: string; description?: string; event_type?: string } | null
    if (!ev) continue
    const text = formatEventMessage({
      id: r.id as string,
      event_id: r.event_id as string,
      title: ev.title,
      description: ev.description ?? null,
      event_type: ev.event_type ?? null,
      date: r.date as string,
      start_time: (r.start_time as string | null) ?? null,
      end_time: (r.end_time as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    })
    const result = await sendTelegramMessage({ text, parseMode: 'HTML', disablePreview: true })
    if (result.ok) {
      const { error: upErr } = await sb
        .from('event_instances')
        .update({ reminded_at_7day: new Date().toISOString() })
        .eq('id', r.id as string)
      if (upErr) failures.push({ id: r.id as string, error: `stamp: ${upErr.message}` })
      else sentIds.push(r.id as string)
    } else {
      failures.push({ id: r.id as string, error: result.error })
    }
  }

  return { found: rows.length, sent: sentIds.length, sentIds, failures }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function dateLabelJST(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00+09:00')
  const day = ['日', '月', '火', '水', '木', '金', '土'][date.getUTCDay()]
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${day})`
}

function timeLabel(start: string | null, end: string | null): string {
  if (!start || !end) return ''
  return ` ${start.slice(0, 5)}〜${end.slice(0, 5)}`
}

function formatAnnouncementMessage(a: {
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

  const lines = [
    `${emoji} <b>1週間前リマインダー（告知）</b>`,
    '',
    `<b>${escapeHtml(a.title)}</b>`,
    `📅 ${escapeHtml(dateLabelJST(a.event_date))}${escapeHtml(timeLabel(a.event_start_time, a.event_end_time))}`,
    '',
    escapeHtml(a.banner_text),
  ]
  if (a.body) lines.push('', escapeHtml(a.body))
  lines.push('', `<a href="https://staff.felicity.cafe/admin/announcements/${a.id}">▶ 編集ページを開く</a>`)
  if (a.link_url) lines.push(`<a href="${escapeHtml(a.link_url)}">▶ 詳細</a>`)
  return lines.join('\n')
}

function formatEventMessage(e: {
  id: string
  event_id: string
  title: string
  description: string | null
  event_type: string | null
  date: string
  start_time: string | null
  end_time: string | null
  notes: string | null
}): string {
  const typeEmoji: Record<string, string> = {
    roasting: '🔥',
    yoga: '🧘',
    workshop: '🛠',
    music: '🎵',
    one_off: '🎉',
    recurring: '🔁',
  }
  const emoji = (e.event_type && typeEmoji[e.event_type]) ?? '🎉'

  const lines = [
    `${emoji} <b>1週間前リマインダー（イベント）</b>`,
    '',
    `<b>${escapeHtml(e.title)}</b>`,
    `📅 ${escapeHtml(dateLabelJST(e.date))}${escapeHtml(timeLabel(e.start_time, e.end_time))}`,
  ]
  if (e.description) lines.push('', escapeHtml(e.description))
  if (e.notes) lines.push('', `📝 ${escapeHtml(e.notes)}`)
  lines.push('', `<a href="https://staff.felicity.cafe/admin/events">▶ イベント管理を開く</a>`)
  return lines.join('\n')
}

async function processPayables7Day(sb: SbClient, targetDate: string) {
  const { data, error } = await sb
    .from('keiri_payables')
    .select('id, vendor, description, amount, invoice_number, due_date, notes')
    .eq('status', 'pending')
    .eq('due_date', targetDate)
    .is('reminded_7day_at', null)
  if (error) return { found: 0, sent: 0, sentIds: [], failures: [{ id: 'query', error: error.message }] }
  const rows = data ?? []
  const sentIds: string[] = []
  const failures: { id: string; error: string }[] = []
  for (const r of rows) {
    const text = formatPayableMessage(
      {
        id: r.id as string,
        vendor: r.vendor as string,
        description: (r.description as string | null) ?? null,
        amount: r.amount as number,
        invoice_number: (r.invoice_number as string | null) ?? null,
        due_date: r.due_date as string,
        notes: (r.notes as string | null) ?? null,
      },
      '7days',
    )
    const result = await sendTelegramMessage({ text, parseMode: 'HTML', disablePreview: true })
    if (result.ok) {
      const { error: upErr } = await sb
        .from('keiri_payables')
        .update({ reminded_7day_at: new Date().toISOString() })
        .eq('id', r.id as string)
      if (upErr) failures.push({ id: r.id as string, error: `stamp: ${upErr.message}` })
      else sentIds.push(r.id as string)
    } else {
      failures.push({ id: r.id as string, error: result.error })
    }
  }
  return { found: rows.length, sent: sentIds.length, sentIds, failures }
}

async function processPayablesToday(sb: SbClient, targetDate: string) {
  const { data, error } = await sb
    .from('keiri_payables')
    .select('id, vendor, description, amount, invoice_number, due_date, notes')
    .eq('status', 'pending')
    .eq('due_date', targetDate)
    .is('reminded_same_day_at', null)
  if (error) return { found: 0, sent: 0, sentIds: [], failures: [{ id: 'query', error: error.message }] }
  const rows = data ?? []
  const sentIds: string[] = []
  const failures: { id: string; error: string }[] = []
  for (const r of rows) {
    const text = formatPayableMessage(
      {
        id: r.id as string,
        vendor: r.vendor as string,
        description: (r.description as string | null) ?? null,
        amount: r.amount as number,
        invoice_number: (r.invoice_number as string | null) ?? null,
        due_date: r.due_date as string,
        notes: (r.notes as string | null) ?? null,
      },
      'today',
    )
    const result = await sendTelegramMessage({ text, parseMode: 'HTML', disablePreview: true })
    if (result.ok) {
      const { error: upErr } = await sb
        .from('keiri_payables')
        .update({ reminded_same_day_at: new Date().toISOString() })
        .eq('id', r.id as string)
      if (upErr) failures.push({ id: r.id as string, error: `stamp: ${upErr.message}` })
      else sentIds.push(r.id as string)
    } else {
      failures.push({ id: r.id as string, error: result.error })
    }
  }
  return { found: rows.length, sent: sentIds.length, sentIds, failures }
}

function formatPayableMessage(
  p: {
    id: string
    vendor: string
    description: string | null
    amount: number
    invoice_number: string | null
    due_date: string
    notes: string | null
  },
  kind: '7days' | 'today',
): string {
  const heading = kind === '7days' ? '💸 仕入支払 1週間前リマインダー' : '🔴 仕入支払 本日が期日'
  const lines = [
    `<b>${heading}</b>`,
    '',
    `<b>${escapeHtml(p.vendor)}</b>  ¥${p.amount.toLocaleString()}`,
    `📅 期日 ${escapeHtml(dateLabelJST(p.due_date))}`,
  ]
  if (p.description) lines.push(escapeHtml(p.description))
  if (p.invoice_number) lines.push(`請求書 ${escapeHtml(p.invoice_number)}`)
  if (p.notes) lines.push('', `📝 ${escapeHtml(p.notes)}`)
  lines.push('', `<a href="https://staff.felicity.cafe/admin/keiri/payables">▶ 未払一覧を開く</a>`)
  return lines.join('\n')
}
