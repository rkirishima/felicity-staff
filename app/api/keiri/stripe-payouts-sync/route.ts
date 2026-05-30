import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

// /api/keiri/stripe-payouts-sync?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Stripe /v1/payouts を取得し、各 payout に紐づく balance_transactions を
// /v1/balance_transactions?payout=po_... で取得して手数料・売上総額を集計。
// keiri_stripe_payouts テーブルに upsert。
//
// env: STRIPE_SECRET_KEY 必須（felicity-staff Vercel に sk_live_... を設定）

type StripeMoney = number // in smallest unit (yen for JPY)

type StripePayout = {
  id: string
  amount: StripeMoney
  arrival_date: number // Unix timestamp
  created: number
  status: string
  type?: string
  method?: string
  destination?: string
  metadata?: Record<string, string>
}

type StripeBalanceTransaction = {
  id: string
  amount: StripeMoney
  fee: StripeMoney
  net: StripeMoney
  type: string // 'charge' | 'refund' | 'payout' | etc.
  created: number
  payout?: string
  source?: string
}

const STRIPE_BASE = 'https://api.stripe.com/v1'

function basicAuth(key: string): string {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64')
}

async function stripeListPayouts(
  key: string,
  arrivalDateGte: number,
  arrivalDateLt: number,
): Promise<StripePayout[]> {
  const out: StripePayout[] = []
  let starting_after: string | undefined
  let pages = 0
  do {
    const u = new URL(`${STRIPE_BASE}/payouts`)
    u.searchParams.set('limit', '100')
    u.searchParams.set('arrival_date[gte]', String(arrivalDateGte))
    u.searchParams.set('arrival_date[lt]', String(arrivalDateLt))
    if (starting_after) u.searchParams.set('starting_after', starting_after)
    const res = await fetch(u.toString(), {
      headers: { Authorization: basicAuth(key) },
    })
    if (!res.ok) throw new Error(`stripe payouts list ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { data: StripePayout[]; has_more: boolean }
    out.push(...data.data)
    starting_after = data.has_more ? data.data[data.data.length - 1]?.id : undefined
    pages++
    if (pages > 50) break
  } while (starting_after)
  return out
}

async function stripeListBalanceTxs(
  key: string,
  payoutId: string,
): Promise<StripeBalanceTransaction[]> {
  const out: StripeBalanceTransaction[] = []
  let starting_after: string | undefined
  let pages = 0
  do {
    const u = new URL(`${STRIPE_BASE}/balance_transactions`)
    u.searchParams.set('limit', '100')
    u.searchParams.set('payout', payoutId)
    if (starting_after) u.searchParams.set('starting_after', starting_after)
    const res = await fetch(u.toString(), {
      headers: { Authorization: basicAuth(key) },
    })
    if (!res.ok) throw new Error(`stripe balance_txs ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { data: StripeBalanceTransaction[]; has_more: boolean }
    out.push(...data.data)
    starting_after = data.has_more ? data.data[data.data.length - 1]?.id : undefined
    pages++
    if (pages > 30) break
  } while (starting_after)
  return out
}

export async function GET(req: Request): Promise<Response> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY not set in felicity-staff Vercel env' },
      { status: 503 },
    )
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }

  const url = new URL(req.url)
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const defaultFrom = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() - 3, 1))
    .toISOString()
    .slice(0, 10)
  const defaultTo = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10)
  const from = url.searchParams.get('from') ?? defaultFrom
  const to = url.searchParams.get('to') ?? defaultTo
  const arrivalGte = Math.floor(new Date(from + 'T00:00:00+09:00').getTime() / 1000)
  const arrivalLt = Math.floor(new Date(to + 'T00:00:00+09:00').getTime() / 1000)

  let payouts: StripePayout[]
  try {
    payouts = await stripeListPayouts(key, arrivalGte, arrivalLt)
  } catch (e) {
    return NextResponse.json(
      { error: 'stripe payouts fetch failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const sb = createClient(supabaseUrl, serviceKey)
  const rows: Record<string, unknown>[] = []

  for (const p of payouts) {
    let fee = 0
    let grossAmount = p.amount
    let chargeCount = 0
    let refundCount = 0
    let periodStart: string | null = null
    let periodEnd: string | null = null

    try {
      const txs = await stripeListBalanceTxs(key, p.id)
      let chargeSum = 0
      let refundSum = 0
      let feeSum = 0
      let minAt: number | null = null
      let maxAt: number | null = null
      for (const t of txs) {
        if (t.type === 'payout') continue // ignore the payout itself
        if (t.type === 'charge') {
          chargeSum += t.amount
          chargeCount++
        } else if (t.type === 'refund') {
          refundSum += t.amount
          refundCount++
        }
        feeSum += t.fee
        if (minAt === null || t.created < minAt) minAt = t.created
        if (maxAt === null || t.created > maxAt) maxAt = t.created
      }
      fee = feeSum
      grossAmount = chargeSum + refundSum // refund is negative; net of refunds
      if (minAt !== null) periodStart = new Date(minAt * 1000).toISOString().slice(0, 10)
      if (maxAt !== null) periodEnd = new Date(maxAt * 1000).toISOString().slice(0, 10)
    } catch {
      // ignore individual payout balance fetch failure
    }

    rows.push({
      payout_id: p.id,
      status: p.status,
      arrival_date: new Date(p.arrival_date * 1000).toISOString().slice(0, 10),
      initiated_at: new Date(p.created * 1000).toISOString(),
      amount: p.amount,
      fee_amount: fee,
      gross_amount: grossAmount || p.amount,
      charge_count: chargeCount,
      refund_count: refundCount,
      period_start: periodStart,
      period_end: periodEnd,
      destination_bank_last4: null,
      raw: p,
      synced_at: new Date().toISOString(),
    })
    await new Promise(r => setTimeout(r, 50))
  }

  if (rows.length > 0) {
    const { error } = await sb
      .from('keiri_stripe_payouts')
      .upsert(rows, { onConflict: 'payout_id' })
    if (error) {
      return NextResponse.json(
        { error: error.message, detail: 'keiri_stripe_payouts upsert failed' },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({
    ok: true,
    from,
    to,
    fetched: payouts.length,
    upserted: rows.length,
  })
}
