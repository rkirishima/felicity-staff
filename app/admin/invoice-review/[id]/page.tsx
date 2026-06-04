/**
 * 請求書ドラフトレビュー画面。
 * Telegram通知のリンクから開く想定。
 */
'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import { FileText, Send, AlertCircle, Check } from 'lucide-react'

type Invoice = {
  id: string
  invoice_number: string
  client_id: string
  issue_date: string
  due_date: string
  subtotal_8: number
  tax_8: number
  total: number
  status: 'draft' | 'sent' | 'paid' | 'void'
  notes: string | null
  pdf_path: string | null
  sent_at: string | null
  paid_at: string | null
  keiri_clients?: { name: string; email: string | null }
}

type Line = {
  description: string
  quantity: number
  unit_price: number
  amount: number
  sort_order: number | null
}

export default function InvoiceReviewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  useEffect(() => {
    if (!hasAccess || !params?.id) return
    load()
  }, [hasAccess, params?.id])

  async function load() {
    setLoading(true)
    const { data: inv } = await supabase
      .from('keiri_invoices')
      .select('*, keiri_clients(name, email)')
      .eq('id', params.id)
      .single()
    setInvoice(inv as Invoice | null)
    if (inv?.pdf_path) {
      // signed URL を生成
      const { data } = await supabase.storage.from('invoices').createSignedUrl(inv.pdf_path, 3600)
      setPdfUrl(data?.signedUrl ?? null)
    }
    const { data: ls } = await supabase
      .from('keiri_invoice_lines')
      .select('description, quantity, unit_price, amount, sort_order')
      .eq('invoice_id', params.id)
      .order('sort_order', { ascending: true })
    setLines((ls as Line[]) ?? [])
    setLoading(false)
  }

  async function approveAndSend() {
    if (!invoice) return
    const recipient = invoice.keiri_clients?.email
    if (!recipient) {
      toast.error('送付先メール未設定')
      return
    }
    if (!confirm(`${recipient} に請求書を送付します。よろしいですか?`)) return
    setSending(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'send failed')
      toast.success('送付しました')
      load()
    } catch (e) {
      toast.error(`送付失敗: ${(e as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者ログインが必要です</div>
      </main>
    )
  }

  if (loading || !invoice) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1c1917' }}>
        <p className="text-stone-400">読み込み中...</p>
      </main>
    )
  }

  const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
  const ym = invoice.invoice_number.replace(/^FCR-/, '')

  return (
    <main className="min-h-screen pb-24 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">請求書 {ym}</h1>
          <span className={`ml-auto text-xs px-2 py-1 rounded ${
            invoice.status === 'sent' ? 'bg-emerald-900 text-emerald-200' :
            invoice.status === 'paid' ? 'bg-teal-900 text-teal-200' :
            invoice.status === 'void' ? 'bg-stone-800 text-stone-400' :
            'bg-amber-900 text-amber-200'
          }`}>
            {invoice.status === 'draft' ? 'ドラフト' :
             invoice.status === 'sent' ? '送付済み' :
             invoice.status === 'paid' ? '入金済み' : '無効'}
          </span>
        </div>
        <p className="text-xs text-stone-400 mt-1">
          {invoice.keiri_clients?.name} · 発行 {invoice.issue_date} · 支払期限 {invoice.due_date}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* 集計 */}
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
          <p className="text-xs text-stone-400 tracking-wider mb-2">ご請求金額</p>
          <p className="text-3xl font-bold text-white">{yen(invoice.total)}</p>
          <p className="text-xs text-stone-500 mt-1">税抜 {yen(invoice.subtotal_8)} + 消費税8% {yen(invoice.tax_8)}</p>
        </div>

        {/* 明細 */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
          <div className="px-4 py-2 text-xs text-stone-400 tracking-wider" style={{ backgroundColor: '#1c1917' }}>明細</div>
          {lines.map((l, i) => (
            <div key={i} className="px-4 py-2 flex justify-between items-center text-sm border-t" style={{ borderColor: '#3f3f3f' }}>
              <div className="flex-1 min-w-0">
                <p className="text-stone-200 truncate">{l.description}</p>
                <p className="text-xs text-stone-500">{Number(l.quantity).toFixed(1)} kg × ¥{l.unit_price.toLocaleString('ja-JP')}</p>
              </div>
              <p className="text-stone-100">{yen(l.amount)}</p>
            </div>
          ))}
        </div>

        {/* PDF プレビュー */}
        {pdfUrl && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #44403c' }}>
            <iframe src={pdfUrl} className="w-full" style={{ height: '70vh', backgroundColor: '#fff' }} title="invoice pdf" />
          </div>
        )}

        {/* 送付ボタン */}
        {invoice.status === 'draft' ? (
          <div className="space-y-2">
            <div className="text-xs text-stone-400 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p>送付先: <span className="text-stone-200">{invoice.keiri_clients?.email ?? '(未設定)'}</span></p>
            </div>
            <button
              onClick={approveAndSend}
              disabled={sending || !invoice.keiri_clients?.email}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-700 disabled:text-stone-500 text-white font-semibold py-4 rounded-lg transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Send size={18} />
              {sending ? '送付中...' : '承認して送付'}
            </button>
          </div>
        ) : (
          <div className="rounded-lg px-4 py-3 flex items-center gap-2" style={{ backgroundColor: '#022c22', border: '1px solid #064e3b' }}>
            <Check size={16} className="text-emerald-400" />
            <div className="text-xs text-emerald-200">
              {invoice.sent_at && <p>送付済み: {new Date(invoice.sent_at).toLocaleString('ja-JP')}</p>}
              {invoice.paid_at && <p>入金確認: {new Date(invoice.paid_at).toLocaleString('ja-JP')}</p>}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
