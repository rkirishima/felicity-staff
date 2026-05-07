'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'

function thisMonthJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

type Tx = {
  id: string
  date: string
  description: string
  debit: number
  credit: number
  balance: number | null
}

export default function BankPage() {
  const router = useRouter()
  const supabase = createClient()
  const [month, setMonth] = useState(thisMonthJST())
  const [txs, setTxs] = useState<Tx[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('keiri_bank_transactions')
        .select('id, date, description, debit, credit, balance')
        .gte('date', start)
        .lt('date', next)
        .order('date', { ascending: false })
      if (cancelled) return
      setTxs((data ?? []) as Tx[])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [month, router, supabase])

  const totalCredit = txs.reduce((s, t) => s + (t.credit || 0), 0)
  const totalDebit = txs.reduce((s, t) => s + (t.debit || 0), 0)
  const net = totalCredit - totalDebit

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">銀行</h1>
          <Link
            href="/admin/keiri/bank/import"
            className="text-sm text-emerald-700 px-3 py-1.5 bg-white rounded-xl shadow-sm"
          >
            + CSV取込
          </Link>
        </div>

        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="bg-white rounded-xl px-3 py-2 text-sm border border-stone-200 w-full"
        />

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
            <p className="text-[10px] text-emerald-700">入金</p>
            <p className="text-sm font-medium text-emerald-900 mt-1">
              ¥{totalCredit.toLocaleString()}
            </p>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3">
            <p className="text-[10px] text-rose-700">出金</p>
            <p className="text-sm font-medium text-rose-900 mt-1">¥{totalDebit.toLocaleString()}</p>
          </div>
          <div
            className={`${net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'} border rounded-2xl p-3`}
          >
            <p className={`text-[10px] ${net >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>差引</p>
            <p
              className={`text-sm font-medium ${net >= 0 ? 'text-blue-900' : 'text-amber-900'} mt-1 tabular-nums`}
            >
              ¥{net.toLocaleString()}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : txs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-400 text-sm mb-3">取引が無いか、まだ取込まれていません</p>
            <Link
              href="/admin/keiri/bank/import"
              className="inline-block bg-stone-800 text-white py-2 px-4 rounded-xl text-sm"
            >
              CSV を取り込む
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-stone-100">
            {txs.map(tx => (
              <div key={tx.id} className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-stone-400">{tx.date}</p>
                    <p className="text-sm text-stone-700 truncate">{tx.description}</p>
                  </div>
                  <div className="text-right">
                    {tx.credit > 0 && (
                      <p className="text-sm font-medium text-emerald-700 tabular-nums">
                        +¥{tx.credit.toLocaleString()}
                      </p>
                    )}
                    {tx.debit > 0 && (
                      <p className="text-sm font-medium text-rose-700 tabular-nums">
                        −¥{tx.debit.toLocaleString()}
                      </p>
                    )}
                    {tx.balance !== null && (
                      <p className="text-[10px] text-stone-400 tabular-nums">
                        残高 ¥{tx.balance.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
