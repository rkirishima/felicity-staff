'use server'

import { createClient } from '@/lib/supabase/server'
import { nextInvoiceNumber } from '@/lib/keiri/numbering'
import { groupByTaxRate, type TaxRate } from '@/lib/keiri/tax'

export type InvoiceLineInput = {
  item_id: string | null
  name: string
  description: string | null
  quantity: number
  unit_price: number
  tax_rate: TaxRate
}

export type InvoiceInput = {
  client_id: string
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
    if (!l.name.trim()) throw new Error('明細の品名は必須です')
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new Error('数量は正の整数です')
    if (!Number.isFinite(l.unit_price) || l.unit_price < 0) throw new Error('単価は0以上の整数です')
    if (l.tax_rate !== 10 && l.tax_rate !== 8) throw new Error('税率は 10 か 8 のみです')
  }
}

export async function issueInvoice(
  input: InvoiceInput,
  opts: { publish: boolean },
): Promise<{ id: string; invoice_number: string | null }> {
  validate(input)
  const supabase = await createClient()

  const summary = groupByTaxRate(input.lines)
  const invoice_number = opts.publish ? await nextInvoiceNumber() : null
  const status = opts.publish ? 'sent' : 'draft'
  const sent_at = opts.publish ? new Date().toISOString() : null

  const { data: inv, error: invErr } = await supabase
    .from('keiri_invoices')
    .insert({
      client_id: input.client_id,
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
      sent_at,
    })
    .select('id, invoice_number')
    .single()
  if (invErr) throw new Error(invErr.message)

  const lineRows = input.lines.map((l, i) => ({
    invoice_id: inv.id as string,
    item_id: l.item_id,
    name: l.name.trim(),
    description: l.description,
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
    .select('status')
    .eq('id', id)
    .single()
  if (getErr) throw new Error(getErr.message)
  if (row.status !== 'draft') throw new Error('下書きのみ削除できます')

  const { error: linesErr } = await supabase.from('keiri_invoice_lines').delete().eq('invoice_id', id)
  if (linesErr) throw new Error(linesErr.message)
  const { error } = await supabase.from('keiri_invoices').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
