import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

type SquarePayment = {
  status: string
  total_money?: { amount: number; currency: string }
  created_at: string
}

export async function GET(req: Request): Promise<Response> {
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not set' }, { status: 503 })
  }

  const url = new URL(req.url)
  // default: go back 36 months from current month
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 7)
  const fromYearMonth = url.searchParams.get('from') ?? defaultFrom
  const beginTime = new Date(fromYearMonth + '-01T00:00:00+09:00').toISOString()

  const allPayments: SquarePayment[] = []
  let cursor: string | undefined
  let pages = 0

  try {
    do {
      const u = new URL('https://connect.squareup.com/v2/payments')
      u.searchParams.set('begin_time', beginTime)
      u.searchParams.set('limit', '100')
      u.searchParams.set('sort_order', 'ASC')
      if (cursor) u.searchParams.set('cursor', cursor)

      const res = await fetch(u.toString(), {
        headers: {
          'Square-Version': '2024-01-18',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json(
          { error: 'Square API failed', detail: err, page: pages },
          { status: 500 },
        )
      }
      const data = (await res.json()) as { payments?: SquarePayment[]; cursor?: string }
      if (data.payments) allPayments.push(...data.payments)
      cursor = data.cursor
      pages++
      if (pages > 200) break // safety guard (~20000 payments)
    } while (cursor)
  } catch (e) {
    return NextResponse.json(
      { error: 'Square fetch error', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const completed = allPayments.filter(p => p.status === 'COMPLETED')

  // Group by JST year_month
  const byMonth = new Map<string, { amount: number; count: number }>()
  for (const p of completed) {
    const dJST = new Date(new Date(p.created_at).getTime() + 9 * 60 * 60 * 1000)
    const ym = dJST.toISOString().slice(0, 7)
    const cur = byMonth.get(ym) ?? { amount: 0, count: 0 }
    cur.amount += p.total_money?.amount ?? 0
    cur.count += 1
    byMonth.set(ym, cur)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }

  const sb = createClient(supabaseUrl, serviceKey)

  const rows = Array.from(byMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([ym, v]) => ({
      year_month: ym,
      source: 'square',
      amount: v.amount,
      transaction_count: v.count,
      last_synced_at: new Date().toISOString(),
    }))

  const { error } = await sb
    .from('monthly_revenue')
    .upsert(rows, { onConflict: 'year_month,source' })

  if (error) {
    return NextResponse.json(
      { error: error.message, detail: 'monthly_revenue upsert failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    fromYearMonth,
    pages,
    totalPaymentsFetched: allPayments.length,
    completed: completed.length,
    monthsSynced: rows.length,
    breakdown: Object.fromEntries(byMonth),
  })
}
