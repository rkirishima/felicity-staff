'use client'
export const dynamic = 'force-dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'

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
  tax_rate: number | null
  category: string | null
  item_name: string | null
  variation_name: string | null
  payment_id: string | null
  gross_amount: number
  quantity: number
  revenue_category: string | null
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
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [monthTotalCached, setMonthTotalCached] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [reload, setReload] = useState(0)

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
      const [pRes, mrRes, liRes] = await Promise.all([
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
          .select('tax_rate, category, item_name, variation_name, payment_id, gross_amount, quantity, revenue_category')
          .gte('date', start)
          .lt('date', next),
      ])
      if (cancelled) return
      setPayments((pRes.data ?? []) as Payment[])
      setLineItems((liRes.data ?? []) as LineItem[])
      setMonthTotalCached((mrRes.data?.amount as number | undefined) ?? null)
      setLastSync((mrRes.data?.last_synced_at as string | undefined) ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [month, supabase, reload])

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
        alert(`同期失敗: ${data.error ?? 'unknown'}\n${data.detail ?? ''}`)
      } else {
        setReload(n => n + 1)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '同期失敗')
    } finally {
      setSyncing(false)
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
    const rc = li.revenue_category ?? 'unknown'
    const bucket = revenueBuckets[rc] ?? revenueBuckets.unknown
    bucket.gross += li.gross_amount || 0
    bucket.count += 1
    const cat = li.category ?? '未分類'
    const cur = categoryBuckets.get(cat) ?? { gross: 0, count: 0 }
    cur.gross += li.gross_amount || 0
    cur.count += 1
    categoryBuckets.set(cat, cur)
  }
  const sub10 = revenueBuckets.dine_in_10.gross + revenueBuckets.goods_10.gross
  const sub8 = revenueBuckets.beans_8.gross + revenueBuckets.takeout_8.gross
  const lineItemSubtotal = sub10 + sub8 + revenueBuckets.unknown.gross

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
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between">
                <span className="text-stone-700">{REVENUE_LABEL.dine_in_10}</span>
                <span className="tabular-nums text-stone-900 font-medium">¥{revenueBuckets.dine_in_10.gross.toLocaleString()}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-stone-700">{REVENUE_LABEL.goods_10}</span>
                <span className="tabular-nums text-stone-900 font-medium">¥{revenueBuckets.goods_10.gross.toLocaleString()}</span>
              </li>
              <li className="flex justify-between text-xs pt-1 border-t border-stone-50">
                <span className="text-stone-400">10% 合計</span>
                <span className="tabular-nums text-stone-500">¥{sub10.toLocaleString()}</span>
              </li>
              <li className="flex justify-between pt-2">
                <span className="text-stone-700">{REVENUE_LABEL.beans_8}</span>
                <span className="tabular-nums text-stone-900 font-medium">¥{revenueBuckets.beans_8.gross.toLocaleString()}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-stone-700">{REVENUE_LABEL.takeout_8}</span>
                <span className="tabular-nums text-stone-900 font-medium">¥{revenueBuckets.takeout_8.gross.toLocaleString()}</span>
              </li>
              <li className="flex justify-between text-xs pt-1 border-t border-stone-50">
                <span className="text-stone-400">8% 合計</span>
                <span className="tabular-nums text-stone-500">¥{sub8.toLocaleString()}</span>
              </li>
              {revenueBuckets.unknown.gross > 0 && (
                <li className="flex justify-between text-amber-700 pt-2">
                  <span>{REVENUE_LABEL.unknown}（要設定）</span>
                  <span className="tabular-nums font-medium">¥{revenueBuckets.unknown.gross.toLocaleString()}</span>
                </li>
              )}
              <li className="flex justify-between pt-2 border-t border-stone-100">
                <span className="text-stone-500 text-xs">明細合計</span>
                <span className="tabular-nums text-stone-700 text-xs">¥{lineItemSubtotal.toLocaleString()}</span>
              </li>
              {monthTotal > 0 && Math.abs(monthTotal - lineItemSubtotal) > 1 && (
                <li className="text-[10px] text-amber-600">
                  ※ 決済合計 ¥{monthTotal.toLocaleString()} と差分 ¥{(monthTotal - lineItemSubtotal).toLocaleString()}（手数料・割引・端数・分類前明細）
                </li>
              )}
            </ul>

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

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : monthCount === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-500 text-sm mb-2">この月の決済明細はまだ取込まれていません</p>
            <p className="text-stone-400 text-xs mb-4">「🔄 この月を同期」で Square から取り込めます</p>
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
                    return (
                      <li key={p.id} className="px-4 py-2.5">
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-stone-400 tabular-nums">
                              {new Date(p.created_at_jst).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {p.card_brand && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">
                                {p.card_brand}
                                {p.last_4 ? ` ····${p.last_4}` : ''}
                              </span>
                            )}
                          </div>
                          <span className="text-stone-800 font-medium tabular-nums">
                            ¥{p.amount.toLocaleString()}
                          </span>
                        </div>
                        {lines.length > 0 ? (
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
                        ) : (
                          <p className="mt-1 pl-12 text-[10px] text-stone-300">明細未取得</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
