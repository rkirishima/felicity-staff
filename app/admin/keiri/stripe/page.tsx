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

type LineItem = {
  id: string
  order_id: string | null
  product_id: string | null
  product_name: string | null
  quantity: number
  amount: number
  tax_rate: number | null
  classification: string | null
  date: string
  created_at_jst: string
}

type DayGroup = { date: string; total: number; count: number; items: LineItem[] }

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
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  coffee_beans: '☕ 豆',
  drip_pack: '💧 ドリップパック',
  goods: '👕 グッズ',
  food_other: '🍞 その他食品',
  other: '❓ その他',
}

export default function StripeSalesPage() {
  return (
    <Suspense fallback={<main className="min-h-screen pt-8 px-4" style={{ backgroundColor: '#F5F0E8' }}><p className="text-stone-400 text-sm text-center">読み込み中...</p></main>}>
      <StripeInner />
    </Suspense>
  )
}

function StripeInner() {
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
  const [items, setItems] = useState<LineItem[]>([])
  const [orderTotal, setOrderTotal] = useState<number>(0)
  const [orderCount, setOrderCount] = useState<number>(0)
  const [payouts, setPayouts] = useState<PayoutRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingPayouts, setSyncingPayouts] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [liRes, ordRes, poRes] = await Promise.all([
        supabase
          .from('keiri_stripe_line_items')
          .select('id, order_id, product_id, product_name, quantity, amount, tax_rate, classification, date, created_at_jst')
          .gte('date', start)
          .lt('date', next)
          .order('created_at_jst', { ascending: false }),
        supabase
          .from('orders')
          .select('amount, status')
          .in('status', ['paid', 'shipped', 'completed'])
          .gte('created_at', new Date(`${start}T00:00:00+09:00`).toISOString())
          .lt('created_at', new Date(`${next}T00:00:00+09:00`).toISOString()),
        supabase
          .from('keiri_stripe_payouts')
          .select('payout_id, status, arrival_date, amount, fee_amount, gross_amount, charge_count, refund_count, period_start, period_end')
          .gte('arrival_date', start)
          .lt('arrival_date', next)
          .order('arrival_date', { ascending: false }),
      ])
      if (cancelled) return
      setItems((liRes.data ?? []) as LineItem[])
      const ord = (ordRes.data ?? []) as { amount: number }[]
      setOrderTotal(ord.reduce((s, o) => s + (o.amount || 0), 0))
      setOrderCount(ord.length)
      setPayouts((poRes?.data ?? []) as PayoutRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [month, supabase, reload])

  async function syncMonth() {
    setSyncing(true)
    try {
      const res = await fetch(`/api/keiri/stripe-sync-month?month=${month}`)
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

  async function syncPayouts() {
    setSyncingPayouts(true)
    try {
      const [y, m] = month.split('-').map(s => parseInt(s, 10))
      const from = `${month}-01`
      const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      const to = `${nextYm}-01`
      const res = await fetch(`/api/keiri/stripe-payouts-sync?from=${from}&to=${to}`)
      const data = await res.json()
      if (!res.ok) {
        alert(`入金同期失敗: ${data.error ?? 'unknown'}\n${data.detail ?? ''}`)
      } else {
        setReload(n => n + 1)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '入金同期失敗')
    } finally {
      setSyncingPayouts(false)
    }
  }

  const dayGroups: DayGroup[] = useMemo(() => {
    const map = new Map<string, DayGroup>()
    for (const li of items) {
      const cur = map.get(li.date) ?? { date: li.date, total: 0, count: 0, items: [] }
      cur.total += li.amount
      cur.count += 1
      cur.items.push(li)
      map.set(li.date, cur)
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [items])

  type Bucket = { gross: number; count: number }
  const taxBuckets: { '10': Bucket; '8': Bucket; unknown: Bucket } = {
    '10': { gross: 0, count: 0 },
    '8': { gross: 0, count: 0 },
    unknown: { gross: 0, count: 0 },
  }
  const classBuckets = new Map<string, Bucket>()
  for (const li of items) {
    const key = li.tax_rate === 10 ? '10' : li.tax_rate === 8 ? '8' : 'unknown'
    taxBuckets[key].gross += li.amount
    taxBuckets[key].count += 1
    const cls = li.classification ?? 'other'
    const cur = classBuckets.get(cls) ?? { gross: 0, count: 0 }
    cur.gross += li.amount
    cur.count += 1
    classBuckets.set(cls, cur)
  }
  const lineSubtotal = taxBuckets['10'].gross + taxBuckets['8'].gross + taxBuckets.unknown.gross

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">Stripe (EC) 売上</h1>
          <div className="w-12" />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-white rounded-xl px-3 py-2 text-sm border border-stone-200 flex-1"
          >
            {months.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={syncMonth}
            disabled={syncing}
            className="bg-emerald-600 text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {syncing ? '同期中…' : '🔄 この月を同期'}
          </button>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-emerald-700 tracking-wider">💳 月合計（注文ベース）</p>
          {loading ? (
            <p className="text-stone-400 text-sm py-3">読み込み中…</p>
          ) : (
            <>
              <p className="text-3xl font-light text-emerald-900 mt-1 tabular-nums">
                ¥{orderTotal.toLocaleString()}
              </p>
              <p className="text-xs text-emerald-600 mt-1">{orderCount}件の注文</p>
            </>
          )}
        </div>

        {!loading && items.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <p className="text-xs text-stone-500 tracking-wider">税区分別売上（商品ライン集計）</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between">
                <span className="text-stone-700">10% グッズ等</span>
                <span className="tabular-nums text-stone-900 font-medium">¥{taxBuckets['10'].gross.toLocaleString()}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-stone-700">8% 豆・食品</span>
                <span className="tabular-nums text-stone-900 font-medium">¥{taxBuckets['8'].gross.toLocaleString()}</span>
              </li>
              {taxBuckets.unknown.gross > 0 && (
                <li className="flex justify-between text-amber-700">
                  <span>未分類（SKUマスタ要登録）</span>
                  <span className="tabular-nums font-medium">¥{taxBuckets.unknown.gross.toLocaleString()}</span>
                </li>
              )}
              <li className="flex justify-between pt-2 border-t border-stone-100">
                <span className="text-stone-500 text-xs">明細合計</span>
                <span className="tabular-nums text-stone-700 text-xs">¥{lineSubtotal.toLocaleString()}</span>
              </li>
              {orderTotal > 0 && Math.abs(orderTotal - lineSubtotal) > 1 && (
                <li className="text-[10px] text-amber-600">
                  ※ 注文合計 ¥{orderTotal.toLocaleString()} と差分 ¥{(orderTotal - lineSubtotal).toLocaleString()}（送料・割引・端数）
                </li>
              )}
            </ul>

            {classBuckets.size > 0 && (
              <details className="pt-1">
                <summary className="text-xs text-stone-500 cursor-pointer">分類別内訳</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {Array.from(classBuckets.entries())
                    .sort((a, b) => b[1].gross - a[1].gross)
                    .map(([cls, b]) => (
                      <li key={cls} className="flex justify-between">
                        <span className="text-stone-600">{CLASSIFICATION_LABEL[cls] ?? cls}</span>
                        <span className="tabular-nums text-stone-700">
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

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-500 tracking-wider">Stripe 入金（銀行振込・手数料）</p>
            <button
              onClick={syncPayouts}
              disabled={syncingPayouts}
              className="text-xs text-emerald-700 underline disabled:opacity-50"
            >
              {syncingPayouts ? '同期中…' : '🔄 入金を同期'}
            </button>
          </div>
          {payouts.length === 0 ? (
            <p className="text-stone-400 text-xs">この月の入金記録はまだありません。「🔄 入金を同期」を押してください。<br/><span className="text-[10px]">※ Vercel env に STRIPE_SECRET_KEY が必要</span></p>
          ) : (
            <ul className="space-y-2">
              {payouts.map(p => (
                <li key={p.payout_id} className="border-t border-stone-100 pt-2 first:border-0 first:pt-0">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-700">
                      {p.arrival_date ? new Date(p.arrival_date + 'T00:00:00+09:00').toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }) : '—'}
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
                      {p.charge_count > 0 && <span className="ml-2 text-stone-400">{p.charge_count}件</span>}
                      {p.refund_count > 0 && <span className="ml-1 text-rose-500">返金{p.refund_count}件</span>}
                    </span>
                    <span className="tabular-nums">
                      手数料 ¥{p.fee_amount.toLocaleString()}
                      <span className="text-stone-400 ml-2">/ 売上 ¥{p.gross_amount.toLocaleString()}</span>
                    </span>
                  </div>
                </li>
              ))}
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
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-500 text-sm mb-2">この月の明細はまだ取込まれていません</p>
            <p className="text-stone-400 text-xs mb-4">「🔄 この月を同期」で orders から商品ラインを生成します</p>
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
                    <span className="text-xs text-stone-400">{g.count}行</span>
                    <span className="text-base font-medium text-emerald-700 tabular-nums">¥{g.total.toLocaleString()}</span>
                  </div>
                </div>
                <ul className="divide-y divide-stone-100">
                  {g.items.map(li => (
                    <li key={li.id} className="px-4 py-2.5 text-sm">
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-stone-800 truncate">{li.product_name ?? li.product_id ?? '(unnamed)'}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                            {li.tax_rate === null ? (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">未分類</span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">
                                {li.tax_rate}%
                              </span>
                            )}
                            {li.classification && (
                              <span className="text-stone-400">{CLASSIFICATION_LABEL[li.classification] ?? li.classification}</span>
                            )}
                            <span className="text-stone-400">×{li.quantity}</span>
                          </div>
                        </div>
                        <span className="text-stone-800 font-medium tabular-nums whitespace-nowrap">¥{li.amount.toLocaleString()}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
          <p className="font-medium">分類について</p>
          <p>SKU は <code>keiri_sku_master</code> テーブルに登録された商品から税率と分類を取得します。未登録 SKU は商品名キーワードから推測。すべて要マッピングなら <code>未分類</code> として表示されます。</p>
        </div>
      </div>
    </main>
  )
}
