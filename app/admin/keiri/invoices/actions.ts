'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { nextInvoiceNumber } from '@/lib/keiri/numbering'
import { normalizeIssuer, type Issuer } from '@/lib/keiri/company'
import { groupByTaxRate, type TaxRate } from '@/lib/keiri/tax'
import { renderAndSendInvoice } from '@/lib/keiri/sendInvoice'

const INVOICE_BUCKET = 'keiri-invoices'

export type InvoiceLineInput = {
  item_id: string | null
  description: string
  quantity: number
  unit_price: number
  tax_rate: TaxRate
}

export type InvoiceInput = {
  client_id: string
  issuer: Issuer
  issue_date: string
  due_date: string | null
  notes: string | null
  lines: InvoiceLineInput[]
}

function validate(input: InvoiceInput) {
  if (!input.client_id) throw new Error('取引先を選択してください')
  if (!input.issue_date) throw new Error('発行日を入力してください')
  if (!input.lines.length) throw new Error('明細を1行以上入力してください')
  for (const l of input.lines) {
    if (!l.description.trim()) throw new Error('明細の品名は必須です')
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new Error('数量は正の整数です')
    if (!Number.isFinite(l.unit_price) || l.unit_price < 0) throw new Error('単価は0以上の整数です')
    if (l.tax_rate !== 10 && l.tax_rate !== 8 && l.tax_rate !== 0)
      throw new Error('税率は 10 / 8 / 0 のみです')
  }
}

export async function issueInvoice(
  input: InvoiceInput,
  opts: { publish: boolean },
): Promise<{ id: string; invoice_number: string | null }> {
  validate(input)
  const supabase = await createClient()

  const issuer = normalizeIssuer(input.issuer)
  const summary = groupByTaxRate(input.lines)
  const invoice_number = opts.publish ? await nextInvoiceNumber(issuer) : null
  const status = opts.publish ? 'sent' : 'draft'
  // sent_at は「メールが実際に送信成功した時刻」のみを表す authoritative なフィールド。
  // 発行(publish)しただけでは設定しない。実送信は renderAndSendInvoice が成功時に記録する。
  // → status='sent' かつ sent_at IS NULL = 発行済みだが未送信。リマインダーcronが拾える。

  const { data: inv, error: invErr } = await supabase
    .from('keiri_invoices')
    .insert({
      client_id: input.client_id,
      issuer,
      invoice_number,
      status,
      issue_date: input.issue_date,
      due_date: input.due_date,
      subtotal_10: summary.subtotal_10,
      subtotal_8: summary.subtotal_8,
      tax_10: summary.tax_10,
      tax_8: summary.tax_8,
      total: summary.total,
      notes: input.notes,
    })
    .select('id, invoice_number')
    .single()
  if (invErr) throw new Error(invErr.message)

  const lineRows = input.lines.map((l, i) => ({
    invoice_id: inv.id as string,
    item_id: l.item_id,
    description: l.description.trim(),
    quantity: Math.trunc(l.quantity),
    unit_price: Math.trunc(l.unit_price),
    tax_rate: l.tax_rate,
    amount: Math.trunc(l.quantity) * Math.trunc(l.unit_price),
    sort_order: i,
  }))
  const { error: linesErr } = await supabase.from('keiri_invoice_lines').insert(lineRows)
  if (linesErr) {
    await supabase.from('keiri_invoices').delete().eq('id', inv.id as string)
    throw new Error(linesErr.message)
  }

  return { id: inv.id as string, invoice_number: (inv.invoice_number as string | null) ?? null }
}

export async function publishDraftInvoice(
  id: string,
  opts: { sendEmail: boolean },
): Promise<{ invoice_number: string; emailSent: boolean; emailError: string | null }> {
  const supabase = await createClient()

  const { data: row, error: getErr } = await supabase
    .from('keiri_invoices')
    .select('status, issuer')
    .eq('id', id)
    .single()
  if (getErr) throw new Error(getErr.message)
  if (row.status !== 'draft') throw new Error('下書きのみ発行できます')

  const invoice_number = await nextInvoiceNumber(normalizeIssuer(row.issuer))
  // sent_at はここでは設定しない。実メール送信が成功したときに renderAndSendInvoice が記録する。
  const { error: updErr } = await supabase
    .from('keiri_invoices')
    .update({
      invoice_number,
      status: 'sent',
      pdf_path: null,
    })
    .eq('id', id)
  if (updErr) throw new Error(updErr.message)

  let emailSent = false
  let emailError: string | null = null
  if (opts.sendEmail) {
    try {
      await renderAndSendInvoice(id)
      emailSent = true
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e)
    }
  }

  return { invoice_number, emailSent, emailError }
}

export async function markInvoicePaid(id: string, paid_date: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('keiri_invoices')
    .update({ status: 'paid', paid_at: paid_date })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function cancelInvoice(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('keiri_invoices').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteInvoice(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: row, error: getErr } = await supabase
    .from('keiri_invoices')
    .select('pdf_path')
    .eq('id', id)
    .single()
  if (getErr) throw new Error(getErr.message)

  if (row.pdf_path) {
    const service = createServiceClient()
    const { error: storageErr } = await service.storage.from(INVOICE_BUCKET).remove([row.pdf_path as string])
    if (storageErr) throw new Error(`PDF削除失敗: ${storageErr.message}`)
  }

  const { error: linesErr } = await supabase.from('keiri_invoice_lines').delete().eq('invoice_id', id)
  if (linesErr) throw new Error(linesErr.message)
  const { error } = await supabase.from('keiri_invoices').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
