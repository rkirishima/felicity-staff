'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { MonthSelector } from '@/components/keiri/MonthSelector'
import { aiClassifyAllUnmatchedBank, updateBankRowCategory } from './actions'

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
  expense_category_id: string | null
  vendor_guess: string | null
  classification_source: string | null
  ai_confidence: string | null
  transaction_id: string | null
}

type Category = {
  id: string
  name: string
}

export default function BankPage() {
  const router = useRouter()
  const supabase = createClient()
  const [month, setMonth] = useState(thisMonthJST())
  const [txs, setTxs] = useState<Tx[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [aiBusy, setAiBusy] = useState(false)
  const [reload, setReload] = useState(0)

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
      const [txRes, catRes] = await Promise.all([
        supabase
          .from('keiri_bank_transactions')
          .select('id, date, description, debit, credit, balance, expense_category_id, vendor_guess, classification_source, ai_confidence, transaction_id')
          .gte('date', start)
          .lt('date', next)
          .order('date', { ascending: false }),
        supabase
          .from('keiri_categories')
          .select('id, name')
          .eq('type', 'expense')
          .eq('active', true)
          .order('sort_order'),
      ])
      if (cancelled) return
      setTxs((txRes.data ?? []) as Tx[])
      setCategories((catRes.data ?? []) as Category[])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [month, router, supabase, reload])

  const totalCredit = txs.reduce((s, t) => s + (t.credit || 0), 0)
  const totalDebit = txs.reduce((s, t) => s + (t.debit || 0), 0)
  const net = totalCredit - totalDebit
  const netCardCls =
    net > 0
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : net < 0
        ? 'bg-rose-50 border-rose-200 text-rose-700'
        : 'bg-stone-50 border-stone-200 text-stone-500'

  const unclassifiedDebits = txs.filter(
    t => t.debit > 0 && !t.expense_category_id && !t.transaction_id && t.classification_source !== 'unclassifiable',
  ).length

  async function runAi() {
    setAiBusy(true)
    try {
      const res = await aiClassifyAllUnmatchedBank(month)
      if (res.total === 0) toast.info('未分類の出金はありません')
      else toast.success(`${res.classified}件AI分類／${res.debit_detail_needed}件はデビット明細待ち`)
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI分類失敗')
    } finally {
      setAiBusy(false)
    }
  }

  function categoryNameById(id: string | null): string | null {
    if (!id) return null
    return categories.find(c => c.id === id)?.name ?? null
  }

  async function changeCategory(id: string, categoryId: string) {
    const prev = txs
    setTxs(curr =>
      curr.map(t =>
        t.id === id ? { ...t, expense_category_id: categoryId || null, classification_source: 'manual' } : t,
      ),
    )
    try {
      await updateBankRowCategory(id, categoryId || null)
    } catch (e) {
      setTxs(prev)
      toast.error(e instanceof Error ? e.message : '更新失敗')
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between h-12">
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

        <MonthSelector value={month} onChange={setMonth} />

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
            <p className="text-[10px] text-emerald-700 tracking-wider">入金</p>
            <p className="text-sm font-medium text-emerald-700 mt-1 tabular-nums">
              ¥{totalCredit.toLocaleString('ja-JP')}
            </p>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3">
            <p className="text-[10px] text-rose-700 tracking-wider">出金</p>
            <p className="text-sm font-medium text-rose-700 mt-1 tabular-nums">
              ¥{totalDebit.toLocaleString('ja-JP')}
            </p>
          </div>
          <div className={`border rounded-2xl p-3 ${netCardCls}`}>
            <p className="text-[10px] tracking-wider opacity-80">差引</p>
            <p className="text-sm font-medium mt-1 tabular-nums">
              {net >= 0 ? '' : '−'}¥{Math.abs(net).toLocaleString('ja-JP')}
            </p>
          </div>
        </div>

        {unclassifiedDebits > 0 && (
          <button
            onClick={runAi}
            disabled={aiBusy}
            className="w-full bg-purple-600 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {aiBusy ? 'AI分類中...' : `🤖 AIで未分類${unclassifiedDebits}件を分類`}
          </button>
        )}

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-12 text-stone-400">
            <span className="text-4xl">🏦</span>
            <p className="text-sm">取引がありません</p>
            <Link
              href="/admin/keiri/bank/import"
              className="w-full bg-stone-900 text-white rounded-2xl py-4 text-sm font-medium text-center"
            >
              CSVを取り込む
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-stone-100">
            {txs.map(tx => {
              const catName = categoryNameById(tx.expense_category_id)
              const isUnclassifiable = tx.classification_source === 'unclassifiable'
              return (
                <div key={tx.id} className="p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-stone-400 tabular-nums">{tx.date}</p>
                      <p className="text-sm text-stone-700 truncate">{tx.description}</p>
                      {tx.vendor_guess && (
                        <p className="text-[10px] text-stone-400 truncate">→ {tx.vendor_guess}</p>
                      )}
                    </div>
                    <div className="text-right">
                      {tx.credit > 0 && (
                        <p className="text-sm font-medium text-emerald-700 tabular-nums">
                          +¥{tx.credit.toLocaleString('ja-JP')}
                        </p>
                      )}
                      {tx.debit > 0 && (
                        <p className="text-sm font-medium text-rose-700 tabular-nums">
                          −¥{tx.debit.toLocaleString('ja-JP')}
                        </p>
                      )}
                      {tx.balance !== null && (
                        <p className="text-[10px] text-stone-400 tabular-nums">
                          残高 ¥{tx.balance.toLocaleString('ja-JP')}
                        </p>
                      )}
                    </div>
                  </div>
                  {tx.debit > 0 && !tx.transaction_id && (
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={tx.expense_category_id ?? ''}
                        onChange={e => changeCategory(tx.id, e.target.value)}
                        disabled={isUnclassifiable}
                        className={`text-xs border rounded px-2 py-1 flex-1 ${
                          tx.expense_category_id
                            ? tx.classification_source === 'manual'
                              ? 'border-emerald-300 bg-emerald-50'
                              : tx.classification_source === 'learned'
                                ? 'border-blue-200 bg-blue-50'
                                : tx.classification_source === 'ai'
                                  ? 'border-purple-200 bg-purple-50'
                                  : 'border-stone-200 bg-white'
                            : isUnclassifiable
                              ? 'border-amber-200 bg-amber-50 text-stone-400'
                              : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        <option value="">{isUnclassifiable ? 'デビット明細待ち' : '未分類'}</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {tx.classification_source === 'manual' && <span className="text-[10px] text-emerald-600">手動</span>}
                      {tx.classification_source === 'learned' && <span className="text-[10px] text-blue-600">学習</span>}
                      {tx.classification_source === 'ai' && (
                        <span className={`text-[10px] ${tx.ai_confidence === 'high' ? 'text-purple-600' : 'text-amber-600'}`}>AI{tx.ai_confidence === 'low' ? '?' : ''}</span>
                      )}
                      {tx.classification_source === 'auto' && <span className="text-[10px] text-stone-400">自動</span>}
                    </div>
                  )}
                  {tx.transaction_id && (
                    <p className="mt-1 text-[10px] text-emerald-600">✓ 経費と紐付済</p>
                  )}
                  {catName && <p className="mt-1 text-[10px] text-stone-500">勘定: {catName}</p>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
