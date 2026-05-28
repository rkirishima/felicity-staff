import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { getCompanyInfo } from '@/lib/keiri/company'
import { effectiveRevenueCategory } from '@/lib/keiri/classifyRevenue'
import { loadSquareOverrides } from '@/lib/keiri/loadSquareOverrides'
import { TaxReportPDF, type TaxReportPDFInput } from '@/components/keiri/TaxReportPDF'

export const runtime = 'nodejs'
export const maxDuration = 30

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
  const beginIso = new Date(`${month}-01T00:00:00+09:00`).toISOString()
  const endIso = new Date(`${nextMonth}-01T00:00:00+09:00`).toISOString()

  const sb = createServiceClient()
  const overrides = await loadSquareOverrides(sb)

  const [sqRes, stripeRes, invRes, expRes, bankRes, ordRes] = await Promise.all([
    sb.from('keiri_square_line_items')
      .select('tax_rate, category, item_name, gross_amount')
      .gte('date', start).lt('date', end),
    sb.from('keiri_stripe_line_items')
      .select('tax_rate, amount')
      .gte('date', start).lt('date', end),
    sb.from('keiri_invoices')
      .select('subtotal_10, subtotal_8, total')
      .eq('status', 'paid')
      .gte('paid_at', beginIso).lt('paid_at', endIso),
    sb.from('keiri_transactions')
      .select('amount')
      .eq('type', 'expense')
      .gte('date', start).lt('date', end),
    sb.from('keiri_bank_transactions')
      .select('debit, credit')
      .gte('date', start).lt('date', end),
    sb.from('orders')
      .select('amount, status')
      .in('status', ['paid', 'shipped', 'completed'])
      .gte('created_at', beginIso).lt('created_at', endIso),
  ])

  type SqLine = { tax_rate: number | null; category: string | null; item_name: string | null; gross_amount: number }
  type StripeLine = { tax_rate: number | null; amount: number }
  type Inv = { subtotal_10: number | null; subtotal_8: number | null; total: number }
  type Exp = { amount: number }
  type Bank = { debit: number | null; credit: number | null }
  type Ord = { amount: number }

  const buckets = { dine_in_10: 0, goods_10: 0, beans_8: 0, takeout_8: 0, unknown: 0 }
  for (const li of (sqRes.data ?? []) as SqLine[]) {
    const rc = effectiveRevenueCategory(
      { tax_rate: li.tax_rate, item_name: li.item_name, category: li.category },
      overrides,
    )
    buckets[rc] += li.gross_amount || 0
  }
  const stripeByRate = { '10': 0, '8': 0, unknown: 0 } as TaxReportPDFInput['stripeByRate']
  for (const li of (stripeRes.data ?? []) as StripeLine[]) {
    const k = li.tax_rate === 10 ? '10' : li.tax_rate === 8 ? '8' : 'unknown'
    stripeByRate[k] += li.amount || 0
  }
  const invoices = (invRes.data ?? []) as Inv[]
  const expenses = (expRes.data ?? []) as Exp[]
  const bank = (bankRes.data ?? []) as Bank[]
  const orders = (ordRes.data ?? []) as Ord[]

  const data: TaxReportPDFInput = {
    month,
    generatedAt: new Date().toISOString(),
    company: getCompanyInfo(),
    buckets,
    stripeByRate,
    invoice: {
      subtotal_10: invoices.reduce((s, i) => s + (i.subtotal_10 ?? 0), 0),
      subtotal_8: invoices.reduce((s, i) => s + (i.subtotal_8 ?? 0), 0),
      total: invoices.reduce((s, i) => s + (i.total ?? 0), 0),
      count: invoices.length,
    },
    expenses: {
      total: expenses.reduce((s, e) => s + (e.amount ?? 0), 0),
      count: expenses.length,
    },
    bank: {
      credit: bank.reduce((s, b) => s + (b.credit ?? 0), 0),
      debit: bank.reduce((s, b) => s + (b.debit ?? 0), 0),
      count: bank.length,
    },
    orderTotal: orders.reduce((s, o) => s + (o.amount ?? 0), 0),
    squareTotal: buckets.dine_in_10 + buckets.goods_10 + buckets.beans_8 + buckets.takeout_8 + buckets.unknown,
  }

  const buffer = await renderToBuffer(<TaxReportPDF data={data} />)

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="felicity-tax-report-${month}.pdf"`,
      'cache-control': 'private, no-store',
    },
  })
}
