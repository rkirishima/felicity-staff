'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { deleteInvoice } from '@/app/admin/keiri/invoices/actions'

type Status = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
type Tab = 'all' | Status

type Row = {
  id: string
  invoice_number: string | null
  status: Status
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
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [tab, setTab] = useState<Tab>('all')
  const [month, setMonth] = useState<string>(thisMonthJST())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

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
        .from('keiri_invoices')
        .select('id, invoice_number, status, issue_date, due_date, total, client:keiri_clients(name)')
        .gte('issue_date', start)
        .lt('issue_date', next)
        .order('issue_date', { ascending: false })
        .order('invoice_number', { ascending: false })
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
    })()
  }, [router, supabase, month])

  const [deletingId, setDeletingId] = useState<string | null>(null)

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
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">請求書</h1>
          <Link href="/admin/keiri/invoices/new" className="text-sm text-stone-700">+ 新規</Link>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="bg-white rounded-xl px-3 py-1.5 text-sm border border-stone-200"
          />
          <span className="text-xs text-stone-500">合計 ¥{total.toLocaleString()}</span>
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
            {filtered.map(r => (
              <li key={r.id} className="relative">
                <Link href={`/admin/keiri/invoices/${r.id}`} className="block bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-800">
                      {r.invoice_number ?? '（下書き）'}
                    </p>
                    <p className="text-sm text-stone-700">¥{r.total.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-stone-500">{r.client?.name ?? '—'}</p>
                    <p className="text-[10px] text-stone-400">
                      {r.issue_date} / 期限: {r.due_date ?? '—'}
                    </p>
                  </div>
                  <div className="mt-1">
                    <StatusBadge status={r.displayStatus} />
                  </div>
                </Link>
                {r.status === 'draft' && (
                  <button
                    type="button"
                    onClick={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleDeleteDraft(r.id)
                    }}
                    disabled={deletingId === r.id}
                    aria-label="下書きを削除"
                    className="absolute top-2 right-2 w-7 h-7 rounded-full text-stone-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-sm disabled:opacity-40"
                  >
                    {deletingId === r.id ? '…' : '×'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    draft: { label: '下書き', cls: 'bg-stone-100 text-stone-600' },
    sent: { label: '送付済', cls: 'bg-blue-50 text-blue-700' },
    paid: { label: '入金済', cls: 'bg-emerald-50 text-emerald-700' },
    overdue: { label: '期限超過', cls: 'bg-red-50 text-red-700' },
    cancelled: { label: 'キャンセル', cls: 'bg-stone-50 text-stone-400' },
  }
  const m = map[status]
  return <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
}
