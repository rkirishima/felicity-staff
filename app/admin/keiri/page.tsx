'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function thisMonthJST() {
  return todayJST().slice(0, 7)
}

function monthOptions(count = 24): { value: string; label: string }[] {
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

type IncomeRow = { date: string; amount: number; tax_category: string | null; source: string | null }
type ExpenseRow = { date: string; amount: number }
type PendingRow = { amount: number }

type SquareSales = { today: number; thisMonth: number; count: number; asOf: string }

export default function KeiriDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [month, setMonth] = useState(thisMonthJST())
  const months = useMemo(() => monthOptions(24), [])
  const [income, setIncome] = useState<IncomeRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [pendingBank, setPendingBank] = useState<PendingRow[]>([])
  const [pendingInvoices, setPendingInvoices] = useState<{ total: number }[]>([])
  const [square, setSquare] = useState<SquareSales | null>(null)
  const [squareLoading, setSquareLoading] = useState(false)
  const [squareError, setSquareError] = useState<string | null>(null)
  const [resyncing, setResyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  const isCurrentMonth = month === thisMonthJST()

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [incRes, expRes, pendBankRes, pendInvRes] = await Promise.all([
        supabase
          .from('keiri_income_view')
          .select('date, amount, tax_category, source')
          .gte('date', start)
          .lt('date', nextMonth),
        supabase
          .from('keiri_transactions')
          .select('date, amount')
          .eq('type', 'expense')
          .gte('date', start)
          .lt('date', nextMonth),
        supabase
          .from('orders')
          .select('amount')
          .eq('status', 'pending_bank_transfer'),
        supabase
          .from('keiri_invoices')
          .select('total')
          .eq('status', 'sent'),
      ])
      if (cancelled) return
      setIncome((incRes.data ?? []) as IncomeRow[])
      setExpenses((expRes.data ?? []) as ExpenseRow[])
      setPendingBank((pendBankRes.data ?? []) as PendingRow[])
      setPendingInvoices((pendInvRes.data ?? []) as { total: number }[])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [month, router, supabase, reload])

  // Refetch on tab focus so stale pages auto-update after a sync from elsewhere.
  useEffect(() => {
    const onFocus = () => setReload(n => n + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function resyncSquare() {
    setResyncing(true)
    try {
      const res = await fetch(`/api/keiri/square-sync-month?month=${month}`)
      const data = await res.json()
      if (!res.ok) {
        alert(`同期失敗: ${data.error ?? 'unknown'}\n${data.detail ?? ''}`)
      } else {
        alert(`同期完了: ${data.completed ?? 0}件 ¥${(data.monthTotal ?? 0).toLocaleString()}`)
        setReload(n => n + 1)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '同期失敗')
    } finally {
      setResyncing(false)
    }
  }

  // Square API only for current month (real-time refresh).
  useEffect(() => {
    if (!isCurrentMonth) {
      setSquare(null)
      setSquareError(null)
      return
    }
    let cancelled = false
    const fetchSquare = async () => {
      setSquareLoading(true)
      setSquareError(null)
      try {
        const res = await fetch('/api/keiri/square-sales')
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setSquareError(typeof data.error === 'string' ? data.error : 'Square API エラー')
          return
        }
        setSquare(data as SquareSales)
      } catch (e) {
        if (cancelled) return
        setSquareError(e instanceof Error ? e.message : 'fetch error')
      } finally {
        if (!cancelled) setSquareLoading(false)
      }
    }
    fetchSquare()
    const interval = setInterval(fetchSquare, 30000)
    const onFocus = () => fetchSquare()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [isCurrentMonth])

  const stripeTotal = income.filter(r => r.source === 'stripe').reduce((s, r) => s + (r.amount || 0), 0)
  const squareFromView = income
    .filter(r => r.source === 'square' || r.source === 'freee')
    .reduce((s, r) => s + (r.amount || 0), 0)
  const manualIncomeTotal = income
    .filter(r => r.source === 'manual')
    .reduce((s, r) => s + (r.amount || 0), 0)
  const invoiceIncomeTotal = income
    .filter(r => r.source === 'invoice')
    .reduce((s, r) => s + (r.amount || 0), 0)
  const bankCsvTotal = income
    .filter(r => r.source === 'bank_csv')
    .reduce((s, r) => s + (r.amount || 0), 0)

  const squareLiveThisMonth = square?.thisMonth ?? null
  const squareDisplayed = isCurrentMonth ? squareLiveThisMonth ?? squareFromView : squareFromView
  const squareToday = isCurrentMonth ? square?.today ?? 0 : 0
  const squareCount = isCurrentMonth ? square?.count ?? null : null

  const pendingBankTotal = pendingBank.reduce((s, r) => s + (r.amount || 0), 0)
  const pendingInvoiceTotal = pendingInvoices.reduce((s, r) => s + (r.total || 0), 0)
  const pendingTotal = pendingBankTotal + pendingInvoiceTotal
  const pendingCount = pendingBank.length + pendingInvoices.length

  // 売上合計 は Square + Stripe + 手動 + 入金確認済み請求書 のみ。
  // 銀行入金 (CSV) は Square / Stripe の週次振込が遅延して着金しているケースが大半なので
  // 売上として加算すると二重計上になる。現金フロー情報として別カードで表示するに留める。
  const totalConfirmed =
    stripeTotal + manualIncomeTotal + invoiceIncomeTotal + squareDisplayed
  const totalExpense = expenses.reduce((s, r) => s + (r.amount || 0), 0)
  const profit = totalConfirmed - totalExpense

  // 税区分別も bank_csv は除外（売上ではなく着金フロー扱いのため）
  const incomeByTax = income
    .filter(r => r.source !== 'bank_csv')
    .reduce<Record<string, number>>((acc, r) => {
      const key = r.tax_category ?? '未分類'
      acc[key] = (acc[key] || 0) + (r.amount || 0)
      return acc
    }, {})

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">経理</h1>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-white rounded-xl px-3 py-1.5 text-sm border border-stone-200 cursor-pointer"
          >
            {months.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : (
          <>
            {/* 未収金 (常時表示・全期間) */}
            {pendingTotal > 0 && (
              <Link
                href="/admin/keiri/pending-payments"
                className="block bg-orange-50 border border-orange-200 rounded-2xl shadow-sm p-5 hover:bg-orange-100 transition"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-orange-700 tracking-wider">🔶 未収金</p>
                  <span className="text-xs text-orange-600">→ 詳細</span>
                </div>
                <p className="text-3xl font-light text-orange-900 mt-1">¥{pendingTotal.toLocaleString()}</p>
                <p className="text-xs text-orange-600 mt-1">
                  請求書 {pendingInvoices.length}件 ¥{pendingInvoiceTotal.toLocaleString()} ／ EC銀行振込 {pendingBank.length}件 ¥{pendingBankTotal.toLocaleString()}
                </p>
              </Link>
            )}

            {/* Square — 上に表示（店舗売上が主） */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-blue-700 tracking-wider">🟦 Square (店舗)</p>
                <div className="flex items-center gap-3">
                  {isCurrentMonth && squareLoading && (
                    <span className="text-xs text-blue-500">更新中…</span>
                  )}
                  <button
                    onClick={resyncSquare}
                    disabled={resyncing}
                    className="text-xs text-blue-700 underline disabled:opacity-50"
                  >
                    {resyncing ? '同期中...' : '🔄 同期'}
                  </button>
                  <Link href={`/admin/keiri/square?month=${month}`} className="text-xs text-blue-700">
                    → 明細
                  </Link>
                </div>
              </div>
              {isCurrentMonth && squareError && squareDisplayed === 0 ? (
                <p className="text-sm text-rose-600 mt-1">{squareError}</p>
              ) : squareDisplayed === 0 ? (
                <>
                  <p className="text-3xl font-light text-blue-900 mt-1">¥0</p>
                  <p className="text-xs text-blue-600 mt-1">
                    {isCurrentMonth ? '本日 ¥0' : '🔄 同期 を押して取込'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-light text-blue-900 mt-1">
                    ¥{squareDisplayed.toLocaleString()}
                  </p>
                  {isCurrentMonth ? (
                    <p className="text-xs text-blue-600 mt-1">
                      本日 ¥{squareToday.toLocaleString()}
                      {squareCount !== null ? `・${squareCount}件` : ''}
                      {squareLiveThisMonth === null && squareFromView > 0 && '（月次集計）'}
                    </p>
                  ) : (
                    <p className="text-xs text-blue-600 mt-1">月次集計（過去月）</p>
                  )}
                </>
              )}
            </div>

            {/* Stripe */}
            {stripeTotal > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-emerald-700 tracking-wider">💳 Stripe (EC)</p>
                  <Link href={`/admin/keiri/stripe?month=${month}`} className="text-xs text-emerald-700">
                    → 明細
                  </Link>
                </div>
                <p className="text-3xl font-light text-emerald-900 mt-1">¥{stripeTotal.toLocaleString()}</p>
              </div>
            )}

            {/* 請求書入金 */}
            {invoiceIncomeTotal > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-2xl shadow-sm p-5">
                <p className="text-xs text-purple-700 tracking-wider">📨 請求書入金</p>
                <p className="text-3xl font-light text-purple-900 mt-1">¥{invoiceIncomeTotal.toLocaleString()}</p>
                <p className="text-xs text-purple-600 mt-1">業販請求書（入金確認済）</p>
              </div>
            )}

            {/* 銀行入金（CSV）— 現金フロー（売上には含めない） */}
            {bankCsvTotal > 0 && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-teal-700 tracking-wider">🏦 銀行入金（参考・現金フロー）</p>
                  <Link href="/admin/keiri/bank" className="text-xs text-teal-600">→ 一覧</Link>
                </div>
                <p className="text-3xl font-light text-teal-900 mt-1">¥{bankCsvTotal.toLocaleString()}</p>
                <p className="text-[10px] text-teal-600 mt-1">
                  ※ Square / Stripe の週次振込が含まれるため <strong>売上合計には加算していません</strong>
                </p>
              </div>
            )}

            {/* 手動売上 */}
            {manualIncomeTotal > 0 && (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl shadow-sm p-4 text-sm">
                <div className="flex justify-between text-stone-700">
                  <span>手動売上</span>
                  <span className="tabular-nums">¥{manualIncomeTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* 売上合計 / 経費 / 粗利 */}
            <div className="bg-stone-800 rounded-2xl shadow-sm p-5 space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-stone-400 tracking-wider">📊 売上合計</span>
                <span className="text-2xl font-light text-white tabular-nums">
                  ¥{totalConfirmed.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-stone-400 tracking-wider">経費</span>
                <span className="text-base text-rose-300 tabular-nums">
                  −¥{totalExpense.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-stone-700">
                <span className="text-xs text-stone-400 tracking-wider">粗利</span>
                <span className="text-2xl font-light text-emerald-300 tabular-nums">
                  ¥{profit.toLocaleString()}
                </span>
              </div>
            </div>

            {/* 税区分別売上 */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <p className="text-xs text-stone-500 tracking-wider mb-3">税区分別売上</p>
              {Object.keys(incomeByTax).length === 0 ? (
                <p className="text-stone-400 text-sm">なし</p>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(incomeByTax)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, amt]) => (
                      <li key={cat} className="flex items-center justify-between text-sm">
                        <span className="text-stone-600">{cat}</span>
                        <span className="text-stone-800 font-medium tabular-nums">
                          ¥{amt.toLocaleString()}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* メニュー */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Link
                href="/admin/keiri/pending-payments"
                className="bg-orange-600 text-white py-4 rounded-2xl text-center text-sm font-medium shadow-sm col-span-2"
              >
                🔶 未収金（入金確認）
              </Link>
              <Link
                href="/admin/keiri/receipts/upload"
                className="bg-stone-800 text-white py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                📷 レシートを撮影
              </Link>
              <Link
                href="/admin/keiri/expenses"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                📒 経費明細
              </Link>
              <Link
                href="/admin/keiri/invoices"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                📨 請求書
              </Link>
              <Link
                href="/admin/keiri/issued-receipts"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                🧾 領収書
              </Link>
              <Link
                href="/admin/keiri/clients"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                👥 取引先
              </Link>
              <Link
                href="/admin/keiri/items"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                📦 商品マスタ
              </Link>
              <Link
                href="/admin/keiri/square"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                🟦 Square 売上
              </Link>
              <Link
                href="/admin/keiri/stripe"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm"
              >
                💳 Stripe (EC) 売上
              </Link>
              <Link
                href="/admin/keiri/tax-report"
                className="bg-rose-700 text-white py-4 rounded-2xl text-center text-sm font-medium shadow-sm col-span-2"
              >
                🧾 税理士レポート（月次 CSV / PDF）
              </Link>
              <Link
                href="/admin/keiri/sku-overrides"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm col-span-2"
              >
                🏷 商品分類（未分類SKUの手動分類）
              </Link>
              <Link
                href="/admin/keiri/inventory"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm col-span-2"
              >
                📦 月末在庫
              </Link>
              <Link
                href="/admin/keiri/bank"
                className="bg-white border border-stone-200 text-stone-700 py-4 rounded-2xl text-center text-sm font-medium shadow-sm col-span-2"
              >
                🏦 銀行入金
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
