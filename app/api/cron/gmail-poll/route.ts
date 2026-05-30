import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import {
  listActiveAccounts,
  loadSupplierRules,
  getAccessToken,
  listMessageIds,
  getMessage,
  buildSearchQuery,
  matchRule,
  type GmailAccount,
  type SupplierRule,
} from '@/lib/keiri/gmail'
import { extractPayable } from '@/lib/keiri/extractPayable'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 60

// Every 30 min (Vercel cron: */30 * * * * not allowed → use 0,30 * * * * or */30 in some plans)
// Polls each connected Gmail account for new supplier emails, extracts payable info
// via Claude, inserts into keiri_payables with source='email_auto', sends a Telegram
// confirmation. Tracks processed message_ids to avoid double-insertion.
export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let accounts: GmailAccount[]
  let rules: SupplierRule[]
  try {
    accounts = await listActiveAccounts()
    rules = await loadSupplierRules()
  } catch (e) {
    return NextResponse.json(
      { error: 'init failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const sb = createServiceClient()
  const summaries: Array<Record<string, unknown>> = []

  for (const acct of accounts) {
    let accessToken: string
    try {
      accessToken = await getAccessToken(acct)
    } catch (e) {
      summaries.push({ email: acct.email, error: e instanceof Error ? e.message : String(e) })
      continue
    }

    // search since last_polled_at (fallback: 7 days ago)
    const sinceMs =
      (acct.last_polled_at ? new Date(acct.last_polled_at).getTime() : Date.now() - 7 * 24 * 3600 * 1000) -
      30 * 60 * 1000 // 30 min safety overlap
    const sinceUnix = Math.floor(sinceMs / 1000)
    const query = buildSearchQuery(rules, sinceUnix)

    let messageIds: { id: string; threadId: string }[]
    try {
      messageIds = await listMessageIds(accessToken, query, 30)
    } catch (e) {
      summaries.push({ email: acct.email, query, error: e instanceof Error ? e.message : String(e) })
      continue
    }

    let processed = 0
    let extracted = 0
    let skipped = 0
    let inserted = 0
    let alreadySeen = 0

    for (const m of messageIds) {
      // Skip if we've already processed
      const { data: already } = await sb
        .from('keiri_gmail_processed')
        .select('message_id')
        .eq('gmail_account_id', acct.id)
        .eq('message_id', m.id)
        .maybeSingle()
      if (already) {
        alreadySeen++
        continue
      }

      let msg
      try {
        msg = await getMessage(accessToken, m.id)
      } catch (e) {
        await sb.from('keiri_gmail_processed').insert({
          gmail_account_id: acct.id,
          message_id: m.id,
          thread_id: m.threadId,
          status: 'error',
          reason: e instanceof Error ? e.message : String(e),
        })
        continue
      }
      processed++

      const rule = matchRule(rules, msg.from, msg.subject)
      const defaultDue = rule?.default_due_days ?? 30

      // try LLM extraction
      const receivedAtIso = new Date(parseInt(msg.internalDate, 10)).toISOString()
      const result = await extractPayable({
        vendor_hint: rule?.vendor ?? null,
        from: msg.from,
        subject: msg.subject,
        bodyText: msg.bodyText,
        defaultDueDays: defaultDue,
        receivedAtIso,
      })

      if (!result || result.confidence === 'low' || !result.amount || !result.vendor) {
        skipped++
        await sb.from('keiri_gmail_processed').insert({
          gmail_account_id: acct.id,
          message_id: m.id,
          thread_id: m.threadId,
          status: 'skipped',
          reason: result ? `low_confidence ${result.confidence}` : 'extraction_failed',
          raw_snippet: msg.snippet.slice(0, 500),
        })
        continue
      }
      extracted++

      // Compute due_date if missing
      let dueDate = result.due_date
      if (!dueDate) {
        const base = result.order_date
          ? new Date(result.order_date + 'T00:00:00+09:00')
          : new Date(parseInt(msg.internalDate, 10))
        base.setUTCDate(base.getUTCDate() + defaultDue)
        dueDate = base.toISOString().slice(0, 10)
      }

      // Look for an existing payable with same invoice_number or vendor+amount+due_date — avoid dup
      if (result.invoice_number) {
        const { data: dup } = await sb
          .from('keiri_payables')
          .select('id')
          .eq('invoice_number', result.invoice_number)
          .eq('amount', result.amount)
          .limit(1)
          .maybeSingle()
        if (dup) {
          await sb.from('keiri_gmail_processed').insert({
            gmail_account_id: acct.id,
            message_id: m.id,
            thread_id: m.threadId,
            payable_id: dup.id as string,
            status: 'matched',
            reason: 'invoice_number duplicate',
            raw_snippet: msg.snippet.slice(0, 500),
          })
          continue
        }
      }

      const { data: insRow, error: insErr } = await sb
        .from('keiri_payables')
        .insert({
          vendor: result.vendor,
          description: result.description,
          amount: result.amount,
          invoice_number: result.invoice_number,
          order_date: result.order_date,
          due_date: dueDate,
          status: 'pending',
          source: 'email_auto',
          source_email_id: m.id,
          source_email_subject: msg.subject,
          source_email_from: msg.from,
          raw_text: msg.bodyText.slice(0, 4000),
          notes: result.notes,
          created_by: 'gmail-cron',
        })
        .select('id')
        .single()
      if (insErr) {
        await sb.from('keiri_gmail_processed').insert({
          gmail_account_id: acct.id,
          message_id: m.id,
          thread_id: m.threadId,
          status: 'error',
          reason: `insert failed: ${insErr.message}`,
          raw_snippet: msg.snippet.slice(0, 500),
        })
        continue
      }
      inserted++

      await sb.from('keiri_gmail_processed').insert({
        gmail_account_id: acct.id,
        message_id: m.id,
        thread_id: m.threadId,
        payable_id: insRow.id as string,
        status: 'extracted',
        reason: `confidence=${result.confidence}`,
        raw_snippet: msg.snippet.slice(0, 500),
      })

      const tgText = [
        `💸 <b>新規仕入れメール取込</b>`,
        '',
        `<b>${escapeHtml(result.vendor)}</b>  ¥${result.amount.toLocaleString()}`,
        `📅 期日 ${escapeHtml(dueDate)}`,
        result.description ? `${escapeHtml(result.description)}` : '',
        result.invoice_number ? `請求書 ${escapeHtml(result.invoice_number)}` : '',
        '',
        `<i>From: ${escapeHtml(msg.from)}</i>`,
        `<i>件名: ${escapeHtml(msg.subject)}</i>`,
        '',
        `<a href="https://staff.felicity.cafe/admin/keiri/payables/${insRow.id}">▶ 内容を確認・編集</a>`,
      ].filter(Boolean).join('\n')
      await sendTelegramMessage({ text: tgText, parseMode: 'HTML', disablePreview: true })
    }

    // update poll cursor
    await sb
      .from('keiri_gmail_accounts')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('id', acct.id)

    summaries.push({
      email: acct.email,
      query,
      candidates: messageIds.length,
      processed,
      extracted,
      inserted,
      skipped,
      alreadySeen,
    })
  }

  return NextResponse.json({ ok: true, accounts: summaries })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
