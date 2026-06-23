import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { getCompanyInfo } from '@/lib/keiri/company'
import { getCompanySealDataUri } from '@/lib/keiri/stamps'
import { InvoicePDF, type InvoicePDFLine } from '@/components/keiri/InvoicePDF'

export const runtime = 'nodejs'
export const maxDuration = 30

const BUCKET = 'keiri-invoices'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params
  const url = new URL(req.url)
  const regenerate = url.searchParams.get('regenerate') === '1'

  const supabase = createServiceClient()

  const { data: inv, error } = await supabase
    .from('keiri_invoices')
    .select(
      'id, invoice_number, status, issue_date, due_date, subtotal_10, subtotal_8, tax_10, tax_8, total, notes, pdf_path, client:keiri_clients(name, contact_person, postal_code, address)',
    )
    .eq('id', id)
    .single()
  if (error || !inv) return new Response('not found', { status: 404 })

  if (!regenerate && inv.pdf_path) {
    const { data: file } = await supabase.storage.from(BUCKET).download(inv.pdf_path)
    if (file) {
      const ab = await file.arrayBuffer()
      return new Response(ab, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'cache-control': 'private, no-store',
        },
      })
    }
  }

  const { data: lineRows, error: linesErr } = await supabase
    .from('keiri_invoice_lines')
    .select('description, quantity, unit_price, tax_rate, amount, sort_order')
    .eq('invoice_id', id)
    .order('sort_order')
  if (linesErr) return new Response(linesErr.message, { status: 500 })

  const company = getCompanyInfo()
  const stamp_url = await getCompanySealDataUri()
  const lines: InvoicePDFLine[] = (lineRows ?? []).map(l => ({
    name: l.description as string,
    quantity: l.quantity as number,
    unit_price: l.unit_price as number,
    tax_rate: ((l.tax_rate as number) === 8 ? 8 : (l.tax_rate as number) === 0 ? 0 : 10) as 10 | 8 | 0,
    amount: l.amount as number,
  }))

  const client = (inv.client as unknown as { name: string; contact_person: string | null; postal_code: string | null; address: string | null } | null) ?? null
  const buffer = await renderToBuffer(
    <InvoicePDF
      data={{
        invoice_number: (inv.invoice_number as string | null) ?? null,
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
    inv.pdf_path && typeof inv.pdf_path === 'string'
      ? (inv.pdf_path as string)
      : `${(inv.issue_date as string).slice(0, 7)}/${id}.pdf`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })
  if (upErr) return new Response(upErr.message, { status: 500 })

  if (inv.pdf_path !== fileName) {
    await supabase.from('keiri_invoices').update({ pdf_path: fileName }).eq('id', id)
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'cache-control': 'private, no-store',
    },
  })
}
