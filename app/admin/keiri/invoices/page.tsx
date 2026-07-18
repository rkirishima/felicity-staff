'use client'
export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { deleteInvoice, markInvoicePaid } from '@/app/admin/keiri/invoices/actions'
import { MonthSelector } from '@/components/keiri/MonthSelector'
import { LoadError } from '@/components/keiri/LoadError'

type Status = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
type Tab = 'all' | Status

type Row = {
  id: string
  invoice_number: string | null
  status: Status
  issuer: 'felicity' | 'rook' | null
  issue_date: string
  due_date: string | null
  total: number
  client: { name: string } | null
}

function thisMonthJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}
function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'draft', label: '下書き' },
  { key: 'sent', label: '送付済' },
  { key: 'paid', label: '入金済' },
  { key: 'overdue', label: '期限超過' },
  { key: 'cancelled', label: 'キャンセル' },
]

export default function InvoicesListPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        </main>
      }
    >
      <InvoicesListInner />
    </Suspense>
  )
}

function InvoicesListInner() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const initialTab = (params.get('status') as Tab | null) ?? 'all'
  const [tab, setTab] = useState<Tab>(
    TABS.some(t => t.key === initialTab) ? initialTab : 'all',
  )
  const [month, setMonth] = useState<string>(thisMonthJST())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase, month])

  async function load() {
    setLoading(true)
    setLoadErr(null)
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    const { data, error } = await supabase
      .from('keiri_invoices')
      .select('id, invoice_number, status, issuer, issue_date, due_date, total, client:keiri_clients(name)')
      .gte('issue_date', start)
      .lt('issue_date', next)
      .order('issue_date', { ascending: false })
      .order('invoice_number', { ascending: false })
    setLoadErr(error ? error.message : null)
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }

  async function handleDeleteDraft(id: string) {
    if (!confirm('この下書きを削除しますか？')) return
    setDeletingId(id)
    try {
      await deleteInvoice(id)
      setRows(prev => prev.filter(r => r.id !== id))
      toast.success('削除しました')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '削除失敗')
    } finally {
      setDeletingId(null)
    }
  }

  async function sendReminder(r: Row) {
    if (!confirm(`${r.client?.name ?? '取引先'} に支払いリマインドを送信します。続行しますか？`)) return
    setActing(r.id)
    try {
      const res = await fetch(`/api/keiri/invoices/${r.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `【支払いリマインド】請求書 ${r.invoice_number ?? ''} のご確認のお願い`,
          body:
            `${r.client?.name ?? ''} 御中\n\n` +
            'いつもお世話になっております。\n' +
            `下記請求書につきまして、お支払期限を過ぎておりますためご確認のほどお願い申し上げます。\n\n` +
            `請求書番号: ${r.invoice_number ?? '-'}\n` +
            `ご請求金額: ¥${r.total.toLocaleString('ja-JP')}（税込）\n` +
            `お支払期限: ${r.due_date ?? '-'}\n\n` +
            'すでにお振込済みの場合は本メールをご放念ください。\n\n' +
            '何卒よろしくお願い申し上げます。',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `status ${res.status}`)
      }
      toast.success('リマインドを送信しました')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'リマインド送信失敗')
    } finally {
      setActing(null)
    }
  }

  async function confirmPaid(r: Row) {
    if (!confirm(`${r.invoice_number ?? '請求書'} (¥${r.total.toLocaleString('ja-JP')}) を入金済みにします。続行しますか？`)) return
    setActing(r.id)
    try {
      await markInvoicePaid(r.id, todayJST())
      toast.success('入金済みにしました')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗')
    } finally {
      setActing(null)
    }
  }

  const today = todayJST()
  const decorated = rows.map(r => {
    const isOverdue = r.status === 'sent' && r.due_date && r.due_date < today
    return { ...r, displayStatus: (isOverdue ? 'overdue' : r.status) as Status }
  })
  const filtered = tab === 'all' ? decorated : decorated.filter(r => r.displayStatus === tab)
  const total = filtered.reduce((s, r) => s + (r.total || 0), 0)

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between h-12">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">請求書</h1>
          <Link href="/admin/keiri/invoices/new" className="text-sm text-stone-700">+ 新規</Link>
        </div>

        <LoadError message={loadErr} />

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <MonthSelector value={month} onChange={setMonth} />
          </div>
          <span className="text-xs text-stone-500 tabular-nums">合計 ¥{total.toLocaleString('ja-JP')}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-1.5 rounded-full ${
                tab === t.key
                  ? 'bg-stone-800 text-white'
                  : 'bg-white text-stone-600 border border-stone-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-stone-400 text-sm py-12">請求書はありません</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map(r => {
              const isOverdue = r.displayStatus === 'overdue'
              return (
                <li key={r.id} className="relative">
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <Link href={`/admin/keiri/invoices/${r.id}`} className="block">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-stone-800 tabular-nums">
                          {r.invoice_number ?? '（下書き）'}
                        </p>
                        <p className="text-sm text-stone-700 tabular-nums">¥{r.total.toLocaleString('ja-JP')}</p>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-stone-500">{r.client?.name ?? '—'}</p>
                        <p className="text-[10px] text-stone-400 tabular-nums">
                          {r.issue_date} / 期限: {r.due_date ?? '—'}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <StatusBadge status={r.displayStatus} />
                        {r.issuer === 'rook' && (
                          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            ROOK
                          </span>
                        )}
                      </div>
                    </Link>
                    {isOverdue && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-rose-100">
                        <button
                          type="button"
                          onClick={() => sendReminder(r)}
                          disabled={acting === r.id}
                          className="flex-1 text-xs bg-rose-50 text-rose-600 rounded-xl py-2 disabled:opacity-50"
                        >
                          {acting === r.id ? '送信中…' : 'リマインド送信'}
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmPaid(r)}
                          disabled={acting === r.id}
                          className="flex-1 text-xs bg-emerald-500 text-white rounded-xl py-2 disabled:opacity-50"
                        >
                          {acting === r.id ? '保存中…' : '入金確認'}
                        </button>
                      </div>
                    )}
                  </div>
                  {r.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(r.id)}
                      disabled={deletingId === r.id}
                      aria-label="下書きを削除"
                      className="absolute top-2 right-2 w-7 h-7 rounded-full text-stone-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-sm disabled:opacity-40"
                    >
                      {deletingId === r.id ? '…' : '×'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    draft: { label: '下書き', cls: 'bg-stone-100 text-stone-500' },
    sent: { label: '送付済', cls: 'bg-blue-100 text-blue-700' },
    paid: { label: '入金済', cls: 'bg-emerald-100 text-emerald-700' },
    overdue: { label: '期限超過', cls: 'bg-rose-100 text-rose-700' },
    cancelled: { label: 'キャンセル', cls: 'bg-stone-100 text-stone-400 line-through' },
  }
  const m = map[status]
  return <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
}
