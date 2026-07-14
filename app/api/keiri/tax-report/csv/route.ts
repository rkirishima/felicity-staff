import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { effectiveRevenueCategory, REVENUE_CATEGORY_LABEL } from '@/lib/keiri/classifyRevenue'
import { loadSquareOverrides } from '@/lib/keiri/loadSquareOverrides'

export const runtime = 'nodejs'
export const maxDuration = 30

// /api/keiri/tax-report/csv?month=YYYY-MM
// 税理士提出用の月次集計を1ファイルのCSVで返す。
// セクション構成:
//   1) 月次サマリー (4区分・Stripe・請求書・経費 トータル)
//   2) 店舗 Square 売上明細 (line items)
//   3) EC Stripe 売上明細 (line items)
//   4) 業販請求書 (paid invoices)
//   5) 経費明細 (keiri_transactions expense)
//   6) 銀行入出金 (keiri_bank_transactions)
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  const section = url.searchParams.get('section') // null = all sections
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const start = `${month}-01`
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const end = `${nextMonth}-01`
  const beginIso = new Date(`${month}-01T00:00:00+09:00`).toISOString()
  const endIso = new Date(`${nextMonth}-01T00:00:00+09:00`).toISOString()

  const sb = createServiceClient()
  const overrides = await loadSquareOverrides(sb)

  // Month-end snapshot date (last day of month)
  const monthEnd = new Date(`${nextMonth}-01T00:00:00+09:00`)
  monthEnd.setUTCDate(monthEnd.getUTCDate() - 1)
  const monthEndStr = monthEnd.toISOString().slice(0, 10)

  const [sqRes, stripeRes, invRes, expRes, bankRes, ordersRes, payoutsRes, stripePayoutsRes, invRes2] = await Promise.all([
    sb.from('keiri_square_line_items')
      .select('date, created_at_jst, item_name, variation_name, category, quantity, gross_amount, tax_amount, tax_rate, payment_id')
      .gte('date', start).lt('date', end)
      .order('created_at_jst'),
    sb.from('keiri_stripe_line_items')
      .select('date, created_at_jst, product_id, product_name, quantity, amount, tax_rate, classification, order_id')
      .gte('date', start).lt('date', end)
      .order('created_at_jst'),
    sb.from('keiri_invoices')
      .select('invoice_number, issue_date, paid_at, total, subtotal_10, subtotal_8, tax_10, tax_8, status, client:keiri_clients(name)')
      .eq('status', 'paid')
      .gte('paid_at', beginIso).lt('paid_at', endIso),
    sb.from('keiri_transactions')
      .select('date, vendor, description, amount, tax_amount, tax_category, payment_method, category:keiri_categories(name)')
      .eq('type', 'expense')
      .gte('date', start).lt('date', end)
      .order('date'),
    sb.from('keiri_bank_transactions')
      .select('date, description, debit, credit, balance')
      .gte('date', start).lt('date', end)
      .order('date'),
    sb.from('orders')
      .select('amount, status')
      .in('status', ['paid', 'shipped', 'completed'])
      .gte('created_at', beginIso).lt('created_at', endIso),
    sb.from('keiri_square_payouts')
      .select('payout_id, completed_at, amount, fee_amount, gross_amount, period_start, period_end, status')
      .gte('completed_at', beginIso).lt('completed_at', endIso)
      .order('completed_at'),
    sb.from('keiri_stripe_payouts')
      .select('payout_id, arrival_date, amount, fee_amount, gross_amount, charge_count, refund_count, period_start, period_end, status, tax_breakdown')
      .gte('arrival_date', start).lt('arrival_date', end)
      .order('arrival_date'),
    sb.from('keiri_inventory_snapshots')
      .select('item_name, category, unit_price, quantity, unit, note')
      .eq('snapshot_date', monthEndStr)
      .order('category')
      .order('item_name'),
  ])

  type SqLine = { date: string; created_at_jst: string; item_name: string | null; variation_name: string | null; category: string | null; quantity: number; gross_amount: number; tax_amount: number | null; tax_rate: number | null; payment_id: string | null }
  type StripeLine = { date: string; created_at_jst: string; product_id: string | null; product_name: string | null; quantity: number; amount: number; tax_rate: number | null; classification: string | null; order_id: string | null }
  type InvRow = { invoice_number: string | null; issue_date: string; paid_at: string | null; total: number; subtotal_10: number | null; subtotal_8: number | null; tax_10: number | null; tax_8: number | null; status: string; client: { name: string } | { name: string }[] | null }
  type ExpRow = { date: string; vendor: string | null; description: string | null; amount: number; tax_amount: number | null; tax_category: string | null; payment_method: string | null; category: { name: string } | { name: string }[] | null }
  type BankRow = { date: string; description: string; debit: number | null; credit: number | null; balance: number | null }

  const sqLines = (sqRes.data ?? []) as SqLine[]
  const stripeLines = (stripeRes.data ?? []) as StripeLine[]
  const invoices = (invRes.data ?? []) as InvRow[]
  const expenses = (expRes.data ?? []) as ExpRow[]
  const bank = (bankRes.data ?? []) as BankRow[]
  const orderTotal = (ordersRes.data ?? []).reduce((s: number, o: { amount?: number }) => s + (o.amount ?? 0), 0)
  type PayoutRow = { payout_id: string; completed_at: string | null; amount: number; fee_amount: number; gross_amount: number; period_start: string | null; period_end: string | null; status: string | null }
  type RateBucket = { gross: number; fee: number; net: number }
  type StripePayoutRow = { payout_id: string; arrival_date: string | null; amount: number; fee_amount: number; gross_amount: number; charge_count: number; refund_count: number; period_start: string | null; period_end: string | null; status: string | null; tax_breakdown: { '8'?: RateBucket; '10'?: RateBucket; unknown?: RateBucket } | null }
  type InvRow2 = { item_name: string; category: string; unit_price: number; quantity: number; unit: string | null; note: string | null }
  const payouts = (payoutsRes?.data ?? []) as PayoutRow[]
  const stripePayouts = (stripePayoutsRes?.data ?? []) as StripePayoutRow[]
  const inventory = (invRes2?.data ?? []) as InvRow2[]
  const invByCat = { ingredients: 0, goods: 0, supplies: 0 } as Record<string, number>
  for (const r of inventory) {
    invByCat[r.category] = (invByCat[r.category] ?? 0) + Math.round(r.unit_price * r.quantity)
  }
  const invTotalSum = invByCat.ingredients + invByCat.goods + invByCat.supplies
  const payoutTotal = payouts.reduce((s, p) => s + p.amount, 0)
  const feeTotal = payouts.reduce((s, p) => s + p.fee_amount, 0)
  const stripePayoutTotal = stripePayouts.reduce((s, p) => s + p.amount, 0)
  const stripeFeeTotal = stripePayouts.reduce((s, p) => s + p.fee_amount, 0)

  // 4-bucket totals
  const buckets = { dine_in_10: 0, goods_10: 0, beans_8: 0, takeout_8: 0, unknown: 0 }
  for (const li of sqLines) {
    const rc = effectiveRevenueCategory(
      { tax_rate: li.tax_rate, item_name: li.item_name, category: li.category },
      overrides,
    )
    buckets[rc] += li.gross_amount || 0
  }
  const stripeByRate: Record<string, number> = { '10': 0, '8': 0, unknown: 0 }
  for (const li of stripeLines) {
    const k = li.tax_rate === 10 ? '10' : li.tax_rate === 8 ? '8' : 'unknown'
    stripeByRate[k] += li.amount || 0
  }
  const inv10Sub = invoices.reduce((s, i) => s + (i.subtotal_10 ?? 0), 0)
  const inv8Sub = invoices.reduce((s, i) => s + (i.subtotal_8 ?? 0), 0)
  const invTotal = invoices.reduce((s, i) => s + (i.total ?? 0), 0)
  const expTotal = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
  const bankCredit = bank.reduce((s, b) => s + (b.credit ?? 0), 0)
  const bankDebit = bank.reduce((s, b) => s + (b.debit ?? 0), 0)

  const sqSub10Excl = buckets.dine_in_10 + buckets.goods_10
  const sqSub8Excl = buckets.beans_8 + buckets.takeout_8
  const sqTax10 = Math.round(sqSub10Excl * 0.10)
  const sqTax8 = Math.round(sqSub8Excl * 0.08)
  const sqSub10Incl = sqSub10Excl + sqTax10
  const sqSub8Incl = sqSub8Excl + sqTax8
  const sqTotalExcl = sqSub10Excl + sqSub8Excl + buckets.unknown
  const sqTotalIncl = sqSub10Incl + sqSub8Incl + buckets.unknown
  const sqTotal = sqTotalIncl // 売上合計には税込を採用 (税理士提出基準)

  // Build CSV
  const lines: string[] = []
  const push = (...cells: (string | number | null | undefined)[]) => lines.push(cells.map(escCsv).join(','))

  push(`【FELICITY 月次税務レポート】 ${month}${section ? ` — ${section}` : ''}`)
  push('')

  const want = (s: string) => !section || section === s
  let fileName = `felicity-tax-report-${month}.csv`
  if (section) fileName = `felicity-tax-report-${month}-${section}.csv`

  if (want('summary')) {
  push('1) 月次サマリー')
  push('項目', '金額')
  push('店舗 Square — 10% イートイン（税抜）', buckets.dine_in_10)
  push('店舗 Square — 10% 物販グッズ（税抜）', buckets.goods_10)
  push('店舗 Square — 10% 小計（税抜）', sqSub10Excl)
  push('店舗 Square — 10% 消費税', sqTax10)
  push('店舗 Square — 10% 小計（税込）', sqSub10Incl)
  push('店舗 Square — 8% 豆等の物販（税抜）', buckets.beans_8)
  push('店舗 Square — 8% テイクアウト（税抜）', buckets.takeout_8)
  push('店舗 Square — 8% 小計（税抜）', sqSub8Excl)
  push('店舗 Square — 8% 消費税', sqTax8)
  push('店舗 Square — 8% 小計（税込）', sqSub8Incl)
  push('店舗 Square — 未分類', buckets.unknown)
  push('店舗 Square 合計（税抜）', sqTotalExcl)
  push('店舗 Square 合計（税込）', sqTotalIncl)
  push('EC Stripe — 10%', stripeByRate['10'])
  push('EC Stripe — 8%', stripeByRate['8'])
  push('EC Stripe — 未分類', stripeByRate.unknown)
  push('EC Stripe 合計（注文ベース）', orderTotal)
  push('業販請求書 — 10% 税抜', inv10Sub)
  push('業販請求書 — 8% 税抜', inv8Sub)
  push('業販請求書 合計（税込）', invTotal)
  push('売上合計（Square + Stripe + 請求書）', sqTotal + orderTotal + invTotal)
  push('経費合計', expTotal)
  push('粗利', (sqTotal + orderTotal + invTotal) - expTotal)
  push('銀行入金合計（参考）', bankCredit)
  push('銀行出金合計（参考）', bankDebit)
  push('Square 入金（銀行振込実額）', payoutTotal)
  push('Square 手数料合計', feeTotal)
  push('Stripe 入金（銀行振込実額）', stripePayoutTotal)
  push('Stripe 手数料合計', stripeFeeTotal)
  push(`月末在庫（${monthEndStr} 時点）食材`, invByCat.ingredients)
  push(`月末在庫（${monthEndStr} 時点）グッズ`, invByCat.goods)
  push(`月末在庫（${monthEndStr} 時点）資材`, invByCat.supplies)
  push(`月末在庫 合計`, invTotalSum)
  push('')
  }

  if (want('square-lines')) {
  push('2) 店舗 Square 売上明細')
  push('日付', '時刻', '商品名', 'バリエーション', 'カテゴリ', '数量', '税抜金額', '消費税', '税率', '区分')
  for (const li of sqLines) {
    const rc = effectiveRevenueCategory(
      { tax_rate: li.tax_rate, item_name: li.item_name, category: li.category },
      overrides,
    )
    push(
      li.date,
      timeFromIso(li.created_at_jst),
      li.item_name,
      li.variation_name,
      li.category,
      li.quantity,
      li.gross_amount,
      li.tax_amount,
      li.tax_rate,
      REVENUE_CATEGORY_LABEL[rc],
    )
  }
  push('')
  }

  if (want('stripe-lines')) {
  push('3) EC Stripe 売上明細')
  push('日付', '時刻', '商品ID', '商品名', '数量', '金額', '税率', '分類')
  for (const li of stripeLines) {
    push(
      li.date,
      timeFromIso(li.created_at_jst),
      li.product_id,
      li.product_name,
      li.quantity,
      li.amount,
      li.tax_rate,
      li.classification,
    )
  }
  push('')
  }

  if (want('invoices')) {
  push('4) 業販請求書（入金確認済）')
  push('請求書番号', '発行日', '入金日', '請求先', '10%税抜', '8%税抜', '消費税10%', '消費税8%', '合計（税込）')
  for (const i of invoices) {
    const clientName = Array.isArray(i.client) ? i.client[0]?.name : i.client?.name
    push(
      i.invoice_number,
      i.issue_date,
      i.paid_at ? i.paid_at.slice(0, 10) : null,
      clientName ?? null,
      i.subtotal_10,
      i.subtotal_8,
      i.tax_10,
      i.tax_8,
      i.total,
    )
  }
  push('')
  }

  if (want('expenses')) {
  push('5) 経費明細')
  push('日付', '勘定科目', '取引先', '摘要', '金額', '消費税', '税区分', '支払方法')
  for (const e of expenses) {
    const catName = Array.isArray(e.category) ? e.category[0]?.name : e.category?.name
    push(
      e.date,
      catName ?? null,
      e.vendor,
      e.description,
      e.amount,
      e.tax_amount,
      e.tax_category,
      e.payment_method,
    )
  }
  push('')
  }

  if (want('bank')) {
  push('6) 銀行入出金（参考）')
  push('日付', '摘要', '出金', '入金', '残高')
  for (const b of bank) {
    push(b.date, b.description, b.debit, b.credit, b.balance)
  }
  push('')
  }
  push('')

  if (want('square-payouts')) {
  push('7) Square 入金（銀行振込・手数料）')
  push('Payout ID', '入金日', '対象期間 開始', '対象期間 終了', '売上総額', '手数料', '入金額（実額）', 'ステータス')
  for (const p of payouts) {
    push(
      p.payout_id,
      p.completed_at ? p.completed_at.slice(0, 10) : null,
      p.period_start,
      p.period_end,
      p.gross_amount,
      p.fee_amount,
      p.amount,
      p.status,
    )
  }
  push('')
  }

  if (want('stripe-payouts')) {
  push('8) Stripe 入金（銀行振込・手数料・税率別内訳）')
  push(
    'Payout ID', '入金日', '対象期間 開始', '対象期間 終了', '売上総額', '手数料', '入金額（実額）',
    '8% 売上', '8% 手数料', '8% 入金額',
    '10% 売上', '10% 手数料', '10% 入金額',
    '未分類・調整 売上', '未分類・調整 手数料', '未分類・調整 入金額',
    '決済件数', '返金件数', 'ステータス',
  )
  for (const p of stripePayouts) {
    const r8 = p.tax_breakdown?.['8'] ?? { gross: 0, fee: 0, net: 0 }
    const r10 = p.tax_breakdown?.['10'] ?? { gross: 0, fee: 0, net: 0 }
    const ru = p.tax_breakdown?.unknown ?? { gross: 0, fee: 0, net: 0 }
    push(
      p.payout_id,
      p.arrival_date,
      p.period_start,
      p.period_end,
      p.gross_amount,
      p.fee_amount,
      p.amount,
      r8.gross, r8.fee, r8.net,
      r10.gross, r10.fee, r10.net,
      ru.gross, ru.fee, ru.net,
      p.charge_count,
      p.refund_count,
      p.status,
    )
  }
  push('')
  }

  if (want('inventory')) {
  push(`9) 月末在庫（${monthEndStr} 時点）`)
  push('カテゴリ', '品名', '仕入単価', '残数', '単位', '小計', 'メモ')
  for (const r of inventory) {
    const catLabel = r.category === 'ingredients' ? '食材' : r.category === 'goods' ? 'グッズ' : '資材'
    push(
      catLabel,
      r.item_name,
      r.unit_price,
      r.quantity,
      r.unit,
      Math.round(r.unit_price * r.quantity),
      r.note,
    )
  }
  }

  // UTF-8 BOM so Excel opens with correct encoding
  const csv = '﻿' + lines.join('\r\n') + '\r\n'

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'private, no-store',
    },
  })
}

function timeFromIso(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function escCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
