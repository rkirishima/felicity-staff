'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'

type Row = {
  id: string
  receipt_number: string
  client_name: string
  issue_date: string
  amount: number
  status: string
}

function thisMonthJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

export default function IssuedReceiptsListPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(thisMonthJST())

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      setLoading(true)
      const start = `${month}-01`
      const [y, m] = month.split('-').map(s => parseInt(s, 10))
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      const { data } = await supabase
        .from('keiri_receipts_issued')
        .select('id, receipt_number, client_name, issue_date, amount, status')
        .gte('issue_date', start)
        .lt('issue_date', next)
        .order('issue_date', { ascending: false })
        .order('receipt_number', { ascending: false })
      setRows((data ?? []) as Row[])
      setLoading(false)
    })()
  }, [router, supabase, month])

  const total = rows.filter(r => r.status !== 'cancelled').reduce((s, r) => s + (r.amount || 0), 0)

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">領収書</h1>
          <Link href="/admin/keiri/issued-receipts/new" className="text-sm text-stone-700">+ 発行</Link>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-white rounded-xl px-3 py-1.5 text-sm border border-stone-200"
          />
          <span className="text-xs text-stone-500">月合計 ¥{total.toLocaleString()}</span>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-stone-400 text-sm py-12">領収書はありません</p>
        ) : (
          <ul className="space-y-2">
            {rows.map(r => (
              <li key={r.id}>
                <Link
                  href={`/admin/keiri/issued-receipts/${r.id}`}
                  className={`block bg-white rounded-2xl shadow-sm p-4 ${r.status === 'cancelled' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-800">{r.receipt_number}</p>
                    <p className="text-sm text-stone-700">¥{r.amount.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-stone-500">{r.client_name} 様</p>
                    <p className="text-[10px] text-stone-400">{r.issue_date}</p>
                  </div>
                  {r.status === 'cancelled' && (
                    <p className="text-[10px] text-red-500 mt-1">キャンセル</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
