import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { getCompanyInfo } from '@/lib/keiri/company'
import { StripePayoutsPDF, type PayoutForPDF, type StripePayoutsPDFInput } from '@/components/keiri/StripePayoutsPDF'

export const runtime = 'nodejs'
export const maxDuration = 30

// /api/keiri/stripe-payouts/pdf?month=YYYY-MM
// Stripe 週次入金の税率別内訳 (売上高・手数料・差引入金額) を月単位のPDFで返す。
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response('month must be YYYY-MM', { status: 400 })
  }
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const start = `${month}-01`
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const end = `${nextMonth}-01`

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('keiri_stripe_payouts')
    .select('payout_id, arrival_date, amount, fee_amount, gross_amount, charge_count, refund_count, period_start, period_end, tax_breakdown')
    .gte('arrival_date', start)
    .lt('arrival_date', end)
    .order('arrival_date')
  if (error) {
    return new Response(`payouts fetch failed: ${error.message}`, { status: 500 })
  }

  const input: StripePayoutsPDFInput = {
    month,
    generatedAt: new Date().toISOString(),
    company: getCompanyInfo(),
    payouts: (data ?? []) as PayoutForPDF[],
  }

  const buffer = await renderToBuffer(<StripePayoutsPDF data={input} />)
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="felicity-stripe-payouts-${month}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
