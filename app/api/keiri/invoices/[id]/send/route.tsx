import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { getCompanyInfo } from '@/lib/keiri/company'
import { getCompanySealDataUri } from '@/lib/keiri/stamps'
import { sendInvoiceEmail } from '@/lib/keiri/email'
import { InvoicePDF, type InvoicePDFLine } from '@/components/keiri/InvoicePDF'

export const runtime = 'nodejs'
export const maxDuration = 30

const BUCKET = 'keiri-invoices'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ ok: false, error: 'RESEND_API_KEY not set' }, { status: 503 })
  }

  const { id } = await ctx.params
  let body: { to?: string; subject?: string; body?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  const supabase = createServiceClient()

  const { data: inv, error } = await supabase
    .from('keiri_invoices')
    .select(
      'id, invoice_number, status, issue_date, due_date, subtotal_10, subtotal_8, tax_10, tax_8, total, notes, pdf_path, client:keiri_clients(name, postal_code, address, email)',
    )
    .eq('id', id)
    .single()
  if (error || !inv) {
    return Response.json({ ok: false, error: 'invoice not found' }, { status: 404 })
  }
  if (!inv.invoice_number) {
    return Response.json({ ok: false, error: '下書きは送信できません' }, { status: 400 })
  }

  const { data: lineRows, error: linesErr } = await supabase
    .from('keiri_invoice_lines')
    .select('description, quantity, unit_price, tax_rate, amount, sort_order')
    .eq('invoice_id', id)
    .order('sort_order')
  if (linesErr) return Response.json({ ok: false, error: linesErr.message }, { status: 500 })

  const company = getCompanyInfo()
  const stamp_url = await getCompanySealDataUri()
  const lines: InvoicePDFLine[] = (lineRows ?? []).map(l => ({
    name: l.description as string,
    quantity: l.quantity as number,
    unit_price: l.unit_price as number,
    tax_rate: ((l.tax_rate as number) === 8 ? 8 : 10) as 10 | 8,
    amount: l.amount as number,
  }))

  const client = (inv.client as unknown as { name: string; postal_code: string | null; address: string | null; email: string | null } | null) ?? null

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
    const fileName = (inv.pdf_path as string | null) ?? `${(inv.issue_date as string).slice(0, 7)}/${id}.pdf`
    await supabase.storage
      .from(BUCKET)
      .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (inv.pdf_path !== fileName) {
      await supabase.from('keiri_invoices').update({ pdf_path: fileName }).eq('id', id)
    }
  }

  try {
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
      },
      pdfBuffer,
      to: body.to,
      subject: body.subject,
      body: body.body,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }

  await supabase
    .from('keiri_invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)

  return Response.json({ ok: true })
}
