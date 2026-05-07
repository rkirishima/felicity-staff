'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
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

type IncomeRow = { date: string; amount: number; tax_rate: number | null; tax_category: string | null }
type ExpenseRow = { date: string; amount: number }

export default function KeiriDashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [month, setMonth] = useState(thisMonthJST())
  const [income, setIncome] = useState<IncomeRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

    ;(async () => {
      setLoading(true)
      const [incRes, expRes] = await Promise.all([
        supabase
          .from('keiri_income_view')
          .select('date, amount, tax_category')
          .gte('date', start)
          .lt('date', nextMonth),
        supabase
          .from('keiri_transactions')
          .select('date, amount')
          .eq('type', 'expense')
          .gte('date', start)
          .lt('date', nextMonth),
      ])
      setIncome((incRes.data ?? []) as IncomeRow[])
      setExpenses((expRes.data ?? []) as ExpenseRow[])
      setLoading(false)
    })()
  }, [month, router, supabase])

  const totalIncome = income.reduce((s, r) => s + (r.amount || 0), 0)
  const totalExpense = expenses.reduce((s, r) => s + (r.amount || 0), 0)
  const profit = totalIncome - totalExpense

  const incomeByTax = income.reduce<Record<string, number>>((acc, r) => {
    const key = r.tax_category ?? '未分類'
    acc[key] = (acc[key] || 0) + (r.amount || 0)
    return acc
  }, {})

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">経理</h1>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-white rounded-xl px-3 py-1.5 text-sm border border-stone-200"
          />
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm p-5">
              <p className="text-xs text-emerald-700 tracking-wider">売上</p>
              <p className="text-3xl font-light text-emerald-900 mt-1">¥{totalIncome.toLocaleString()}</p>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl shadow-sm p-5">
              <p className="text-xs text-rose-700 tracking-wider">経費</p>
              <p className="text-3xl font-light text-rose-900 mt-1">¥{totalExpense.toLocaleString()}</p>
            </div>

            <div className="bg-stone-800 rounded-2xl shadow-sm p-5">
              <p className="text-xs text-stone-400 tracking-wider">粗利</p>
              <p className="text-3xl font-light text-white mt-1">¥{profit.toLocaleString()}</p>
            </div>

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
                        <span className="text-stone-800 font-medium">¥{amt.toLocaleString()}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
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
            </div>
          </>
        )}
      </div>
    </main>
  )
}
