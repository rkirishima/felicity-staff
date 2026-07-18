import { requireKeiri } from '@/lib/auth/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

type SquarePayment = {
  status: string
  total_money: { amount: number; currency: string }
  created_at: string
}

export async function GET(): Promise<Response> {
  const _denied = await requireKeiri(); if (_denied) return _denied
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not set' }, { status: 503 })
  }

  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayJST = nowJST.toISOString().slice(0, 10)
  const monthStart = todayJST.slice(0, 7) + '-01'
  const beginTime = new Date(monthStart + 'T00:00:00+09:00').toISOString()

  const allPayments: SquarePayment[] = []
  let cursor: string | undefined

  try {
    do {
      const url = new URL('https://connect.squareup.com/v2/payments')
      url.searchParams.set('begin_time', beginTime)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString(), {
        headers: {
          'Square-Version': '2024-01-18',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: 'Square API failed', detail: err }, { status: 500 })
      }
      const data = (await res.json()) as { payments?: SquarePayment[]; cursor?: string }
      if (data.payments) allPayments.push(...data.payments)
      cursor = data.cursor
    } while (cursor)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: 'Square fetch error', detail: msg }, { status: 500 })
  }

  const completed = allPayments.filter(p => p.status === 'COMPLETED')
  const todayTotal = completed
    .filter(p => {
      const dJST = new Date(new Date(p.created_at).getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      return dJST === todayJST
    })
    .reduce((s, p) => s + (p.total_money?.amount || 0), 0)
  const monthTotal = completed.reduce((s, p) => s + (p.total_money?.amount || 0), 0)

  return NextResponse.json({
    today: todayTotal,
    thisMonth: monthTotal,
    count: completed.length,
    asOf: new Date().toISOString(),
  })
}
