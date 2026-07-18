'use client'
export const dynamic = 'force-dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { effectiveRevenueCategory, type RevenueCategory } from '@/lib/keiri/classifyRevenue'

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

function monthOptions(count = 36): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`
    list.push({ value, label })
  }
  return list
}

type Payment = {
  id: string
  payment_id: string
  date: string
  created_at_jst: string
  amount: number
  card_brand: string | null
  last_4: string | null
}

type LineItem = {
  id: string
  tax_rate: number | null
  category: string | null
  item_name: string | null
  variation_name: string | null
  payment_id: string | null
  gross_amount: number
  quantity: number
  date: string
  created_at_jst: string
}

type PayoutRow = {
  payout_id: string
  status: string | null
  completed_at: string | null
  amount: number
  fee_amount: number
  gross_amount: number
  period_start: string | null
  period_end: string | null
}

const REVENUE_LABEL: Record<string, string> = {
  dine_in_10: '🍽 10% イートイン',
  goods_10: '👕 10% 物販（グッズ）',
  beans_8: '☕ 8% 豆等の物販',
  takeout_8: '🥡 8% テイクアウト',
  unknown: '❓ 未分類',
}

type DayGroup = {
  date: string
  total: number
  count: number
  payments: Payment[]
}

export default function SquareSalesPage() {
  return (
    <Suspense fallback={<main className="min-h-screen pt-8 px-4" style={{ backgroundColor: '#F5F0E8' }}><p className="text-stone-400 text-sm text-center">読み込み中...</p></main>}>
      <SquareSalesInner />
    </Suspense>
  )
}

function SquareSalesInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const months = useMemo(() => monthOptions(36), [])
  const initialMonth = (() => {
    const q = searchParams.get('month')
    if (q && /^\d{4}-\d{2}$/.test(q)) return q
    return thisMonthJST()
  })()
  const [month, setMonth] = useState(initialMonth)
  const [payments, setPayments] = useState<Payment[]>([])
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [overrides, setOverrides] = useState<Map<string, RevenueCategory>>(new Map())
  const [payouts, setPayouts] = useState<PayoutRow[]>([])
  const [payoutPeriodLines, setPayoutPeriodLines] = useState<LineItem[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [monthTotalCached, setMonthTotalCached] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingPayouts, setSyncingPayouts] = useState(false)
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<'product' | 'payment'>('product')

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
    }
  }, [router])

  useEffect(() => {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [pRes, mrRes, liRes, ovRes, poRes] = await Promise.all([
        supabase
          .from('keiri_square_payments')
          .select('id, payment_id, date, created_at_jst, amount, card_brand, last_4')
          .gte('date', start)
          .lt('date', next)
          .order('created_at_jst', { ascending: false }),
        supabase
          .from('monthly_revenue')
          .select('amount, last_synced_at')
          .eq('year_month', month)
          .eq('source', 'square')
          .maybeSingle(),
        supabase
          .from('keiri_square_line_items')
          .select('id, tax_rate, category, item_name, variation_name, payment_id, gross_amount, quantity, date, created_at_jst')
          .gte('date', start)
          .lt('date', next)
          .order('created_at_jst', { ascending: false }),
        supabase
          .from('keiri_square_item_overrides')
          .select('item_name, revenue_category'),
        supabase
          .from('keiri_square_payouts')
          .select('payout_id, status, completed_at, amount, fee_amount, gross_amount, period_start, period_end')
          .gte('completed_at', new Date(`${start}T00:00:00+09:00`).toISOString())
          .lt('completed_at', new Date(`${next}T00:00:00+09:00`).toISOString())
          .order('completed_at', { ascending: false }),
      ])
      if (cancelled) return
      setPayments((pRes.data ?? []) as Payment[])
      setLineItems((liRes.data ?? []) as LineItem[])
      const ovMap = new Map<string, RevenueCategory>()
      for (const o of (ovRes?.data ?? []) as { item_name: string; revenue_category: string }[]) {
        ovMap.set(o.item_name, o.revenue_category as RevenueCategory)
      }
      setOverrides(ovMap)
      setPayouts((poRes?.data ?? []) as PayoutRow[])
      setMonthTotalCached((mrRes.data?.amount as number | undefined) ?? null)
      setLastSync((mrRes.data?.last_synced_at as string | undefined) ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [month, supabase, reload])

  // Fetch line items covering all payout periods (may extend outside the selected month)
  useEffect(() => {
    if (payouts.length === 0) {
      setPayoutPeriodLines([])
      return
    }
    const starts = payouts.map(p => p.period_start).filter((d): d is string => !!d)
    const ends = payouts.map(p => p.period_end).filter((d): d is string => !!d)
    if (starts.length === 0 || ends.length === 0) {
      setPayoutPeriodLines([])
      return
    }
    const minStart = starts.reduce((a, b) => (a < b ? a : b))
    const maxEnd = ends.reduce((a, b) => (a > b ? a : b))
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('keiri_square_line_items')
        .select('id, tax_rate, category, item_name, variation_name, payment_id, gross_amount, quantity, date, created_at_jst')
        .gte('date', minStart)
        .lte('date', maxEnd)
      if (cancelled) return
      setPayoutPeriodLines((data ?? []) as LineItem[])
    })()
    return () => {
      cancelled = true
    }
  }, [payouts, supabase])

  useEffect(() => {
    if (loading) return
    if (payments.length > 0 || monthTotalCached) return
    if (month !== thisMonthJST()) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('monthly_revenue')
        .select('year_month')
        .eq('source', 'square')
        .gt('amount', 0)
        .order('year_month', { ascending: false })
        .limit(1)
      if (cancelled) return
      const recent = data?.[0]?.year_month as string | undefined
      if (recent && recent !== month) setMonth(recent)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  async function syncMonth() {
    setSyncing(true)
    try {
      const res = await fetch(`/api/keiri/square-sync-month?month=${month}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(`同期失敗: ${data.error ?? 'unknown'}\n${data.detail ?? ''}`)
      } else {
        setReload(n => n + 1)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '同期失敗')
    } finally {
      setSyncing(false)
    }
  }

  async function syncPayouts() {
    setSyncingPayouts(true)
    try {
      const [y, m] = month.split('-').map(s => parseInt(s, 10))
      const from = `${month}-01`
      const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      const to = `${nextYm}-01`
      const res = await fetch(`/api/keiri/square-payouts-sync?from=${from}&to=${to}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(`入金同期失敗: ${data.error ?? 'unknown'}\n${data.detail ?? ''}`)
      } else {
        setReload(n => n + 1)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '入金同期失敗')
    } finally {
      setSyncingPayouts(false)
    }
  }

  const dayGroups: DayGroup[] = useMemo(() => {
    const map = new Map<string, DayGroup>()
    for (const p of payments) {
      const cur = map.get(p.date) ?? { date: p.date, total: 0, count: 0, payments: [] }
      cur.total += p.amount
      cur.count += 1
      cur.payments.push(p)
      map.set(p.date, cur)
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [payments])

  type ItemDayGroup = { date: string; total: number; count: number; items: LineItem[] }
  const itemDayGroups: ItemDayGroup[] = useMemo(() => {
    const map = new Map<string, ItemDayGroup>()
    for (const li of lineItems) {
      const cur = map.get(li.date) ?? { date: li.date, total: 0, count: 0, items: [] }
      cur.total += li.gross_amount || 0
      cur.count += 1
      cur.items.push(li)
      map.set(li.date, cur)
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [lineItems])

  const monthTotal = payments.reduce((s, p) => s + p.amount, 0)
  const monthCount = payments.length
  const showCachedFallback = monthCount === 0 && monthTotalCached !== null && monthTotalCached > 0

  // Group line items by payment_id for inline product display
  const linesByPayment = useMemo(() => {
    const map = new Map<string, LineItem[]>()
    for (const li of lineItems) {
      if (!li.payment_id) continue
      const arr = map.get(li.payment_id) ?? []
      arr.push(li)
      map.set(li.payment_id, arr)
    }
    return map
  }, [lineItems])

  type TaxBucket = { gross: number; count: number }
  const revenueBuckets: Record<string, TaxBucket> = {
    dine_in_10: { gross: 0, count: 0 },
    goods_10: { gross: 0, count: 0 },
    beans_8: { gross: 0, count: 0 },
    takeout_8: { gross: 0, count: 0 },
    unknown: { gross: 0, count: 0 },
  }
  const categoryBuckets = new Map<string, TaxBucket>()
  for (const li of lineItems) {
    const rc = effectiveRevenueCategory(
      { tax_rate: li.tax_rate, item_name: li.item_name, category: li.category },
      overrides,
    )
    const bucket = revenueBuckets[rc] ?? revenueBuckets.unknown
    bucket.gross += li.gross_amount || 0
    bucket.count += 1
    const cat = li.category ?? '未分類'
    const cur = categoryBuckets.get(cat) ?? { gross: 0, count: 0 }
    cur.gross += li.gross_amount || 0
    cur.count += 1
    categoryBuckets.set(cat, cur)
  }
  // 税抜小計
  const sub10Excl = revenueBuckets.dine_in_10.gross + revenueBuckets.goods_10.gross
  const sub8Excl = revenueBuckets.beans_8.gross + revenueBuckets.takeout_8.gross
  // 消費税額 (税理士提出: 各税率の小計に対して1回だけ Math.round)
  const tax10 = Math.round(sub10Excl * 0.10)
  const tax8 = Math.round(sub8Excl * 0.08)
  // 税込小計
  const sub10Incl = sub10Excl + tax10
  const sub8Incl = sub8Excl + tax8
  const lineItemSubtotalExcl = sub10Excl + sub8Excl + revenueBuckets.unknown.gross
  const lineItemSubtotalIncl = sub10Incl + sub8Incl + revenueBuckets.unknown.gross

  // Per-payout 4-bucket breakdown (税理士提出用)
  type PayoutBuckets = {
    dine_in_10: number
    goods_10: number
    beans_8: number
    takeout_8: number
    unknown: number
    lineSubtotal: number
  }
  const payoutBucketsMap = useMemo(() => {
    const map = new Map<string, PayoutBuckets>()
    for (const p of payouts) {
      if (!p.period_start || !p.period_end) continue
      const buckets: PayoutBuckets = {
        dine_in_10: 0,
        goods_10: 0,
        beans_8: 0,
        takeout_8: 0,
        unknown: 0,
        lineSubtotal: 0,
      }
      for (const li of payoutPeriodLines) {
        if (li.date < p.period_start || li.date > p.period_end) continue
        const rc = effectiveRevenueCategory(
          { tax_rate: li.tax_rate, item_name: li.item_name, category: li.category },
          overrides,
        )
        const amt = li.gross_amount || 0
        if (rc === 'dine_in_10') buckets.dine_in_10 += amt
        else if (rc === 'goods_10') buckets.goods_10 += amt
        else if (rc === 'beans_8') buckets.beans_8 += amt
        else if (rc === 'takeout_8') buckets.takeout_8 += amt
        else buckets.unknown += amt
        buckets.lineSubtotal += amt
      }
      map.set(p.payout_id, buckets)
    }
    return map
  }, [payouts, payoutPeriodLines, overrides])

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">Square 売上</h1>
          <div className="w-12" />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-white rounded-xl px-3 py-2 text-sm border border-stone-200 flex-1"
          >
            {months.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={syncMonth}
            disabled={syncing}
            className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {syncing ? '同期中…' : '🔄 この月を同期'}
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-blue-700 tracking-wider">🟦 月合計</p>
          {loading ? (
            <p className="text-stone-400 text-sm py-3">読み込み中…</p>
          ) : showCachedFallback ? (
            <>
              <p className="text-3xl font-light text-blue-900 mt-1 tabular-nums">
                ¥{monthTotalCached.toLocaleString()}
              </p>
              <p className="text-xs text-blue-600 mt-1">月次集計のみ（明細は未同期）</p>
              <p className="text-[10px] text-blue-500 mt-1">
                明細を見るには「この月を同期」をタップ
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-light text-blue-900 mt-1 tabular-nums">
                ¥{monthTotal.toLocaleString()}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {monthCount}件
                {lastSync && ` ・最終同期 ${new Date(lastSync).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </>
          )}
        </div>

        {!loading && lineItems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <p className="text-xs text-stone-500 tracking-wider">税区分別売上（税理士提出用 4区分）</p>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-xs">
              <span className="text-stone-400"></span>
              <span className="text-stone-400 text-right">税抜</span>
              <span className="text-stone-400 text-right">消費税</span>
              <span className="text-stone-400 text-right">税込</span>

              <span className="text-stone-700">{REVENUE_LABEL.dine_in_10}</span>
              <span className="tabular-nums text-right">¥{revenueBuckets.dine_in_10.gross.toLocaleString()}</span>
              <span className="tabular-nums text-right text-stone-400">—</span>
              <span className="tabular-nums text-right text-stone-400">—</span>

              <span className="text-stone-700">{REVENUE_LABEL.goods_10}</span>
              <span className="tabular-nums text-right">¥{revenueBuckets.goods_10.gross.toLocaleString()}</span>
              <span className="tabular-nums text-right text-stone-400">—</span>
              <span className="tabular-nums text-right text-stone-400">—</span>

              <span className="text-stone-500 border-t border-stone-100 pt-1">10% 小計</span>
              <span className="tabular-nums text-right border-t border-stone-100 pt-1 font-medium">¥{sub10Excl.toLocaleString()}</span>
              <span className="tabular-nums text-right border-t border-stone-100 pt-1 text-stone-600">¥{tax10.toLocaleString()}</span>
              <span className="tabular-nums text-right border-t border-stone-100 pt-1 font-medium">¥{sub10Incl.toLocaleString()}</span>

              <span className="text-stone-700 pt-2">{REVENUE_LABEL.beans_8}</span>
              <span className="tabular-nums text-right pt-2">¥{revenueBuckets.beans_8.gross.toLocaleString()}</span>
              <span className="tabular-nums text-right pt-2 text-stone-400">—</span>
              <span className="tabular-nums text-right pt-2 text-stone-400">—</span>

              <span className="text-stone-700">{REVENUE_LABEL.takeout_8}</span>
              <span className="tabular-nums text-right">¥{revenueBuckets.takeout_8.gross.toLocaleString()}</span>
              <span className="tabular-nums text-right text-stone-400">—</span>
              <span className="tabular-nums text-right text-stone-400">—</span>

              <span className="text-stone-500 border-t border-stone-100 pt-1">8% 小計</span>
              <span className="tabular-nums text-right border-t border-stone-100 pt-1 font-medium">¥{sub8Excl.toLocaleString()}</span>
              <span className="tabular-nums text-right border-t border-stone-100 pt-1 text-stone-600">¥{tax8.toLocaleString()}</span>
              <span className="tabular-nums text-right border-t border-stone-100 pt-1 font-medium">¥{sub8Incl.toLocaleString()}</span>

              {revenueBuckets.unknown.gross > 0 && (
                <>
                  <span className="text-amber-700 pt-2">{REVENUE_LABEL.unknown}（要設定）</span>
                  <span className="tabular-nums text-right pt-2 text-amber-700 font-medium">¥{revenueBuckets.unknown.gross.toLocaleString()}</span>
                  <span className="tabular-nums text-right pt-2 text-stone-400">—</span>
                  <span className="tabular-nums text-right pt-2 text-stone-400">—</span>
                </>
              )}

              <span className="text-stone-700 border-t border-stone-200 pt-2 font-medium">合計</span>
              <span className="tabular-nums text-right border-t border-stone-200 pt-2 font-medium">¥{lineItemSubtotalExcl.toLocaleString()}</span>
              <span className="tabular-nums text-right border-t border-stone-200 pt-2 text-stone-700">¥{(tax10 + tax8).toLocaleString()}</span>
              <span className="tabular-nums text-right border-t border-stone-200 pt-2 font-semibold text-blue-900">¥{lineItemSubtotalIncl.toLocaleString()}</span>
            </div>
            {monthTotal > 0 && Math.abs(monthTotal - lineItemSubtotalIncl) > 1 && (
              <p className="text-[10px] text-amber-600">
                ※ 決済合計 ¥{monthTotal.toLocaleString()} と税込合計 ¥{lineItemSubtotalIncl.toLocaleString()} の差 ¥{(monthTotal - lineItemSubtotalIncl).toLocaleString()}（チップ・割引・端数）
              </p>
            )}
            {monthTotal > 0 && Math.abs(monthTotal - lineItemSubtotalIncl) <= 1 && (
              <p className="text-[10px] text-emerald-600">✓ 決済合計と税込合計が一致</p>
            )}

            {categoryBuckets.size > 0 && (
              <details className="pt-1">
                <summary className="text-xs text-stone-500 cursor-pointer">Square カテゴリ別内訳</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {Array.from(categoryBuckets.entries())
                    .sort((a, b) => b[1].gross - a[1].gross)
                    .map(([cat, b]) => (
                      <li key={cat} className="flex justify-between">
                        <span className="text-stone-600 truncate pr-2">{cat}</span>
                        <span className="tabular-nums text-stone-700 whitespace-nowrap">
                          ¥{b.gross.toLocaleString()}
                          <span className="text-stone-400 ml-2">{b.count}件</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {!loading && payouts.length > 0 && payoutPeriodLines.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <p className="text-xs text-stone-500 tracking-wider">📅 週別税区分別売上（税込）</p>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-stone-400 border-b border-stone-100">
                    <th className="text-left py-1 px-2 font-normal">期間</th>
                    <th className="text-right py-1 px-1 font-normal">🍽 10%</th>
                    <th className="text-right py-1 px-1 font-normal">👕 10%</th>
                    <th className="text-right py-1 px-1 font-normal">☕ 8%</th>
                    <th className="text-right py-1 px-1 font-normal">🥡 8%</th>
                    <th className="text-right py-1 px-2 font-medium text-stone-600">合計</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts
                    .slice()
                    .sort((a, b) =>
                      (a.period_start ?? '') < (b.period_start ?? '') ? 1 : -1,
                    )
                    .map(p => {
                      const buckets = payoutBucketsMap.get(p.payout_id)
                      if (!buckets || !p.period_start || !p.period_end) return null
                      const incl = (excl: number, rate: number) => excl + Math.round(excl * rate)
                      const dine = incl(buckets.dine_in_10, 0.1)
                      const goods = incl(buckets.goods_10, 0.1)
                      const beans = incl(buckets.beans_8, 0.08)
                      const takeout = incl(buckets.takeout_8, 0.08)
                      const total = dine + goods + beans + takeout + buckets.unknown
                      return (
                        <tr key={p.payout_id} className="border-b border-stone-50">
                          <td className="py-1.5 px-2 text-stone-700 whitespace-nowrap">
                            {p.period_start.slice(5)}〜{p.period_end.slice(5)}
                          </td>
                          <td className="text-right py-1.5 px-1">¥{dine.toLocaleString()}</td>
                          <td className="text-right py-1.5 px-1">¥{goods.toLocaleString()}</td>
                          <td className="text-right py-1.5 px-1">¥{beans.toLocaleString()}</td>
                          <td className="text-right py-1.5 px-1">¥{takeout.toLocaleString()}</td>
                          <td className="text-right py-1.5 px-2 font-semibold text-blue-900">¥{total.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  {(() => {
                    let tDine = 0, tGoods = 0, tBeans = 0, tTakeout = 0, tUnknown = 0
                    for (const p of payouts) {
                      const b = payoutBucketsMap.get(p.payout_id)
                      if (!b) continue
                      tDine += b.dine_in_10 + Math.round(b.dine_in_10 * 0.1)
                      tGoods += b.goods_10 + Math.round(b.goods_10 * 0.1)
                      tBeans += b.beans_8 + Math.round(b.beans_8 * 0.08)
                      tTakeout += b.takeout_8 + Math.round(b.takeout_8 * 0.08)
                      tUnknown += b.unknown
                    }
                    const total = tDine + tGoods + tBeans + tTakeout + tUnknown
                    return (
                      <tr className="border-t-2 border-stone-200 font-medium">
                        <td className="py-1.5 px-2 text-stone-700">合計</td>
                        <td className="text-right py-1.5 px-1">¥{tDine.toLocaleString()}</td>
                        <td className="text-right py-1.5 px-1">¥{tGoods.toLocaleString()}</td>
                        <td className="text-right py-1.5 px-1">¥{tBeans.toLocaleString()}</td>
                        <td className="text-right py-1.5 px-1">¥{tTakeout.toLocaleString()}</td>
                        <td className="text-right py-1.5 px-2 font-semibold text-blue-900">¥{total.toLocaleString()}</td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-stone-400">
              ※ 各週の集計は Square 入金（毎週金曜）の対象期間ベース。詳細（税抜・消費税）は下の入金カードをタップ。
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500 tracking-wider">Square 入金（銀行振込・手数料）</p>
            <button
              onClick={syncPayouts}
              disabled={syncingPayouts}
              className="text-xs text-blue-700 underline disabled:opacity-50"
            >
              {syncingPayouts ? '同期中…' : '🔄 入金を同期'}
            </button>
          </div>
          {payouts.length === 0 ? (
            <p className="text-stone-400 text-xs">この月の入金記録はまだありません。「🔄 入金を同期」を押してください。</p>
          ) : (
            <ul className="space-y-2">
              {payouts.map(p => {
                const buckets = payoutBucketsMap.get(p.payout_id)
                const sub10pExcl = buckets ? buckets.dine_in_10 + buckets.goods_10 : 0
                const sub8pExcl = buckets ? buckets.beans_8 + buckets.takeout_8 : 0
                const tax10p = Math.round(sub10pExcl * 0.10)
                const tax8p = Math.round(sub8pExcl * 0.08)
                const sub10pIncl = sub10pExcl + tax10p
                const sub8pIncl = sub8pExcl + tax8p
                const inclTotal = sub10pIncl + sub8pIncl + (buckets?.unknown ?? 0)
                return (
                  <li key={p.payout_id} className="border-t border-stone-100 pt-2 first:border-0 first:pt-0">
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-700">
                        {p.completed_at ? new Date(p.completed_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }) : '—'}
                        <span className="text-[10px] text-stone-400 ml-2">入金</span>
                      </span>
                      <span className="tabular-nums text-stone-900 font-medium">
                        ¥{p.amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-stone-500 mt-0.5">
                      <span>
                        {p.period_start && p.period_end
                          ? `対象 ${p.period_start.slice(5)}〜${p.period_end.slice(5)}`
                          : '対象期間: —'}
                      </span>
                      <span className="tabular-nums">
                        手数料 ¥{p.fee_amount.toLocaleString()}
                        <span className="text-stone-400 ml-2">/ 売上総額 ¥{p.gross_amount.toLocaleString()}</span>
                      </span>
                    </div>
                    {buckets && buckets.lineSubtotal > 0 && (
                      <details open className="mt-1.5">
                        <summary className="text-[10px] text-blue-700 cursor-pointer">対象期間の税区分別売上（4区分・税込/税抜）</summary>
                        <div className="mt-1.5 ml-2 pl-2 border-l-2 border-blue-100 grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-0.5 text-[11px]">
                          <span className="text-stone-400"></span>
                          <span className="text-stone-400 text-right">税抜</span>
                          <span className="text-stone-400 text-right">消費税</span>
                          <span className="text-stone-400 text-right">税込</span>

                          <span className="text-stone-600">🍽 10% イートイン</span>
                          <span className="tabular-nums text-right">¥{buckets.dine_in_10.toLocaleString()}</span>
                          <span className="tabular-nums text-right text-stone-400">—</span>
                          <span className="tabular-nums text-right text-stone-400">—</span>

                          <span className="text-stone-600">👕 10% 物販</span>
                          <span className="tabular-nums text-right">¥{buckets.goods_10.toLocaleString()}</span>
                          <span className="tabular-nums text-right text-stone-400">—</span>
                          <span className="tabular-nums text-right text-stone-400">—</span>

                          <span className="text-stone-500 border-t border-stone-100 pt-0.5">10% 小計</span>
                          <span className="tabular-nums text-right border-t border-stone-100 pt-0.5">¥{sub10pExcl.toLocaleString()}</span>
                          <span className="tabular-nums text-right border-t border-stone-100 pt-0.5 text-stone-600">¥{tax10p.toLocaleString()}</span>
                          <span className="tabular-nums text-right border-t border-stone-100 pt-0.5 font-medium">¥{sub10pIncl.toLocaleString()}</span>

                          <span className="text-stone-600 pt-1">☕ 8% 豆</span>
                          <span className="tabular-nums text-right pt-1">¥{buckets.beans_8.toLocaleString()}</span>
                          <span className="tabular-nums text-right pt-1 text-stone-400">—</span>
                          <span className="tabular-nums text-right pt-1 text-stone-400">—</span>

                          <span className="text-stone-600">🥡 8% テイクアウト</span>
                          <span className="tabular-nums text-right">¥{buckets.takeout_8.toLocaleString()}</span>
                          <span className="tabular-nums text-right text-stone-400">—</span>
                          <span className="tabular-nums text-right text-stone-400">—</span>

                          <span className="text-stone-500 border-t border-stone-100 pt-0.5">8% 小計</span>
                          <span className="tabular-nums text-right border-t border-stone-100 pt-0.5">¥{sub8pExcl.toLocaleString()}</span>
                          <span className="tabular-nums text-right border-t border-stone-100 pt-0.5 text-stone-600">¥{tax8p.toLocaleString()}</span>
                          <span className="tabular-nums text-right border-t border-stone-100 pt-0.5 font-medium">¥{sub8pIncl.toLocaleString()}</span>

                          {buckets.unknown > 0 && (
                            <>
                              <span className="text-amber-700 pt-1">❓ 未分類</span>
                              <span className="tabular-nums text-right pt-1 text-amber-700">¥{buckets.unknown.toLocaleString()}</span>
                              <span className="tabular-nums text-right pt-1 text-stone-400">—</span>
                              <span className="tabular-nums text-right pt-1 text-stone-400">—</span>
                            </>
                          )}

                          <span className="text-stone-700 border-t border-stone-200 pt-1 font-medium">合計</span>
                          <span className="tabular-nums text-right border-t border-stone-200 pt-1 font-medium">¥{buckets.lineSubtotal.toLocaleString()}</span>
                          <span className="tabular-nums text-right border-t border-stone-200 pt-1 text-stone-700">¥{(tax10p + tax8p).toLocaleString()}</span>
                          <span className="tabular-nums text-right border-t border-stone-200 pt-1 font-semibold text-blue-900">¥{inclTotal.toLocaleString()}</span>
                        </div>
                        {Math.abs(inclTotal - p.gross_amount) > 1 ? (
                          <p className="mt-1 text-[10px] text-amber-600 ml-2">
                            ※ 売上総額 ¥{p.gross_amount.toLocaleString()} と税込合計 ¥{inclTotal.toLocaleString()} の差 ¥{(p.gross_amount - inclTotal).toLocaleString()}（チップ・割引・端数）
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-emerald-600 ml-2">✓ 売上総額と税込合計が一致</p>
                        )}
                      </details>
                    )}
                  </li>
                )
              })}
              <li className="border-t border-stone-200 pt-2 flex justify-between text-sm font-medium">
                <span className="text-stone-700">入金合計</span>
                <span className="tabular-nums text-stone-900">
                  ¥{payouts.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                  <span className="text-[10px] text-stone-400 ml-2">
                    手数料 ¥{payouts.reduce((s, p) => s + p.fee_amount, 0).toLocaleString()}
                  </span>
                </span>
              </li>
            </ul>
          )}
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : monthCount === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-500 text-sm mb-2">この月の決済明細はまだ取込まれていません</p>
            <p className="text-stone-400 text-xs mb-4">「🔄 この月を同期」で Square から取り込めます</p>
          </div>
        ) : (
          <>
            <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm">
              <button
                onClick={() => setView('product')}
                className={`flex-1 py-2 text-xs rounded-xl transition ${
                  view === 'product' ? 'bg-stone-800 text-white font-medium' : 'text-stone-500'
                }`}
              >
                商品単位
              </button>
              <button
                onClick={() => setView('payment')}
                className={`flex-1 py-2 text-xs rounded-xl transition ${
                  view === 'payment' ? 'bg-stone-800 text-white font-medium' : 'text-stone-500'
                }`}
              >
                決済単位
              </button>
            </div>

            {view === 'product' ? (
              <div className="space-y-3">
                {itemDayGroups.map(g => (
                  <div key={g.date} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex justify-between items-baseline px-4 py-3 bg-stone-50 border-b border-stone-100">
                      <p className="text-sm font-medium text-stone-700">
                        {new Date(g.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                      </p>
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs text-stone-400">{g.count}点</span>
                        <span className="text-base font-medium text-blue-700 tabular-nums">
                          ¥{g.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <ul className="divide-y divide-stone-100">
                      {g.items.map(li => (
                        <li key={li.id} className="px-4 py-2 flex justify-between items-center text-sm gap-3">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-xs text-stone-400 tabular-nums whitespace-nowrap">
                              {new Date(li.created_at_jst).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="truncate text-stone-800">
                              {li.item_name ?? '(unnamed)'}
                              {li.variation_name && <span className="text-stone-500"> / {li.variation_name}</span>}
                              {li.quantity > 1 && <span className="text-stone-500"> ×{li.quantity}</span>}
                            </span>
                          </div>
                          <span className="tabular-nums text-stone-800 font-medium whitespace-nowrap">
                            ¥{li.gross_amount.toLocaleString()}
                            {li.tax_rate !== null && (
                              <span className="text-stone-400 ml-1 text-[10px]">[{li.tax_rate}%]</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {dayGroups.map(g => (
                  <div key={g.date} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex justify-between items-baseline px-4 py-3 bg-stone-50 border-b border-stone-100">
                      <p className="text-sm font-medium text-stone-700">
                        {new Date(g.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                      </p>
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs text-stone-400">{g.count}件</span>
                        <span className="text-base font-medium text-blue-700 tabular-nums">
                          ¥{g.total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <ul className="divide-y divide-stone-100">
                      {g.payments.map(p => {
                        const lines = linesByPayment.get(p.payment_id) ?? []
                        const firstName = lines[0]?.item_name ?? null
                        return (
                          <li key={p.id} className="px-4 py-2.5">
                            <div className="flex justify-between items-center text-sm gap-3">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-xs text-stone-400 tabular-nums whitespace-nowrap">
                                  {new Date(p.created_at_jst).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {firstName ? (
                                  <span className="text-stone-800 truncate">
                                    {firstName}
                                    {lines.length > 1 && (
                                      <span className="text-stone-400 text-xs"> 他{lines.length - 1}点</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-stone-300 text-xs">明細未取得</span>
                                )}
                              </div>
                              <span className="text-stone-800 font-medium tabular-nums whitespace-nowrap">
                                ¥{p.amount.toLocaleString()}
                              </span>
                            </div>
                            {lines.length > 1 && (
                              <ul className="mt-1.5 pl-12 space-y-0.5">
                                {lines.map((li, idx) => (
                                  <li key={idx} className="flex justify-between items-baseline text-[11px] text-stone-500">
                                    <span className="truncate pr-2">
                                      {li.item_name ?? '(unnamed)'}
                                      {li.variation_name && <span className="text-stone-400"> / {li.variation_name}</span>}
                                      {li.quantity > 1 && <span className="text-stone-400"> ×{li.quantity}</span>}
                                    </span>
                                    <span className="tabular-nums text-stone-600 whitespace-nowrap">
                                      ¥{li.gross_amount.toLocaleString()}
                                      {li.tax_rate !== null && (
                                        <span className="text-stone-400 ml-1">[{li.tax_rate}%]</span>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
