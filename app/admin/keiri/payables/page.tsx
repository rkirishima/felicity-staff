'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { markPaid, markCancelled, reopenPayable, deletePayable, type PaidVia } from './actions'

type Row = {
  id: string
  vendor: string
  description: string | null
  amount: number
  invoice_number: string | null
  order_date: string | null
  due_date: string
  status: 'pending' | 'paid' | 'cancelled'
  paid_at: string | null
  paid_amount: number | null
  paid_via: string | null
  notes: string | null
  source: string
  invoice_file_path: string | null
}

type Tab = 'pending' | 'overdue' | 'paid' | 'all'

function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function daysFromToday(dateStr: string): number {
  const today = new Date(todayJST() + 'T00:00:00Z').getTime()
  const target = new Date(dateStr + 'T00:00:00Z').getTime()
  return Math.round((target - today) / 86400000)
}

export default function PayablesPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('keiri_payables')
        .select('id, vendor, description, amount, invoice_number, order_date, due_date, status, paid_at, paid_amount, paid_via, notes, source, invoice_file_path')
        .order('due_date', { ascending: true })
      if (cancelled) return
      setRows((data ?? []) as Row[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, reload])

  const today = todayJST()
  const filtered = useMemo(() => {
    let f = rows
    if (tab === 'pending') f = rows.filter(r => r.status === 'pending')
    else if (tab === 'overdue') f = rows.filter(r => r.status === 'pending' && r.due_date < today)
    else if (tab === 'paid') f = rows.filter(r => r.status === 'paid')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      f = f.filter(r =>
        r.vendor.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.invoice_number ?? '').toLowerCase().includes(q),
      )
    }
    return f
  }, [rows, tab, search, today])

  const totals = useMemo(() => {
    const pending = rows.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0)
    const overdue = rows.filter(r => r.status === 'pending' && r.due_date < today).reduce((s, r) => s + r.amount, 0)
    const dueSoon = rows
      .filter(r => r.status === 'pending' && r.due_date >= today && daysFromToday(r.due_date) <= 7)
      .reduce((s, r) => s + r.amount, 0)
    return { pending, overdue, dueSoon }
  }, [rows, today])

  async function handlePay(r: Row) {
    const via = window.prompt(
      `${r.vendor} ¥${r.amount.toLocaleString()} の支払方法を選んでください:\n1: 振込\n2: 現金\n3: クレジット\n4: その他`,
    )
    if (!via) return
    const map: Record<string, PaidVia> = { '1': 'bank_transfer', '2': 'cash', '3': 'credit_card', '4': 'other' }
    const paid_via = map[via.trim()]
    if (!paid_via) { toast.error('無効な選択'); return }
    try {
      await markPaid(r.id, { paid_via })
      toast.success('支払済にマークしました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗')
    }
  }

  async function handleCancel(r: Row) {
    if (!confirm(`「${r.vendor} ¥${r.amount.toLocaleString()}」をキャンセル扱いにしますか？`)) return
    try {
      await markCancelled(r.id)
      toast.success('キャンセルしました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗')
    }
  }

  async function handleReopen(r: Row) {
    if (!confirm(`「${r.vendor}」を未払に戻しますか？`)) return
    try {
      await reopenPayable(r.id)
      toast.success('未払に戻しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗')
    }
  }

  async function handleDelete(r: Row) {
    if (!confirm(`「${r.vendor}」を削除しますか？（復元不可）`)) return
    try {
      await deletePayable(r.id)
      toast.success('削除しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗')
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">仕入れ未払</h1>
          <Link
            href="/admin/keiri/payables/new"
            className="text-sm text-emerald-700 px-3 py-1.5 bg-white rounded-xl shadow-sm"
          >
            + 追加
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl shadow-sm p-3">
            <p className="text-[10px] text-stone-500">未払合計</p>
            <p className="text-sm font-medium text-stone-900 tabular-nums mt-1">¥{totals.pending.toLocaleString()}</p>
          </div>
          <div className="bg-amber-50 rounded-2xl shadow-sm p-3 border border-amber-200">
            <p className="text-[10px] text-amber-700">7日以内</p>
            <p className="text-sm font-medium text-amber-900 tabular-nums mt-1">¥{totals.dueSoon.toLocaleString()}</p>
          </div>
          <div className="bg-rose-50 rounded-2xl shadow-sm p-3 border border-rose-200">
            <p className="text-[10px] text-rose-700">期日超過</p>
            <p className="text-sm font-medium text-rose-900 tabular-nums mt-1">¥{totals.overdue.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm">
          {([
            { k: 'pending' as Tab, label: '未払' },
            { k: 'overdue' as Tab, label: '期日超過' },
            { k: 'paid' as Tab, label: '支払済' },
            { k: 'all' as Tab, label: '全て' },
          ]).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 text-xs rounded-xl transition ${
                tab === k ? 'bg-stone-800 text-white font-medium' : 'text-stone-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="取引先・摘要・請求書番号で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        />

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-500 text-sm mb-3">該当する未払はありません</p>
            <Link
              href="/admin/keiri/payables/new"
              className="inline-block bg-stone-800 text-white py-2 px-4 rounded-xl text-sm"
            >
              新しい未払を追加
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(r => {
              const days = daysFromToday(r.due_date)
              const isOverdue = r.status === 'pending' && days < 0
              const isDueSoon = r.status === 'pending' && days >= 0 && days <= 7
              const sourceBadge = r.source !== 'manual'
              return (
                <li
                  key={r.id}
                  className={`bg-white rounded-2xl shadow-sm p-4 ${
                    r.status === 'paid' ? 'opacity-60' :
                    isOverdue ? 'border-2 border-rose-300' :
                    isDueSoon ? 'border border-amber-200' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-stone-800 truncate">{r.vendor}</p>
                        {r.status === 'paid' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">支払済</span>
                        )}
                        {r.status === 'paid' && !r.invoice_file_path && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">📄 請求書未アップ</span>
                        )}
                        {r.invoice_file_path && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">📄 添付済</span>
                        )}
                        {r.status === 'cancelled' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-500 rounded">キャンセル</span>
                        )}
                        {isOverdue && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded font-medium">
                            {Math.abs(days)}日超過
                          </span>
                        )}
                        {isDueSoon && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                            {days === 0 ? '本日' : `${days}日後`}
                          </span>
                        )}
                        {sourceBadge && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">📧 メール</span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-xs text-stone-500 mt-0.5 truncate">{r.description}</p>
                      )}
                      <p className="text-[10px] text-stone-400 mt-1">
                        期日 {r.due_date}
                        {r.invoice_number && ` ・請求書 ${r.invoice_number}`}
                        {r.status === 'paid' && r.paid_at && (
                          <span className="text-emerald-600 ml-2">
                            ・{r.paid_at.slice(0, 10)} {r.paid_via === 'bank_transfer' ? '振込' : r.paid_via === 'cash' ? '現金' : r.paid_via === 'credit_card' ? 'カード' : 'その他'}
                          </span>
                        )}
                      </p>
                      {r.notes && (
                        <p className="text-[10px] text-stone-500 mt-1">📝 {r.notes}</p>
                      )}
                    </div>
                    <span className="tabular-nums text-stone-900 font-medium whitespace-nowrap">
                      ¥{r.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-1 mt-2 justify-end">
                    {r.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handlePay(r)}
                          className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg"
                        >
                          ✓ 支払
                        </button>
                        <Link
                          href={`/admin/keiri/payables/${r.id}`}
                          className="text-xs px-3 py-1 bg-stone-100 text-stone-700 rounded-lg"
                        >
                          編集
                        </Link>
                        <button
                          onClick={() => handleCancel(r)}
                          className="text-xs px-3 py-1 bg-stone-100 text-stone-500 rounded-lg"
                        >
                          キャンセル
                        </button>
                      </>
                    )}
                    {r.status === 'paid' && (
                      <button
                        onClick={() => handleReopen(r)}
                        className="text-xs px-3 py-1 bg-stone-100 text-stone-600 rounded-lg"
                      >
                        未払に戻す
                      </button>
                    )}
                    {(r.status === 'cancelled' || r.status === 'paid') && (
                      <button
                        onClick={() => handleDelete(r)}
                        className="text-xs px-3 py-1 bg-rose-50 text-rose-600 rounded-lg"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
          <p className="font-medium">💡 仕組み</p>
          <p>・期日 7日前と当日朝に Telegram でリマインダー</p>
          <p>・銀行 CSV を取り込むと、取引先名・金額が一致する未払を自動的に「支払済」マーク</p>
          <p>・Phase 2 で Gmail からの仕入先メール自動取込（未実装）</p>
        </div>
      </div>
    </main>
  )
}
