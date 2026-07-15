'use client'
export const dynamic = 'force-dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession, getSession } from '@/lib/session'

// 税理士(accountant)・管理者向け: 対象月の請求書原本を一括ダウンロードするページ。

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

function monthOptions(count = 24): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    list.push({ value, label: `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月` })
  }
  return list
}

type PayableRow = {
  id: string
  vendor: string
  amount: number
  invoice_number: string | null
  order_date: string | null
  created_at: string
  status: string
  source: string
  invoice_file_path: string | null
}

const SOURCE_LABEL: Record<string, string> = {
  email_auto: '📧 メール取込',
  drive_auto: '📁 Drive受け箱',
  manual: '✍️ 手動登録',
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<main className="min-h-screen pt-8 px-4" style={{ backgroundColor: '#F5F0E8' }}><p className="text-stone-400 text-sm text-center">読み込み中...</p></main>}>
      <DocumentsInner />
    </Suspense>
  )
}

function DocumentsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const months = useMemo(() => monthOptions(24), [])
  const initialMonth = (() => {
    const q = searchParams.get('month')
    if (q && /^\d{4}-\d{2}$/.test(q)) return q
    return thisMonthJST()
  })()
  const [month, setMonth] = useState(initialMonth)
  const [rows, setRows] = useState<PayableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const admin = getAdminSession()
    const staff = getSession()
    if (!admin && staff?.staffRole !== 'accountant') {
      router.replace('/admin')
      return
    }
    setIsAdmin(!!admin)
  }, [router])

  useEffect(() => {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    const beginIso = new Date(`${start}T00:00:00+09:00`).toISOString()
    const endIso = new Date(`${next}T00:00:00+09:00`).toISOString()

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('keiri_payables')
        .select('id, vendor, amount, invoice_number, order_date, created_at, status, source, invoice_file_path')
        .or(
          `and(order_date.gte.${start},order_date.lt.${next}),and(order_date.is.null,created_at.gte.${beginIso},created_at.lt.${endIso})`,
        )
        .order('order_date', { ascending: true })
      if (cancelled) return
      setRows((data ?? []) as PayableRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [month, supabase])

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push(isAdmin ? '/admin/keiri' : '/admin')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">書類ダウンロード</h1>
          <div className="w-12" />
        </div>

        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        >
          {months.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-xs text-stone-500 tracking-wider">一括ダウンロード ({month})</p>
          <a
            href={`/api/keiri/invoice-bundle?month=${month}`}
            className="block w-full text-center bg-stone-800 text-white rounded-xl px-4 py-3 text-sm font-medium"
          >
            📦 仕入先請求書 ZIP（原本 + 一覧CSV）
          </a>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <a href={`/api/keiri/tax-report/csv?month=${month}`} className="text-center bg-stone-100 rounded-xl px-3 py-2 text-stone-700">📊 月次税務CSV</a>
            <a href={`/api/keiri/tax-report/pdf?month=${month}`} className="text-center bg-stone-100 rounded-xl px-3 py-2 text-stone-700">📄 月次税務PDF</a>
            <a href={`/api/keiri/stripe-payouts/csv?month=${month}`} className="text-center bg-stone-100 rounded-xl px-3 py-2 text-stone-700">💳 Stripe入金CSV</a>
            <a href={`/api/keiri/stripe-payouts/pdf?month=${month}`} className="text-center bg-stone-100 rounded-xl px-3 py-2 text-stone-700">💳 Stripe入金PDF</a>
          </div>
          <p className="text-[10px] text-stone-400">
            ※ 請求書ZIPは登録済みの支払予定(payables)に紐づく原本を集めます。メール/Drive由来の原本取得には Google 接続が必要です。取得できなかったものは ZIP 内 manifest.csv の備考に記載されます。
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-xs text-stone-500 tracking-wider">対象の請求書 ({rows.length}件)</p>
            <p className="text-sm text-stone-700 tabular-nums">合計 ¥{total.toLocaleString()}</p>
          </div>
          {loading ? (
            <p className="text-stone-400 text-sm py-4">読み込み中…</p>
          ) : rows.length === 0 ? (
            <p className="text-stone-400 text-xs py-4">この月の支払予定はまだ登録されていません。メール/Drive取込後にここに並びます。</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map(r => (
                <li key={r.id} className="py-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-stone-800 truncate">{r.vendor}</p>
                      <p className="text-[11px] text-stone-400">
                        {r.order_date ?? r.created_at.slice(0, 10)}
                        <span className="ml-2">{SOURCE_LABEL[r.source] ?? r.source}</span>
                        {r.invoice_file_path && <span className="ml-2 text-emerald-600">📎 添付あり</span>}
                      </p>
                    </div>
                    <span className="text-stone-800 tabular-nums whitespace-nowrap">¥{r.amount.toLocaleString()}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
