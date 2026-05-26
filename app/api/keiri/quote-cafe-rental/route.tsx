import { renderToBuffer } from '@react-pdf/renderer'
import { getCompanyInfo } from '@/lib/keiri/company'
import { getCompanySealDataUri } from '@/lib/keiri/stamps'
import { InvoicePDF, type InvoicePDFLine } from '@/components/keiri/InvoicePDF'

export const runtime = 'nodejs'
export const maxDuration = 30

// 一回限り発行用：カフェ貸切見積書（7/2 7:00-14:00、¥8,000/時 × 7時間）
// ?client=お客様名 で宛先指定可能。未指定は「ご担当者」。
// ?contact=ご担当者名 で担当者名追加可能。
// ?date=YYYY-MM-DD で発行日上書き可能（デフォルト：今日）。
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const client = url.searchParams.get('client') || 'お客様'
  const contact = url.searchParams.get('contact')
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const issueDate = url.searchParams.get('date') || today
  const expiryDate = url.searchParams.get('expiry') || '2026-06-25'

  const company = getCompanyInfo()
  const stamp_url = await getCompanySealDataUri()

  const HOURS = 7
  const RATE = 8000
  const subtotal = HOURS * RATE // 56,000
  const tax = Math.round(subtotal * 0.1) // 5,600
  const total = subtotal + tax // 61,600

  const lines: InvoicePDFLine[] = [
    {
      name: 'カフェ貸切利用料（2026年7月2日 7:00〜14:00）',
      quantity: HOURS,
      unit_price: RATE,
      tax_rate: 10,
      amount: subtotal,
    },
  ]

  const buffer = await renderToBuffer(
    <InvoicePDF
      data={{
        documentType: 'quote',
        invoice_number: null,
        issue_date: issueDate,
        due_date: null,
        expiry_date: expiryDate,
        client_name: client,
        client_contact: contact ?? null,
        client_postal: null,
        client_address: null,
        notes:
          '・貸切時間：2026年7月2日（木）7:00〜14:00（7時間）\n' +
          '・料金：¥8,000 / 時（税抜）\n' +
          '・キャンセル規定：開催3日前までは無料、以降は全額\n' +
          '・お支払い：当日現金 または 銀行振込\n' +
          '・備品・電源使用無料。飲食物の持込はご相談ください。',
        lines,
        summary: {
          subtotal_10: subtotal,
          subtotal_8: 0,
          tax_10: tax,
          tax_8: 0,
          total,
        },
        company,
        stamp_url,
        showBank: true,
      }}
    />,
  )

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="quote-cafe-rental-2026-07-02.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
