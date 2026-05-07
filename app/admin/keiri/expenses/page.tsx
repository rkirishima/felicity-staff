'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { MonthSelector } from '@/components/keiri/MonthSelector'

type Row = {
  id: string
  date: string
  amount: number
  vendor: string | null
  payment_method: string | null
  memo: string | null
  source: string | null
  category: { name: string } | null
}

function thisMonthJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

export default function ExpensesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [month, setMonth] = useState(thisMonthJST())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('keiri_transactions')
        .select('id, date, amount, vendor, payment_method, memo, source, category:keiri_categories(name)')
        .eq('type', 'expense')
        .gte('date', start)
        .lt('date', next)
        .order('date', { ascending: false })
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
    })()
  }, [month, router, supabase])

  async function remove(id: string) {
    if (!confirm('この経費を削除しますか?')) return
    setDeleting(s => ({ ...s, [id]: true }))
    try {
      const { error } = await supabase.from('keiri_transactions').delete().eq('id', id)
      if (error) throw error
      setRows(prev => prev.filter(r => r.id !== id))
      toast.success('削除しました')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`削除失敗: ${msg}`)
    } finally {
      setDeleting(s => ({ ...s, [id]: false }))
    }
  }

  const total = rows.reduce((s, r) => s + (r.amount || 0), 0)

  return (
    <main className="min-h-screen pb-32 px-4 pt-8 relative" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between h-12">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">経費明細</h1>
          <span className="w-10" />
        </div>

        <MonthSelector value={month} onChange={setMonth} />

        <div className="bg-rose-50 border border-rose-200 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-rose-700 tracking-wider">月合計</p>
          <p className="text-2xl font-light text-rose-900 mt-1 tabular-nums">¥{total.toLocaleString('ja-JP')}</p>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-stone-400">
            <span className="text-5xl">🧾</span>
            <p className="text-sm font-medium text-stone-600">経費がありません</p>
            <p className="text-xs text-center">レシートを撮影するか<br />CSVから取り込んでください</p>
            <Link
              href="/admin/keiri/receipts/upload"
              className="w-full bg-stone-900 text-white rounded-2xl py-4 text-sm font-medium flex items-center justify-center gap-2"
            >
              📷 レシートを撮影
            </Link>
            <Link
              href="/admin/keiri/bank/import"
              className="w-full border border-stone-200 text-stone-600 rounded-2xl py-4 text-sm text-center"
            >
              CSVから取込
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map(r => (
              <li key={r.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-stone-800 tabular-nums">¥{r.amount.toLocaleString('ja-JP')}</p>
                    <span className="text-[10px] text-stone-400 tracking-wider tabular-nums">{r.date}</span>
                    {r.source === 'receipt' && <span className="text-[10px] text-stone-400">📷</span>}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {r.category?.name ?? '未分類'}
                    {r.vendor ? ` ・ ${r.vendor}` : ''}
                  </p>
                  {r.memo && <p className="text-xs text-stone-400 mt-1">{r.memo}</p>}
                </div>
                <button
                  onClick={() => remove(r.id)}
                  disabled={deleting[r.id]}
                  className="text-xs text-stone-400 hover:text-red-500 disabled:opacity-40 px-2 py-1"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* FAB — 経費を追加 */}
      <Link
        href="/admin/keiri/expenses/new"
        aria-label="経費を追加"
        className="fixed bottom-24 right-4 z-10 bg-stone-900 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg text-2xl"
      >
        +
      </Link>
    </main>
  )
}
