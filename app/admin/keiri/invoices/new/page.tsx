'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { issueInvoice, type InvoiceLineInput } from '@/app/admin/keiri/invoices/actions'
import { groupByTaxRate, type TaxRate } from '@/lib/keiri/tax'

type ClientRow = { id: string; name: string }
type ItemRow = { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; unit: string | null }

type LineDraft = {
  item_id: string
  name: string
  description: string
  quantity: string
  unit_price: string
  tax_rate: TaxRate
}

function emptyLine(): LineDraft {
  return { item_id: '', name: '', description: '', quantity: '1', unit_price: '0', tax_rate: 10 }
}

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
function endOfNextMonthJST(): string {
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() // 0-11
  // last day of (m+2)th month → use day 0 of (m+2)th month
  const end = new Date(Date.UTC(y, m + 2, 0))
  return end.toISOString().slice(0, 10)
}

const inputCls =
  'w-full bg-white rounded-xl px-3 py-2.5 text-sm border border-stone-200 outline-none focus:border-stone-400'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-500 tracking-wider mb-1">{label}</span>
      {children}
    </label>
  )
}

export default function NewInvoicePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [clients, setClients] = useState<ClientRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [clientId, setClientId] = useState('')
  const [issueDate, setIssueDate] = useState(todayJST())
  const [dueDate, setDueDate] = useState(endOfNextMonthJST())
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      const [cRes, iRes] = await Promise.all([
        supabase.from('keiri_clients').select('id, name').eq('active', true).order('name'),
        supabase
          .from('keiri_items')
          .select('id, name, description, unit_price, tax_rate, unit')
          .eq('active', true)
          .order('name'),
      ])
      setClients((cRes.data ?? []) as ClientRow[])
      setItems((iRes.data ?? []) as ItemRow[])
    })()
  }, [router, supabase])

  function updateLine<K extends keyof LineDraft>(idx: number, key: K, value: LineDraft[K]) {
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)))
  }

  function pickItem(idx: number, itemId: string) {
    if (!itemId) {
      updateLine(idx, 'item_id', '')
      return
    }
    const item = items.find(it => it.id === itemId)
    if (!item) return
    setLines(prev =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              item_id: item.id,
              name: item.name,
              description: item.description ?? '',
              unit_price: String(item.unit_price),
              tax_rate: (item.tax_rate === 8 ? 8 : 10) as TaxRate,
            }
          : l,
      ),
    )
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()])
  }
  function removeLine(idx: number) {
    setLines(prev => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  const taxLines = lines.map(l => ({
    quantity: parseInt(l.quantity || '0', 10) || 0,
    unit_price: parseInt(l.unit_price || '0', 10) || 0,
    tax_rate: l.tax_rate,
  }))
  const summary = groupByTaxRate(taxLines)

  function buildInput(): { client_id: string; issue_date: string; due_date: string | null; notes: string | null; lines: InvoiceLineInput[] } {
    return {
      client_id: clientId,
      issue_date: issueDate,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      lines: lines.map(l => ({
        item_id: l.item_id || null,
        name: l.name.trim(),
        description: l.description.trim() || null,
        quantity: parseInt(l.quantity || '0', 10) || 0,
        unit_price: parseInt(l.unit_price || '0', 10) || 0,
        tax_rate: l.tax_rate,
      })),
    }
  }

  async function save(publish: boolean) {
    setSaving(publish ? 'publish' : 'draft')
    try {
      const out = await issueInvoice(buildInput(), { publish })
      toast.success(publish ? `発行しました ${out.invoice_number ?? ''}` : '下書き保存しました')
      router.push(`/admin/keiri/invoices/${out.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <main className="min-h-screen pb-32 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/invoices')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">請求書を作成</h1>
          <span className="w-10" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <Field label="取引先 *">
            <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
              <option value="">選択してください</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="発行日">
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label="支払期限">
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <p className="text-xs text-stone-500 tracking-wider">明細</p>
          {lines.map((l, idx) => {
            const qty = parseInt(l.quantity || '0', 10) || 0
            const price = parseInt(l.unit_price || '0', 10) || 0
            const amt = qty * price
            return (
              <div key={idx} className="border border-stone-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-stone-400">行 {idx + 1}</span>
                  <button onClick={() => removeLine(idx)} className="text-xs text-stone-400 hover:text-red-500">削除</button>
                </div>
                <Field label="商品マスタから選択">
                  <select value={l.item_id} onChange={e => pickItem(idx, e.target.value)} className={inputCls}>
                    <option value="">未選択（手入力）</option>
                    {items.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.name} (¥{it.unit_price.toLocaleString()} {it.tax_rate}%)
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="品名 *">
                  <input value={l.name} onChange={e => updateLine(idx, 'name', e.target.value)} className={inputCls} />
                </Field>
                <Field label="説明">
                  <input
                    value={l.description}
                    onChange={e => updateLine(idx, 'description', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="数量">
                    <input
                      inputMode="numeric"
                      value={l.quantity}
                      onChange={e => updateLine(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="単価(税抜)">
                    <input
                      inputMode="numeric"
                      value={l.unit_price}
                      onChange={e => updateLine(idx, 'unit_price', e.target.value.replace(/[^0-9]/g, ''))}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="税率">
                    <select
                      value={l.tax_rate}
                      onChange={e => updateLine(idx, 'tax_rate', parseInt(e.target.value, 10) === 8 ? 8 : 10)}
                      className={inputCls}
                    >
                      <option value={10}>10%</option>
                      <option value={8}>8%</option>
                    </select>
                  </Field>
                </div>
                <p className="text-right text-xs text-stone-500">金額: ¥{amt.toLocaleString()}</p>
              </div>
            )
          })}
          <button onClick={addLine} className="w-full bg-stone-100 text-stone-700 py-2 rounded-xl text-sm">
            + 明細を追加
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-2">
          {summary.subtotal_10 > 0 && (
            <>
              <Row label="10% 対象 税抜小計" value={summary.subtotal_10} />
              <Row label="10% 消費税" value={summary.tax_10} />
            </>
          )}
          {summary.subtotal_8 > 0 && (
            <>
              <Row label="8% 対象 税抜小計" value={summary.subtotal_8} />
              <Row label="8% 消費税" value={summary.tax_8} />
            </>
          )}
          <div className="flex items-center justify-between border-t border-stone-200 pt-2 mt-2">
            <span className="text-sm text-stone-700">合計（税込）</span>
            <span className="text-lg text-stone-900 font-medium">¥{summary.total.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <Field label="備考">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} rows={3} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => save(false)}
            disabled={saving !== null}
            className="bg-white border border-stone-300 text-stone-700 py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
          >
            {saving === 'draft' ? '保存中...' : '下書き保存'}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving !== null}
            className="bg-stone-800 text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
          >
            {saving === 'publish' ? '発行中...' : '発行する'}
          </button>
        </div>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-stone-600">{label}</span>
      <span className="text-stone-800">¥{value.toLocaleString()}</span>
    </div>
  )
}
