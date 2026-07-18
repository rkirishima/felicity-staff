import { requireKeiri } from '@/lib/auth/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

// /api/keiri/stripe-payouts-sync?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Stripe /v1/payouts を取得し、各 payout に紐づく balance_transactions を
// /v1/balance_transactions?payout=po_...&expand[]=data.source で取得して
// 手数料・売上総額を集計。さらに charge → payment_intent → keiri_stripe_line_items
// の税率構成で、売上・手数料・入金額を消費税率別 (8% / 10%) に按分して
// tax_breakdown (jsonb) に保存する。
//
// 按分ルール: 1つの決済に 8% と 10% の商品が混在する場合、その決済の
// 明細金額の比率で売上と手数料を配分。明細が未同期の決済は unknown に計上
// (→ 先に「この月を同期」で明細を生成してから入金同期する)。
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
  type: string // 'charge' | 'payment'(銀行振込等) | 'refund' | 'payment_refund' | 'stripe_fee' | 'adjustment' | 'payout_failure' | 'payout' | etc.
  created: number
  payout?: string
  source?: string | { object?: string; payment_intent?: string | null }
}

type RateKey = '8' | '10' | 'unknown'
type RateBucket = { gross: number; fee: number; net: number }
type TaxBreakdown = Record<RateKey, RateBucket> & { unmatched_charges: number }

const STRIPE_BASE = 'https://api.stripe.com/v1'

function basicAuth(key: string): string {
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64')
}

function jstDate(unixSec: number): string {
  return new Date((unixSec + 9 * 60 * 60) * 1000).toISOString().slice(0, 10)
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
    u.searchParams.append('expand[]', 'data.source')
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

function paymentIntentOf(tx: StripeBalanceTransaction): string | null {
  if (tx.source && typeof tx.source === 'object' && tx.source.payment_intent) {
    return tx.source.payment_intent
  }
  return null
}

// 決済(payment_intent)ごとの税率別ウェイト。明細金額から算出。
type PiWeights = { w8: number; w10: number; wUnknown: number }

function emptyBreakdown(): TaxBreakdown {
  return {
    '8': { gross: 0, fee: 0, net: 0 },
    '10': { gross: 0, fee: 0, net: 0 },
    unknown: { gross: 0, fee: 0, net: 0 },
    unmatched_charges: 0,
  }
}

// amount を w8/w10 の比率で按分。端数は unknown ではなく大きい方に寄せず、
// 8% → round、10% → round、残差を unknown に入れて合計を必ず一致させる。
function allocate(amount: number, w: PiWeights): Record<RateKey, number> {
  const a8 = Math.round(amount * w.w8)
  const a10 = Math.round(amount * w.w10)
  return { '8': a8, '10': a10, unknown: amount - a8 - a10 }
}

export async function GET(req: Request): Promise<Response> {
  const _denied = await requireKeiri(); if (_denied) return _denied
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

  // payout ごとの balance transactions を先に全部取り、含まれる payment_intent を集める
  const txsByPayout = new Map<string, StripeBalanceTransaction[]>()
  const allPiIds = new Set<string>()
  for (const p of payouts) {
    try {
      const txs = await stripeListBalanceTxs(key, p.id)
      txsByPayout.set(p.id, txs)
      for (const t of txs) {
        const pi = paymentIntentOf(t)
        if (pi) allPiIds.add(pi)
      }
    } catch {
      // ignore individual payout balance fetch failure
    }
    await new Promise(r => setTimeout(r, 50))
  }

  // 明細から決済ごとの税率ウェイトを構築 (order_id = payment_intent id)
  const piWeights = new Map<string, PiWeights>()
  if (allPiIds.size > 0) {
    const ids = Array.from(allPiIds)
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { data: lis } = await sb
        .from('keiri_stripe_line_items')
        .select('order_id, amount, tax_rate')
        .in('order_id', chunk)
      for (const li of (lis ?? []) as { order_id: string; amount: number; tax_rate: number | null }[]) {
        const cur = piWeights.get(li.order_id) ?? { w8: 0, w10: 0, wUnknown: 0 }
        if (li.tax_rate === 8) cur.w8 += li.amount
        else if (li.tax_rate === 10) cur.w10 += li.amount
        else cur.wUnknown += li.amount
        piWeights.set(li.order_id, cur)
      }
    }
    // 金額 → 比率に正規化
    for (const [pi, w] of piWeights) {
      const total = w.w8 + w.w10 + w.wUnknown
      if (total > 0) {
        piWeights.set(pi, { w8: w.w8 / total, w10: w.w10 / total, wUnknown: w.wUnknown / total })
      }
    }
  }

  const rows: Record<string, unknown>[] = []

  for (const p of payouts) {
    let fee = 0
    let grossAmount = p.amount
    let chargeCount = 0
    let refundCount = 0
    let periodStart: string | null = null
    let periodEnd: string | null = null
    const breakdown = emptyBreakdown()

    const txs = txsByPayout.get(p.id)
    if (txs) {
      let chargeSum = 0
      let refundSum = 0
      let feeSum = 0
      let minAt: number | null = null
      let maxAt: number | null = null
      for (const t of txs) {
        if (t.type === 'payout') continue // ignore the payout itself
        if (minAt === null || t.created < minAt) minAt = t.created
        if (maxAt === null || t.created > maxAt) maxAt = t.created

        // 売上系: card は 'charge'、銀行振込/Link 等は 'payment' (source py_...)
        const isSale = t.type === 'charge' || t.type === 'payment'
        const isRefund = t.type === 'refund' || t.type === 'payment_refund'

        if (isSale) {
          chargeSum += t.amount
          chargeCount++
        } else if (isRefund) {
          refundSum += t.amount
          refundCount++
        }

        if (isSale || isRefund) {
          feeSum += t.fee
          // 税率別按分 (refund は負額で減算される)
          const pi = paymentIntentOf(t)
          const w = pi ? piWeights.get(pi) : undefined
          if (w) {
            const g = allocate(t.amount, w)
            const f = allocate(t.fee, w)
            for (const k of ['8', '10', 'unknown'] as RateKey[]) {
              breakdown[k].gross += g[k]
              breakdown[k].fee += f[k]
            }
          } else {
            breakdown.unknown.gross += t.amount
            breakdown.unknown.fee += t.fee
            breakdown.unmatched_charges++
          }
        } else if (t.amount < 0) {
          // Radar 等の stripe_fee / JCT adjustment: 控除額として手数料側に計上
          feeSum += -t.amount + t.fee
          breakdown.unknown.fee += -t.amount + t.fee
        } else {
          // payout_failure (入金失敗の戻り) 等の入出金調整: 売上ではないので unknown に計上
          feeSum += t.fee
          breakdown.unknown.gross += t.amount
          breakdown.unknown.fee += t.fee
        }
      }
      fee = feeSum
      grossAmount = chargeSum + refundSum // refund is negative; net of refunds
      if (minAt !== null) periodStart = jstDate(minAt)
      if (maxAt !== null) periodEnd = jstDate(maxAt)
    }
    for (const k of ['8', '10', 'unknown'] as RateKey[]) {
      breakdown[k].net = breakdown[k].gross - breakdown[k].fee
    }

    rows.push({
      payout_id: p.id,
      status: p.status,
      arrival_date: jstDate(p.arrival_date),
      initiated_at: new Date(p.created * 1000).toISOString(),
      amount: p.amount,
      fee_amount: fee,
      gross_amount: grossAmount || p.amount,
      charge_count: chargeCount,
      refund_count: refundCount,
      period_start: periodStart,
      period_end: periodEnd,
      destination_bank_last4: null,
      tax_breakdown: breakdown,
      raw: p,
      synced_at: new Date().toISOString(),
    })
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
    unmatchedCharges: rows.reduce(
      (s, r) => s + ((r.tax_breakdown as TaxBreakdown | null)?.unmatched_charges ?? 0),
      0,
    ),
  })
}
