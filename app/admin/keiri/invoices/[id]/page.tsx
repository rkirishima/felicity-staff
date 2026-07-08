'use client'
export const dynamic = 'force-dynamic'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import {
  cancelInvoice,
  deleteInvoice,
  markInvoicePaid,
  publishDraftInvoice,
} from '@/app/admin/keiri/invoices/actions'

type Status = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'

type Invoice = {
  id: string
  invoice_number: string | null
  status: Status
  issuer: 'felicity' | 'rook' | null
  issue_date: string
  due_date: string | null
  subtotal_10: number
  subtotal_8: number
  tax_10: number
  tax_8: number
  total: number
  notes: string | null
  sent_at: string | null
  paid_at: string | null
  pdf_path: string | null
  client: { id: string; name: string; email: string | null } | null
}

type Line = {
  id: string
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  amount: number
  sort_order: number
}

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [inv, setInv] = useState<Invoice | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [paidDate, setPaidDate] = useState(todayJST())
  const [sendTo, setSendTo] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendBody, setSendBody] = useState('')
  const [drafting, setDrafting] = useState(false)

  async function generateDraft() {
    setDrafting(true)
    try {
      const res = await fetch(`/api/keiri/invoices/${id}/draft-email`)
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; body?: string; error?: string }
      if (!res.ok || !data.ok || !data.body) throw new Error(data.error || `status ${res.status}`)
      setSendBody(data.body)
      toast.success('AI下書きを生成しました。確認して送信してください')
    } catch (e) {
      toast.error(`AI下書き生成に失敗: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDrafting(false)
    }
  }

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      setLoading(true)
      const [iRes, lRes] = await Promise.all([
        supabase
          .from('keiri_invoices')
          .select(
            'id, invoice_number, status, issuer, issue_date, due_date, subtotal_10, subtotal_8, tax_10, tax_8, total, notes, sent_at, paid_at, pdf_path, client:keiri_clients(id, name, email)',
          )
          .eq('id', id)
          .single(),
        supabase
          .from('keiri_invoice_lines')
          .select('id, description, quantity, unit_price, tax_rate, amount, sort_order')
          .eq('invoice_id', id)
          .order('sort_order'),
      ])
      if (iRes.error || !iRes.data) {
        toast.error('請求書が見つかりません')
        router.replace('/admin/keiri/invoices')
        return
      }
      const data = iRes.data as unknown as Invoice
      setInv(data)
      setSendTo(data.client?.email ?? '')
      setLines((lRes.data ?? []) as Line[])
      setLoading(false)
    })()
  }, [id, router, supabase])

  const today = todayJST()
  const displayStatus: Status | null = inv
    ? inv.status === 'sent' && inv.due_date && inv.due_date < today
      ? 'overdue'
      : inv.status
    : null

  function pdfUrl(forceRegenerate = false): string {
    return `/api/keiri/invoices/${id}/pdf${forceRegenerate ? '?regenerate=1' : ''}`
  }

  async function send() {
    if (!sendTo.trim()) {
      toast.error('送信先メールを入力してください')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/keiri/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to: sendTo.trim(),
          subject: sendSubject.trim() || undefined,
          body: sendBody.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '送信失敗')
      toast.success('送信しました')
      setShowSend(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function recordPayment() {
    setBusy(true)
    try {
      await markInvoicePaid(id, paidDate)
      toast.success('入金を記録しました')
      setShowPay(false)
      setInv(prev => (prev ? { ...prev, status: 'paid', paid_at: paidDate } : prev))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!confirm('この請求書をキャンセルしますか?')) return
    setBusy(true)
    try {
      await cancelInvoice(id)
      toast.success('キャンセルしました')
      setInv(prev => (prev ? { ...prev, status: 'cancelled' } : prev))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const isDraft = inv?.status === 'draft'
    const msg = isDraft
      ? '下書きを削除しますか？'
      : `この請求書 (${inv?.invoice_number ?? ''}) を完全に削除します。\n` +
        'PDF と明細も削除されます。連番は再利用されません。\n' +
        '本当に削除しますか？'
    if (!confirm(msg)) return
    setBusy(true)
    try {
      await deleteInvoice(id)
      toast.success('削除しました')
      router.push('/admin/keiri/invoices')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading || !inv) {
    return (
      <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
        <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/invoices')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">
            {inv.invoice_number ?? '（下書き）'}
          </h1>
          <span className="w-10" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-600">{inv.client?.name ?? '—'} 御中</p>
            <span className="flex items-center gap-1.5">
              {inv.issuer === 'rook' && (
                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  ROOK名義
                </span>
              )}
              <Badge status={displayStatus!} />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-stone-500">
            <p>発行日: {inv.issue_date}</p>
            <p>支払期限: {inv.due_date ?? '—'}</p>
            {inv.sent_at && <p>送付日時: {new Date(inv.sent_at).toLocaleString('ja-JP')}</p>}
            {inv.paid_at && <p>入金日: {inv.paid_at}</p>}
          </div>
          <p className="text-2xl font-light text-stone-900 pt-2">¥{inv.total.toLocaleString()}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="text-xs text-stone-500 tracking-wider">明細</p>
          <ul className="divide-y divide-stone-100">
            {lines.map(l => (
              <li key={l.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-stone-800 whitespace-pre-wrap">{l.description}</p>
                  <p className="text-[10px] text-stone-400">
                    {l.quantity} × ¥{l.unit_price.toLocaleString()} ({l.tax_rate}%)
                  </p>
                </div>
                <p className="text-sm text-stone-700">¥{l.amount.toLocaleString()}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-stone-200 pt-3 space-y-1 text-sm">
            {inv.subtotal_10 > 0 && (
              <>
                <SumRow label="10% 税抜小計" value={inv.subtotal_10} />
                <SumRow label="10% 消費税" value={inv.tax_10} />
              </>
            )}
            {inv.subtotal_8 > 0 && (
              <>
                <SumRow label="8% 税抜小計" value={inv.subtotal_8} />
                <SumRow label="8% 消費税" value={inv.tax_8} />
              </>
            )}
            {inv.total - inv.subtotal_10 - inv.tax_10 - inv.subtotal_8 - inv.tax_8 > 0 && (
              <SumRow
                label="0% 対象（非課税・経費）"
                value={inv.total - inv.subtotal_10 - inv.tax_10 - inv.subtotal_8 - inv.tax_8}
              />
            )}
            <div className="flex items-center justify-between pt-2 border-t border-stone-200">
              <span className="text-stone-700">合計（税込）</span>
              <span className="text-stone-900 font-medium">¥{inv.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {inv.notes && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-xs text-stone-500 tracking-wider mb-1">備考</p>
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{inv.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <a
            href={pdfUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-stone-300 text-stone-700 py-4 rounded-2xl font-medium shadow-sm text-center"
          >
            PDF を開く
          </a>
          <a
            href={pdfUrl(true)}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-stone-300 text-stone-600 py-4 rounded-2xl text-sm shadow-sm text-center"
          >
            PDF 再生成
          </a>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3" style={{ aspectRatio: '210/297' }}>
          <iframe
            key={inv.invoice_number ?? 'draft'}
            src={`/api/keiri/invoices/${inv.id}/pdf`}
            className="w-full h-full"
            title="invoice PDF"
          />
        </div>

        {inv.status === 'draft' && (
          <button
            onClick={async () => {
              const email = inv.client?.email
              const msg = email
                ? `この下書きを発行します。番号が採番され、取引先メール (${email}) に PDF が送信されます。続行しますか？`
                : 'この下書きを発行します。番号が採番されますが、取引先メールが未設定のためメール送信はスキップされます。続行しますか？'
              if (!confirm(msg)) return
              setPublishing(true)
              try {
                const res = await publishDraftInvoice(inv.id, { sendEmail: !!email })
                // 発行は完了している。画面状態を即更新して、古い下書き表示のまま
                // 再度「発行」を押して「下書きのみ発行できます」エラーになるのを防ぐ。
                setInv(prev =>
                  prev
                    ? {
                        ...prev,
                        status: 'sent',
                        invoice_number: res.invoice_number,
                        sent_at: res.emailSent ? new Date().toISOString() : null,
                      }
                    : prev,
                )
                if (res.emailError) {
                  toast.error(`発行しましたがメール送信に失敗: ${res.emailError}（未送信として保存、再送信できます）`)
                } else if (res.emailSent) {
                  toast.success(`発行＆送信しました (${res.invoice_number})`)
                } else {
                  toast.success(`発行しました (${res.invoice_number})`)
                }
                router.refresh()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : '発行失敗')
              } finally {
                setPublishing(false)
              }
            }}
            disabled={publishing}
            className="w-full bg-emerald-600 text-white py-3 rounded-2xl font-medium active:scale-[0.99] transition-transform disabled:opacity-50"
          >
            {publishing ? '発行中…' : 'この内容で発行する'}
          </button>
        )}

        {inv.status === 'sent' && (
          <button
            onClick={() => setShowSend(true)}
            disabled={busy}
            className={`w-full text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40 ${
              inv.sent_at ? 'bg-stone-800' : 'bg-amber-600'
            }`}
          >
            {inv.sent_at ? 'メール再送信' : '⚠ 未送信 — メールを送信する'}
          </button>
        )}

        {(inv.status === 'sent') && (
          <button
            onClick={() => setShowPay(true)}
            disabled={busy}
            className="w-full bg-emerald-700 text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
          >
            入金を記録する
          </button>
        )}

        {inv.status !== 'cancelled' && (
          <button
            onClick={cancel}
            disabled={busy}
            className="w-full bg-white border border-stone-300 text-stone-600 py-3 rounded-2xl text-sm shadow-sm disabled:opacity-40"
          >
            この請求書をキャンセル
          </button>
        )}

        <button
          onClick={remove}
          disabled={busy}
          className="w-full bg-white border border-red-300 text-red-600 py-3 rounded-2xl text-sm shadow-sm disabled:opacity-40"
        >
          {inv.status === 'draft' ? '下書きを削除' : 'この請求書を完全に削除'}
        </button>

        {showSend && (
          <Modal title="メール再送信" onClose={() => setShowSend(false)}>
            <div className="space-y-3">
              <FieldM label="宛先">
                <input value={sendTo} onChange={e => setSendTo(e.target.value)} className={inputClsM} />
              </FieldM>
              <FieldM label="件名（空欄で既定）">
                <input value={sendSubject} onChange={e => setSendSubject(e.target.value)} className={inputClsM} />
              </FieldM>
              <FieldM label="本文（空欄でAI自動生成 / 定型文）">
                <textarea value={sendBody} onChange={e => setSendBody(e.target.value)} className={inputClsM} rows={8} />
              </FieldM>
              <button
                onClick={generateDraft}
                disabled={drafting || busy}
                className="w-full bg-white border border-emerald-600 text-emerald-700 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-40"
              >
                {drafting ? 'AI下書き生成中…' : '✦ AIで本文を下書き'}
              </button>
              <button
                onClick={send}
                disabled={busy || drafting}
                className="w-full bg-stone-800 text-white py-3 rounded-2xl font-medium shadow-sm disabled:opacity-40"
              >
                {busy ? '送信中...' : '送信'}
              </button>
            </div>
          </Modal>
        )}

        {showPay && (
          <Modal title="入金記録" onClose={() => setShowPay(false)}>
            <div className="space-y-3">
              <FieldM label="入金日">
                <input
                  type="date"
                  value={paidDate}
                  onChange={e => setPaidDate(e.target.value)}
                  className={inputClsM}
                />
              </FieldM>
              <button
                onClick={recordPayment}
                disabled={busy}
                className="w-full bg-emerald-700 text-white py-3 rounded-2xl font-medium shadow-sm disabled:opacity-40"
              >
                {busy ? '保存中...' : '記録する'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </main>
  )
}

function Badge({ status }: { status: Status }) {
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

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-stone-600">{label}</span>
      <span className="text-stone-800">¥{value.toLocaleString()}</span>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-stone-800">{title}</h2>
          <button onClick={onClose} className="text-stone-400 text-sm">閉じる</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputClsM =
  'w-full bg-white rounded-xl px-3 py-2.5 text-sm border border-stone-200 outline-none focus:border-stone-400'

function FieldM({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-500 tracking-wider mb-1">{label}</span>
      {children}
    </label>
  )
}
