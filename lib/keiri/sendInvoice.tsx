import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from './serviceClient'
import { getCompanyInfo } from './company'
import { getCompanySealDataUri } from './stamps'
import { sendInvoiceEmail } from './email'
import { InvoicePDF, type InvoicePDFLine } from '@/components/keiri/InvoicePDF'

const BUCKET = 'keiri-invoices'

export type SendOverride = {
  to?: string
  subject?: string
  body?: string
}

export async function renderAndSendInvoice(
  invoiceId: string,
  override: SendOverride = {},
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not set')
  }

  const supabase = createServiceClient()

  const { data: inv, error } = await supabase
    .from('keiri_invoices')
    .select(
      'id, invoice_number, status, issue_date, due_date, subtotal_10, subtotal_8, tax_10, tax_8, total, notes, pdf_path, client:keiri_clients(name, contact_person, postal_code, address, email)',
    )
    .eq('id', invoiceId)
    .single()
  if (error || !inv) throw new Error('invoice not found')
  if (!inv.invoice_number) throw new Error('下書きは送信できません')

  const { data: lineRows, error: linesErr } = await supabase
    .from('keiri_invoice_lines')
    .select('description, quantity, unit_price, tax_rate, amount, sort_order')
    .eq('invoice_id', invoiceId)
    .order('sort_order')
  if (linesErr) throw new Error(linesErr.message)

  const company = getCompanyInfo()
  const stamp_url = await getCompanySealDataUri()
  const lines: InvoicePDFLine[] = (lineRows ?? []).map(l => ({
    name: l.description as string,
    quantity: l.quantity as number,
    unit_price: l.unit_price as number,
    tax_rate: ((l.tax_rate as number) === 8 ? 8 : (l.tax_rate as number) === 0 ? 0 : 10) as 10 | 8 | 0,
    amount: l.amount as number,
  }))

  const client =
    (inv.client as unknown as {
      name: string
      contact_person: string | null
      postal_code: string | null
      address: string | null
      email: string | null
    } | null) ?? null

  let pdfBuffer: Buffer | null = null
  if (inv.pdf_path) {
    const { data: file } = await supabase.storage.from(BUCKET).download(inv.pdf_path as string)
    if (file) pdfBuffer = Buffer.from(await file.arrayBuffer())
  }
  if (!pdfBuffer) {
    pdfBuffer = await renderToBuffer(
      <InvoicePDF
        data={{
          invoice_number: inv.invoice_number as string,
          issue_date: inv.issue_date as string,
          due_date: (inv.due_date as string | null) ?? null,
          client_name: client?.name ?? '',
          client_contact: client?.contact_person ?? null,
          client_postal: client?.postal_code ?? null,
          client_address: client?.address ?? null,
          notes: (inv.notes as string | null) ?? null,
          lines,
          summary: {
            subtotal_10: inv.subtotal_10 as number,
            subtotal_8: inv.subtotal_8 as number,
            tax_10: inv.tax_10 as number,
            tax_8: inv.tax_8 as number,
            total: inv.total as number,
          },
          company,
          stamp_url,
        }}
      />,
    )
    const fileName =
      (inv.pdf_path as string | null) ??
      `${(inv.issue_date as string).slice(0, 7)}/${invoiceId}.pdf`
    await supabase.storage
      .from(BUCKET)
      .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (inv.pdf_path !== fileName) {
      await supabase.from('keiri_invoices').update({ pdf_path: fileName }).eq('id', invoiceId)
    }
  }

  await sendInvoiceEmail({
    invoice: {
      invoice_number: inv.invoice_number as string,
      issue_date: inv.issue_date as string,
      due_date: (inv.due_date as string | null) ?? null,
      total: inv.total as number,
    },
    client: {
      name: client?.name ?? '',
      email: client?.email ?? null,
      contact_person: client?.contact_person ?? null,
    },
    pdfBuffer,
    lines: lines.map(l => ({ name: l.name, quantity: l.quantity, amount: l.amount })),
    to: override.to,
    subject: override.subject,
    body: override.body,
  })

  await supabase
    .from('keiri_invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', invoiceId)
}
