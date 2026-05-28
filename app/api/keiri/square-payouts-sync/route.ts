import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

// /api/keiri/square-payouts-sync?from=YYYY-MM-DD&to=YYYY-MM-DD
// Square /v2/payouts を取得して keiri_square_payouts に upsert。
// 銀行振込（入金）の金額・差引手数料・対象期間を税理士提出用に保存する。

type SquareMoney = { amount: number; currency: string }
type SquarePayout = {
  id: string
  status: string
  type?: string
  destination?: { id?: string; type?: string }
  amount_money?: SquareMoney
  // GET /v2/payouts/{id}/details で fee も取れるが、v2/payouts のリスト応答にも
  // 部分的な fee_amount_money が含まれることが多い。
  // ない場合は payout_entries から合算する。
  arrival_date?: string
  created_at?: string
  updated_at?: string
}

type SquarePayoutEntry = {
  id: string
  payout_id: string
  effective_at: string
  type: string
  gross_amount_money?: SquareMoney
  fee_amount_money?: SquareMoney
  net_amount_money?: SquareMoney
}

const SQUARE_API_HEADERS = (token: string) => ({
  'Square-Version': '2024-01-18',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

async function listPayouts(token: string, beginIso: string, endIso: string): Promise<SquarePayout[]> {
  const out: SquarePayout[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const u = new URL('https://connect.squareup.com/v2/payouts')
    u.searchParams.set('begin_time', beginIso)
    u.searchParams.set('end_time', endIso)
    u.searchParams.set('limit', '100')
    if (cursor) u.searchParams.set('cursor', cursor)
    const res = await fetch(u.toString(), { headers: SQUARE_API_HEADERS(token) })
    if (!res.ok) throw new Error(`square payouts list ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { payouts?: SquarePayout[]; cursor?: string }
    if (data.payouts) out.push(...data.payouts)
    cursor = data.cursor
    pages++
    if (pages > 50) break
  } while (cursor)
  return out
}

async function listPayoutEntries(token: string, payoutId: string): Promise<SquarePayoutEntry[]> {
  const out: SquarePayoutEntry[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const u = new URL(`https://connect.squareup.com/v2/payouts/${payoutId}/payout-entries`)
    u.searchParams.set('limit', '100')
    if (cursor) u.searchParams.set('cursor', cursor)
    const res = await fetch(u.toString(), { headers: SQUARE_API_HEADERS(token) })
    if (!res.ok) throw new Error(`square payout-entries ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { payout_entries?: SquarePayoutEntry[]; cursor?: string }
    if (data.payout_entries) out.push(...data.payout_entries)
    cursor = data.cursor
    pages++
    if (pages > 30) break
  } while (cursor)
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
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const defaultFrom = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() - 3, 1))
    .toISOString()
    .slice(0, 10)
  const from = url.searchParams.get('from') ?? defaultFrom
  const to = url.searchParams.get('to') ?? new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  const beginIso = new Date(from + 'T00:00:00+09:00').toISOString()
  const endIso = new Date(to + 'T00:00:00+09:00').toISOString()

  let payouts: SquarePayout[]
  try {
    payouts = await listPayouts(token, beginIso, endIso)
  } catch (e) {
    return NextResponse.json(
      { error: 'square payouts fetch failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }

  const sb = createClient(supabaseUrl, serviceKey)

  const rows: Record<string, unknown>[] = []
  let withFeeFromEntries = 0
  for (const p of payouts) {
    const gross = p.amount_money?.amount ?? 0
    let fee = 0
    let net = gross
    let periodStart: string | null = null
    let periodEnd: string | null = null

    // Fetch entries to derive fee + period
    try {
      const entries = await listPayoutEntries(token, p.id)
      if (entries.length > 0) {
        let grossSum = 0
        let feeSum = 0
        let netSum = 0
        let minAt: string | null = null
        let maxAt: string | null = null
        for (const e of entries) {
          grossSum += e.gross_amount_money?.amount ?? 0
          feeSum += Math.abs(e.fee_amount_money?.amount ?? 0)
          netSum += e.net_amount_money?.amount ?? 0
          if (!minAt || e.effective_at < minAt) minAt = e.effective_at
          if (!maxAt || e.effective_at > maxAt) maxAt = e.effective_at
        }
        fee = feeSum
        net = netSum || (grossSum - feeSum)
        // override gross with entry sum if it matches better
        if (grossSum > 0) {
          // keep p.amount_money as net (actual deposit)
        }
        if (minAt) periodStart = minAt.slice(0, 10)
        if (maxAt) periodEnd = maxAt.slice(0, 10)
        withFeeFromEntries++
      }
    } catch {
      // ignore entry fetch failure for individual payout
    }

    rows.push({
      payout_id: p.id,
      status: p.status,
      initiated_at: p.created_at ?? null,
      completed_at: p.arrival_date ? new Date(p.arrival_date + 'T00:00:00+09:00').toISOString() : (p.updated_at ?? null),
      amount: gross,        // gross from payout list = actual deposit amount (net of fee)
      fee_amount: fee,
      gross_amount: gross + fee, // total Square processed before fee
      period_start: periodStart,
      period_end: periodEnd,
      bank_account_last4: null,
      raw: p,
      synced_at: new Date().toISOString(),
    })
    // small delay to avoid rate-limit on Square API
    await new Promise(r => setTimeout(r, 50))
  }

  if (rows.length > 0) {
    const { error } = await sb
      .from('keiri_square_payouts')
      .upsert(rows, { onConflict: 'payout_id' })
    if (error) {
      return NextResponse.json(
        { error: error.message, detail: 'keiri_square_payouts upsert failed' },
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
    withFeeFromEntries,
  })
}
