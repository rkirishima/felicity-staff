import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'

export const runtime = 'nodejs'
export const maxDuration = 30

// /api/keiri/stripe-payouts/csv?month=YYYY-MM
// Stripe 週次入金の税率別内訳を1入金=1行のCSVで返す (Excel向け BOM付きUTF-8)。
type RateBucket = { gross: number; fee: number; net: number }
type PayoutRow = {
  payout_id: string
  status: string | null
  arrival_date: string | null
  amount: number
  fee_amount: number
  gross_amount: number
  charge_count: number
  refund_count: number
  period_start: string | null
  period_end: string | null
  tax_breakdown: {
    '8'?: RateBucket
    '10'?: RateBucket
    unknown?: RateBucket
    unmatched_charges?: number
  } | null
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const start = `${month}-01`
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const end = `${nextMonth}-01`

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('keiri_stripe_payouts')
    .select('payout_id, status, arrival_date, amount, fee_amount, gross_amount, charge_count, refund_count, period_start, period_end, tax_breakdown')
    .gte('arrival_date', start)
    .lt('arrival_date', end)
    .order('arrival_date')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const payouts = (data ?? []) as PayoutRow[]

  const lines: string[] = []
  const push = (...cells: (string | number | null | undefined)[]) => lines.push(cells.map(escCsv).join(','))
  const b = (p: PayoutRow, k: '8' | '10' | 'unknown'): RateBucket =>
    p.tax_breakdown?.[k] ?? { gross: 0, fee: 0, net: 0 }

  push(`【FELICITY Stripe 入金レポート（税率別）】 ${month}`)
  push('※ 売上高は税込。8%/10%混在の決済は商品明細の金額比で按分。未分類・調整はRadar手数料・入金失敗の戻り等。')
  push('')
  push(
    '入金日', '対象期間 開始', '対象期間 終了', '決済件数', '返金件数',
    '売上総額', '手数料合計', '入金額（実額）',
    '8% 売上', '8% 手数料', '8% 入金額',
    '10% 売上', '10% 手数料', '10% 入金額',
    '未分類・調整 売上', '未分類・調整 手数料', '未分類・調整 入金額',
    'ステータス', 'Payout ID',
  )
  const tot = { gross: 0, fee: 0, amount: 0, g8: 0, f8: 0, n8: 0, g10: 0, f10: 0, n10: 0, gu: 0, fu: 0, nu: 0 }
  for (const p of payouts) {
    const r8 = b(p, '8')
    const r10 = b(p, '10')
    const ru = b(p, 'unknown')
    push(
      p.arrival_date, p.period_start, p.period_end, p.charge_count, p.refund_count,
      p.gross_amount, p.fee_amount, p.amount,
      r8.gross, r8.fee, r8.net,
      r10.gross, r10.fee, r10.net,
      ru.gross, ru.fee, ru.net,
      p.status, p.payout_id,
    )
    tot.gross += p.gross_amount; tot.fee += p.fee_amount; tot.amount += p.amount
    tot.g8 += r8.gross; tot.f8 += r8.fee; tot.n8 += r8.net
    tot.g10 += r10.gross; tot.f10 += r10.fee; tot.n10 += r10.net
    tot.gu += ru.gross; tot.fu += ru.fee; tot.nu += ru.net
  }
  push(
    '合計', null, null, null, null,
    tot.gross, tot.fee, tot.amount,
    tot.g8, tot.f8, tot.n8,
    tot.g10, tot.f10, tot.n10,
    tot.gu, tot.fu, tot.nu,
    null, null,
  )

  // UTF-8 BOM so Excel opens with correct encoding
  const csv = '﻿' + lines.join('\r\n') + '\r\n'
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="felicity-stripe-payouts-${month}.csv"`,
      'cache-control': 'private, no-store',
    },
  })
}

function escCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
