import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { getCompanyInfo } from '@/lib/keiri/company'
import { ReceiptPDF } from '@/components/keiri/ReceiptPDF'
import { requireKeiri } from '@/lib/auth/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const BUCKET = 'keiri-issued-receipts'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const _denied = await requireKeiri(); if (_denied) return _denied
  const { id } = await ctx.params
  const url = new URL(req.url)
  const regenerate = url.searchParams.get('regenerate') === '1'

  const supabase = createServiceClient()

  const { data: row, error } = await supabase
    .from('keiri_receipts_issued')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !row) return new Response('not found', { status: 404 })

  if (!regenerate && row.pdf_path) {
    const { data: file } = await supabase.storage.from(BUCKET).download(row.pdf_path as string)
    if (file) {
      const ab = await file.arrayBuffer()
      return new Response(ab, {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'cache-control': 'private, no-store' },
      })
    }
  }

  const company = getCompanyInfo()
  const buffer = await renderToBuffer(
    <ReceiptPDF
      data={{
        receipt_number: row.receipt_number as string,
        issue_date: row.issue_date as string,
        client_name: row.client_name as string,
        amount: row.amount as number,
        exclTax: row.excl_tax as number,
        tax: row.tax as number,
        tax_rate: ((row.tax_rate as number) === 8 ? 8 : 10) as 10 | 8,
        purpose: (row.purpose as string | null) ?? null,
        payment_method: (row.payment_method as string | null) ?? null,
        company,
      }}
    />,
  )

  const fileName =
    (row.pdf_path as string | null) ?? `${(row.issue_date as string).slice(0, 7)}/${id}.pdf`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })
  if (upErr) return new Response(upErr.message, { status: 500 })

  if (row.pdf_path !== fileName) {
    await supabase.from('keiri_receipts_issued').update({ pdf_path: fileName }).eq('id', id)
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'cache-control': 'private, no-store' },
  })
}
