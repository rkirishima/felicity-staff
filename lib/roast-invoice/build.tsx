/**
 * 月次請求書ドラフトを作って永続化するオーケストレータ。
 *
 * 流れ:
 *   1. buildMonthlyInvoiceData で集計
 *   2. PDF を React-PDF でレンダリング
 *   3. Supabase Storage にアップロード
 *   4. keiri_invoices(status='draft') + keiri_invoice_lines を作る
 *   5. 結果(invoice id, PDF path) を返す
 *
 * 既に同月分のドラフトがあれば再生成して上書き(冪等)。
 */

import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@supabase/supabase-js'

import { buildMonthlyInvoiceData } from './aggregate'
import { InvoiceDocument, defaultMeta } from './pdf'
import { uploadInvoicePdf } from './storage'
import { FELICITY_CLIENT_ID, type MonthlyInvoiceData } from './types'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function lastDay(year: number, month: number): string {
  const d = new Date(year, month, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nextMonthLastDay(year: number, month: number): string {
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  return lastDay(ny, nm)
}

export type BuildResult = {
  invoiceId: string
  invoiceNumber: string
  pdfPath: string
  data: MonthlyInvoiceData
  /** 既存(手動/確定済み)を保護してスキップした場合 true */
  skipped?: boolean
  skipReason?: string
}

export async function buildAndPersistInvoice(opts: {
  year: number
  month: number
}): Promise<BuildResult> {
  const data = await buildMonthlyInvoiceData(opts)
  if (data.items.length === 0) {
    throw new Error(`${opts.year}-${opts.month} には焙煎ログがありません`)
  }
  const meta = defaultMeta(data)

  // 1) 既存請求書チェック。cronは「自分が作ったドラフト」だけを上書きする。
  //    paid/sent や手動作成の請求書（繰越ドラフト等）は絶対に潰さない。
  //    対象外なら PDF生成もDB書込もせず skipped を返す（route側でTelegram通知）。
  //    2026-05 の二重請求事故（cronがpaid請求書を上書き）の再発防止。
  const supabase = admin()
  const { data: existing } = await supabase
    .from('keiri_invoices')
    .select('id, status, created_by')
    .eq('invoice_number', meta.invoiceNumber)
    .maybeSingle()

  const cronOwnedDraft =
    existing?.status === 'draft' && existing?.created_by === 'cron:monthly-roast-invoice'

  if (existing && !cronOwnedDraft) {
    return {
      invoiceId: existing.id,
      invoiceNumber: meta.invoiceNumber,
      pdfPath: '',
      data,
      skipped: true,
      skipReason: `既存 status=${existing.status} / created_by=${existing.created_by}`,
    }
  }

  // 2) PDF render
  const pdfBuffer = await renderToBuffer(<InvoiceDocument meta={meta} />)
  const pdfPath = await uploadInvoicePdf({
    year: opts.year,
    month: opts.month,
    recipientSlug: 'FELICITY',
    bytes: pdfBuffer,
  })

  // 3) UPSERT keiri_invoices
  const invoiceRow = {
    invoice_number: meta.invoiceNumber,
    client_id: FELICITY_CLIENT_ID,
    issue_date: lastDay(opts.year, opts.month),
    due_date: nextMonthLastDay(opts.year, opts.month),
    subtotal_8: data.subtotal,
    tax_8: data.tax,
    subtotal_10: 0,
    tax_10: 0,
    total: data.total,
    status: 'draft' as const,
    pdf_path: pdfPath,
    notes: `${opts.year}年${opts.month}月 焙煎分(自動生成)`,
    created_by: 'cron:monthly-roast-invoice',
  }

  let invoiceId: string
  if (existing?.id) {
    invoiceId = existing.id
    await supabase.from('keiri_invoices').update(invoiceRow).eq('id', invoiceId)
    await supabase.from('keiri_invoice_lines').delete().eq('invoice_id', invoiceId)
  } else {
    const { data: ins, error } = await supabase
      .from('keiri_invoices')
      .insert(invoiceRow)
      .select('id')
      .single()
    if (error || !ins) throw new Error(`invoice insert failed: ${error?.message}`)
    invoiceId = ins.id
  }

  // 4) keiri_invoice_lines を書き込み
  const lines = data.items.map((it, idx) => ({
    invoice_id: invoiceId,
    description: it.product,
    quantity: it.kg,
    unit_price: it.green_unit_price,
    tax_rate: 8,
    amount: it.green_amount,
    sort_order: idx,
  }))
  // 焙煎代の集約行
  const totalKg = data.items.reduce((s, i) => s + i.kg, 0)
  lines.push({
    invoice_id: invoiceId,
    description: `焙煎代（${opts.month}月分）`,
    quantity: totalKg,
    unit_price: 1000,
    tax_rate: 8,
    amount: data.roast_subtotal,
    sort_order: lines.length,
  })
  const { error: linesErr } = await supabase.from('keiri_invoice_lines').insert(lines)
  if (linesErr) throw new Error(`lines insert failed: ${linesErr.message}`)

  return { invoiceId, invoiceNumber: meta.invoiceNumber, pdfPath, data }
}
