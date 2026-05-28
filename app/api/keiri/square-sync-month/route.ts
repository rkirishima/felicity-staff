import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveRevenueCategory } from '@/lib/keiri/classifyRevenue'
import { loadSquareOverrides } from '@/lib/keiri/loadSquareOverrides'

export const runtime = 'nodejs'
export const maxDuration = 60

type SquareMoney = { amount: number; currency: string }
type SquareCardDetails = {
  card?: { card_brand?: string; last_4?: string }
}
type SquarePayment = {
  id: string
  status: string
  total_money?: SquareMoney
  created_at: string
  card_details?: SquareCardDetails
  order_id?: string
}

type SquareAppliedTax = {
  uid?: string
  tax_uid?: string
  applied_money?: SquareMoney
}

type SquareLineItem = {
  uid?: string
  name?: string
  variation_name?: string
  catalog_object_id?: string
  category_name?: string
  quantity?: string
  gross_sales_money?: SquareMoney
  total_tax_money?: SquareMoney
  applied_taxes?: SquareAppliedTax[]
}

type SquareOrderTax = {
  uid?: string
  name?: string
  percentage?: string
  type?: string
}

type SquareOrder = {
  id?: string
  line_items?: SquareLineItem[]
  taxes?: SquareOrderTax[]
}

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

const SQUARE_API_HEADERS = (token: string) => ({
  'Square-Version': '2024-01-18',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

async function batchRetrieveOrders(token: string, orderIds: string[]): Promise<SquareOrder[]> {
  if (orderIds.length === 0) return []
  const out: SquareOrder[] = []
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100)
    const res = await fetch('https://connect.squareup.com/v2/orders/batch-retrieve', {
      method: 'POST',
      headers: SQUARE_API_HEADERS(token),
      body: JSON.stringify({ order_ids: chunk }),
    })
    if (!res.ok) {
      throw new Error(`Square batch-retrieve failed: ${await res.text()}`)
    }
    const data = (await res.json()) as { orders?: SquareOrder[] }
    if (data.orders) out.push(...data.orders)
  }
  return out
}

export async function GET(req: Request): Promise<Response> {
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not set' }, { status: 503 })
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }

  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? thisMonthJST()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const beginTime = new Date(`${month}-01T00:00:00+09:00`).toISOString()
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const endTime = new Date(`${nextMonth}-01T00:00:00+09:00`).toISOString()

  const all: SquarePayment[] = []
  let cursor: string | undefined
  let pages = 0

  try {
    do {
      const u = new URL('https://connect.squareup.com/v2/payments')
      u.searchParams.set('begin_time', beginTime)
      u.searchParams.set('end_time', endTime)
      u.searchParams.set('limit', '100')
      u.searchParams.set('sort_order', 'ASC')
      if (cursor) u.searchParams.set('cursor', cursor)

      const res = await fetch(u.toString(), { headers: SQUARE_API_HEADERS(token) })
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json(
          { error: 'Square API failed', detail: err, page: pages },
          { status: 500 },
        )
      }
      const data = (await res.json()) as { payments?: SquarePayment[]; cursor?: string }
      if (data.payments) all.push(...data.payments)
      cursor = data.cursor
      pages++
      if (pages > 100) break
    } while (cursor)
  } catch (e) {
    return NextResponse.json(
      { error: 'Square fetch error', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const completed = all.filter(p => p.status === 'COMPLETED')

  const sb = createClient(supabaseUrl, serviceKey)
  const overrides = await loadSquareOverrides(sb)

  const paymentRows = completed.map(p => {
    const createdJst = new Date(new Date(p.created_at).getTime() + 9 * 60 * 60 * 1000)
    const dateJst = createdJst.toISOString().slice(0, 10)
    return {
      payment_id: p.id,
      created_at_jst: p.created_at,
      date: dateJst,
      amount: p.total_money?.amount ?? 0,
      status: p.status,
      card_brand: p.card_details?.card?.card_brand ?? null,
      last_4: p.card_details?.card?.last_4 ?? null,
      raw: p,
      synced_at: new Date().toISOString(),
    }
  })

  if (paymentRows.length > 0) {
    const { error: upErr } = await sb
      .from('keiri_square_payments')
      .upsert(paymentRows, { onConflict: 'payment_id' })
    if (upErr) {
      return NextResponse.json(
        { error: upErr.message, detail: 'keiri_square_payments upsert failed' },
        { status: 500 },
      )
    }
  }

  // Fetch Order objects for line-item-level data (tax classification)
  const orderIds = Array.from(new Set(completed.map(p => p.order_id).filter((x): x is string => !!x)))
  let lineItemsWritten = 0
  const taxBreakdown: Record<string, { gross: number; tax: number; count: number }> = {}

  try {
    const orders = await batchRetrieveOrders(token, orderIds)
    const paymentByOrder = new Map<string, SquarePayment>()
    for (const p of completed) if (p.order_id) paymentByOrder.set(p.order_id, p)

    const lineRows: Record<string, unknown>[] = []
    for (const order of orders) {
      if (!order.id) continue
      const payment = paymentByOrder.get(order.id)
      const created = payment?.created_at ?? new Date().toISOString()
      const createdJst = new Date(new Date(created).getTime() + 9 * 60 * 60 * 1000)
      const dateJst = createdJst.toISOString().slice(0, 10)

      const taxByUid = new Map<string, SquareOrderTax>()
      for (const t of order.taxes ?? []) if (t.uid) taxByUid.set(t.uid, t)

      const items = order.line_items ?? []
      for (const li of items) {
        let taxRate: number | null = null
        for (const at of li.applied_taxes ?? []) {
          const t = taxByUid.get(at.tax_uid ?? at.uid ?? '')
          if (t?.percentage) {
            const pct = parseFloat(t.percentage)
            if (!Number.isNaN(pct)) taxRate = Math.round(pct)
          }
          if (taxRate !== null) break
        }
        const gross = li.gross_sales_money?.amount ?? 0
        const taxAmt = li.total_tax_money?.amount ?? 0

        if (taxRate !== null) {
          const key = String(taxRate)
          const cur = taxBreakdown[key] ?? { gross: 0, tax: 0, count: 0 }
          cur.gross += gross
          cur.tax += taxAmt
          cur.count += 1
          taxBreakdown[key] = cur
        }

        const revenue_category = effectiveRevenueCategory(
          {
            tax_rate: taxRate,
            item_name: li.name ?? null,
            category: li.category_name ?? null,
          },
          overrides,
        )

        lineRows.push({
          order_id: order.id,
          payment_id: payment?.id ?? null,
          line_uid: li.uid ?? null,
          item_name: li.name ?? null,
          variation_name: li.variation_name ?? null,
          catalog_object_id: li.catalog_object_id ?? null,
          category: li.category_name ?? null,
          quantity: li.quantity ? parseFloat(li.quantity) : 1,
          gross_amount: gross,
          tax_amount: taxAmt,
          tax_rate: taxRate,
          revenue_category,
          date: dateJst,
          created_at_jst: created,
          raw: li,
          synced_at: new Date().toISOString(),
        })
      }
    }

    // Add synthetic line for every payment that Square didn't return line items
    // for, so the month total reconciles with sum of line items.
    const paymentsWithLines = new Set<string>()
    for (const r of lineRows) {
      const pid = (r as { payment_id?: string | null }).payment_id
      if (pid) paymentsWithLines.add(pid)
    }
    let syntheticAdded = 0
    for (const p of completed) {
      if (paymentsWithLines.has(p.id)) continue
      const createdJst = new Date(new Date(p.created_at).getTime() + 9 * 60 * 60 * 1000)
      const dateJst = createdJst.toISOString().slice(0, 10)
      const synthRC = effectiveRevenueCategory(
        { tax_rate: null, item_name: '(明細なし)', category: null },
        overrides,
      )
      lineRows.push({
        order_id: `synthetic_${p.id}`,
        payment_id: p.id,
        line_uid: 'synthetic_no_order',
        item_name: '(明細なし)',
        variation_name: null,
        catalog_object_id: null,
        category: null,
        quantity: 1,
        gross_amount: p.total_money?.amount ?? 0,
        tax_amount: 0,
        tax_rate: null,
        revenue_category: synthRC,
        date: dateJst,
        created_at_jst: p.created_at,
        raw: { synthetic: true, reason: 'no_line_items_from_square_api' },
        synced_at: new Date().toISOString(),
      })
      syntheticAdded++
    }

    if (lineRows.length > 0) {
      // Try upsert with revenue_category. If the column doesn't exist yet
      // (migration not applied), retry without it so sync still succeeds.
      let { error: lineErr } = await sb
        .from('keiri_square_line_items')
        .upsert(lineRows, { onConflict: 'order_id,line_uid' })
      if (lineErr && /revenue_category|column .* does not exist/i.test(lineErr.message)) {
        const lineRowsWithoutRC = lineRows.map(r => {
          const copy: Record<string, unknown> = { ...r }
          delete copy.revenue_category
          return copy
        })
        const retry = await sb
          .from('keiri_square_line_items')
          .upsert(lineRowsWithoutRC, { onConflict: 'order_id,line_uid' })
        lineErr = retry.error
      }
      if (lineErr) {
        return NextResponse.json(
          { error: lineErr.message, detail: 'keiri_square_line_items upsert failed' },
          { status: 500 },
        )
      }
      lineItemsWritten = lineRows.length
    }
  } catch (e) {
    return NextResponse.json(
      { error: 'Square orders fetch error', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const monthTotal = paymentRows.reduce((s, r) => s + r.amount, 0)
  const { error: mrErr } = await sb.from('monthly_revenue').upsert(
    [
      {
        year_month: month,
        source: 'square',
        amount: monthTotal,
        transaction_count: paymentRows.length,
        last_synced_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'year_month,source' },
  )
  if (mrErr) {
    return NextResponse.json(
      { error: mrErr.message, detail: 'monthly_revenue upsert failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    month,
    pages,
    fetched: all.length,
    completed: completed.length,
    monthTotal,
    orders: orderIds.length,
    lineItemsWritten,
    taxBreakdown,
  })
}
