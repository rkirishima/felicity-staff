import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
}

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
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
      if (data.payments) all.push(...data.payments)
      cursor = data.cursor
      pages++
      if (pages > 100) break // safety guard
    } while (cursor)
  } catch (e) {
    return NextResponse.json(
      { error: 'Square fetch error', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const completed = all.filter(p => p.status === 'COMPLETED')

  const sb = createClient(supabaseUrl, serviceKey)

  const rows = completed.map(p => {
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

  if (rows.length > 0) {
    const { error: upErr } = await sb
      .from('keiri_square_payments')
      .upsert(rows, { onConflict: 'payment_id' })
    if (upErr) {
      return NextResponse.json(
        { error: upErr.message, detail: 'keiri_square_payments upsert failed' },
        { status: 500 },
      )
    }
  }

  const monthTotal = rows.reduce((s, r) => s + r.amount, 0)
  const { error: mrErr } = await sb.from('monthly_revenue').upsert(
    [
      {
        year_month: month,
        source: 'square',
        amount: monthTotal,
        transaction_count: rows.length,
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
  })
}
