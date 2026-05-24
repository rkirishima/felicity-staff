/**
 * 焙煎ログを月次集計して請求書データを作る。compute_invoices.py のTS版。
 */

import { createClient as createServerClient } from '@supabase/supabase-js'

import {
  type BeanPriceRow,
  type BeanRow,
  type InvoiceLineItem,
  type MonthlyInvoiceData,
  type RoastLogRow,
  ROASTING_FEE_YEN_PER_KG,
  TAX_RATE,
} from './types'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE env vars missing')
  return createServerClient(url, key, { auth: { persistSession: false } })
}

/** その日付に有効な単価を返す(effective_from <= on_date のうち最新). */
function priceFor(prices: BeanPriceRow[], onDate: Date): number | null {
  const onIso = onDate.toISOString().slice(0, 10)
  const candidates = prices
    .filter((p) => p.effective_from <= onIso)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
  return candidates[0]?.yen_per_kg ?? null
}

/** JSTで(年, 月)を取り出す */
function ymJST(iso: string): { year: number; month: number } {
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return { year: jst.getUTCFullYear(), month: jst.getUTCMonth() + 1 }
}

/**
 * 指定年月の焙煎ログを集計して請求書データを作る。
 *
 * partialMonth=true なら月途中でも集計(発行日は呼び出し側で渡された日)。
 * partialMonth=false (デフォルト) は通常の月次cron想定。
 */
export async function buildMonthlyInvoiceData(opts: {
  year: number
  month: number
}): Promise<MonthlyInvoiceData> {
  const supabase = adminClient()

  // JSTでの月始/月末をUTCに変換してフィルタ
  const monthStartJst = new Date(Date.UTC(opts.year, opts.month - 1, 1) - 9 * 60 * 60 * 1000)
  const nextMonthStartJst = new Date(Date.UTC(opts.year, opts.month, 1) - 9 * 60 * 60 * 1000)

  const [{ data: beansData }, { data: pricesData }, { data: logsData }] = await Promise.all([
    supabase.from('roast_beans').select('id, display_name'),
    supabase.from('roast_bean_prices').select('bean_id, effective_from, yen_per_kg'),
    supabase
      .from('roast_logs')
      .select('id, roasted_at, bean_id, green_kg, bean_raw')
      .gte('roasted_at', monthStartJst.toISOString())
      .lt('roasted_at', nextMonthStartJst.toISOString())
      .order('roasted_at', { ascending: true }),
  ])

  const beans = new Map<string, BeanRow>()
  for (const b of (beansData ?? []) as BeanRow[]) beans.set(b.id, b)

  const pricesByBean = new Map<string, BeanPriceRow[]>()
  for (const p of (pricesData ?? []) as BeanPriceRow[]) {
    if (!pricesByBean.has(p.bean_id)) pricesByBean.set(p.bean_id, [])
    pricesByBean.get(p.bean_id)!.push(p)
  }

  const acc = new Map<string, InvoiceLineItem>() // bean_id → line
  for (const log of (logsData ?? []) as RoastLogRow[]) {
    if (!log.bean_id) continue
    const bean = beans.get(log.bean_id)
    if (!bean) continue
    const unit = priceFor(pricesByBean.get(log.bean_id) ?? [], new Date(log.roasted_at))
    if (unit === null) continue
    const cur = acc.get(log.bean_id) ?? {
      product: bean.display_name,
      bean_id: log.bean_id,
      batches: 0,
      kg: 0,
      green_unit_price: unit,
      green_amount: 0,
      roast_amount: 0,
    }
    cur.batches += 1
    cur.kg += Number(log.green_kg)
    cur.green_unit_price = unit // 後勝ち(月内で価格変動はほぼ無いはず)
    cur.green_amount = Math.round(cur.kg * unit)
    cur.roast_amount = Math.round(cur.kg * ROASTING_FEE_YEN_PER_KG)
    acc.set(log.bean_id, cur)
  }

  const items = Array.from(acc.values()).sort((a, b) => b.kg - a.kg)
  const bean_subtotal = items.reduce((s, i) => s + i.green_amount, 0)
  const roast_subtotal = items.reduce((s, i) => s + i.roast_amount, 0)
  const subtotal = bean_subtotal + roast_subtotal
  const tax = Math.floor(subtotal * TAX_RATE)
  const total = subtotal + tax

  return {
    year: opts.year,
    month: opts.month,
    items,
    bean_subtotal,
    roast_subtotal,
    subtotal,
    tax,
    total,
  }
}

// ymJST はあまり使われないが、将来ログを日付別に分けたいとき用にexport
export { ymJST, priceFor }
