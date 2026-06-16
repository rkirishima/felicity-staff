/**
 * 「出力済みだがメール未送信」の請求書を催促する Telegram リマインダー。
 *
 * 2系統を拾う:
 *   1. keiri手動請求書(旭興産など): status='sent' かつ sent_at IS NULL
 *      = 発行(番号採番)済みだが、メールが実際には送信されていない。
 *      issueInvoice/publishDraftInvoice は sent_at を先付けしなくなったため、
 *      sent_at は「実送信成功」のみを表す。null = 未送信。
 *      取引先にメールアドレスがある分だけ対象(紙請求のみの先は除外)。
 *   2. ロースト月次請求書(FCR): status='draft' かつ pdf_path='roast-monthly/%'
 *      = cron生成済みだが手動承認待ち。
 *
 * いずれも cancelled/paid は status で自然に除外される。
 * 未送信が無ければ通知しない。
 *
 * Vercel cron 推奨: 0 1 * * *  (毎日 10:00 JST)。
 */

import { NextRequest, NextResponse } from 'next/server'

import { createServiceClient } from '@/lib/keiri/serviceClient'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}

type ClientRef = { name: string | null; email: string | null } | null

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const base = process.env.PUBLIC_APP_URL ?? 'https://felicity-staff.vercel.app'
  const nowMs = Date.now()

  // (1) 発行済みだが未送信の手動請求書(取引先にメールがある分のみ)
  const { data: unsentRaw, error: unsentErr } = await supabase
    .from('keiri_invoices')
    .select('id, invoice_number, total, issue_date, client:keiri_clients(name, email)')
    .eq('status', 'sent')
    .is('sent_at', null)
    .order('issue_date', { ascending: true })
  if (unsentErr) {
    return NextResponse.json({ ok: false, error: unsentErr.message }, { status: 500 })
  }
  const unsent = (unsentRaw ?? []).filter(r => {
    const email = (r.client as unknown as ClientRef)?.email
    return !!email && email.trim() !== ''
  })

  // (2) 承認待ちのロースト月次ドラフト
  const { data: roastDrafts, error: roastErr } = await supabase
    .from('keiri_invoices')
    .select('id, invoice_number, total, issue_date')
    .eq('status', 'draft')
    .like('pdf_path', 'roast-monthly/%')
    .order('issue_date', { ascending: true })
  if (roastErr) {
    return NextResponse.json({ ok: false, error: roastErr.message }, { status: 500 })
  }

  const total = unsent.length + (roastDrafts?.length ?? 0)
  if (total === 0) {
    return NextResponse.json({ ok: true, pending: 0 })
  }

  function ageLabel(iso: string | null | undefined): string {
    if (!iso) return ''
    const days = Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000)
    return `（${days}日経過）`
  }
  function yen(v: unknown): string {
    return typeof v === 'number' ? `¥${v.toLocaleString('ja-JP')}` : '—'
  }

  const lines: string[] = [`🔔 <b>メール未送信の請求書が ${total} 件あります</b>`, ``]

  if (unsent.length > 0) {
    lines.push(`<b>■ 発行済み・メール未送信</b>`)
    for (const r of unsent) {
      const client = (r.client as unknown as ClientRef)?.name ?? '—'
      lines.push(
        `🧾 ${r.invoice_number ?? '(番号未採番)'} ${client} ${yen(r.total)} ${ageLabel(r.issue_date as string)}`,
        `<a href="${base}/admin/keiri/invoices/${r.id}">開いて送信する</a>`,
        ``,
      )
    }
  }

  if (roastDrafts && roastDrafts.length > 0) {
    lines.push(`<b>■ ロースト月次・承認待ち</b>`)
    for (const r of roastDrafts) {
      lines.push(
        `🧾 ${r.invoice_number ?? '(番号未採番)'} ${yen(r.total)} ${ageLabel(r.issue_date as string)}`,
        `<a href="${base}/admin/invoice-review/${r.id}">レビューして送付</a>`,
        ``,
      )
    }
  }

  const tg = await sendTelegramMessage({ text: lines.join('\n'), parseMode: 'HTML' })

  return NextResponse.json({
    ok: true,
    pending: total,
    unsent: unsent.map(r => r.invoice_number),
    roastDrafts: (roastDrafts ?? []).map(r => r.invoice_number),
    telegram: tg,
  })
}
