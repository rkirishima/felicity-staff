'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { issueInvoice, type InvoiceLineInput } from '@/app/admin/keiri/invoices/actions'
import { createClientRecord } from '../../clients/actions'
import { groupByTaxRate, type TaxRate } from '@/lib/keiri/tax'

type ClientRow = { id: string; name: string; email: string | null }
type ItemRow = { id: string; name: string; description: string | null; unit_price: number; tax_rate: number; unit: string | null }

type LineDraft = {
  item_id: string
  description: string
  quantity: string
  unit_price: string
  tax_rate: TaxRate
}

function emptyLine(): LineDraft {
  return { item_id: '', description: '', quantity: '', unit_price: '', tax_rate: 10 }
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
  const [autoSend, setAutoSend] = useState(true)

  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientContact, setNewClientContact] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientRegNum, setNewClientRegNum] = useState('')
  const [savingClient, setSavingClient] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      const [cRes, iRes] = await Promise.all([
        supabase.from('keiri_clients').select('id, name, email').eq('active', true).order('name'),
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
              description: item.description ? `${item.name}\n${item.description}` : item.name,
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

  const selectedClient = clients.find(c => c.id === clientId)

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
        description: l.description.trim(),
        quantity: parseInt(l.quantity || '0', 10) || 0,
        unit_price: parseInt(l.unit_price || '0', 10) || 0,
        tax_rate: l.tax_rate,
      })),
    }
  }

  function resetNewClient() {
    setNewClientName('')
    setNewClientContact('')
    setNewClientEmail('')
    setNewClientRegNum('')
  }

  async function saveNewClient() {
    const name = newClientName.trim()
    if (!name) {
      toast.error('取引先名は必須です')
      return
    }
    setSavingClient(true)
    try {
      const out = await createClientRecord({
        name,
        name_kana: null,
        registration_number: newClientRegNum.trim() || null,
        postal_code: null,
        address: null,
        contact_person: newClientContact.trim() || null,
        email: newClientEmail.trim() || null,
        phone: null,
        payment_terms: null,
        notes: null,
      })
      setClients(prev => [{ id: out.id, name, email: newClientEmail.trim() || null }, ...prev])
      setClientId(out.id)
      setShowNewClientModal(false)
      resetNewClient()
      toast.success('取引先を追加しました')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingClient(false)
    }
  }

  async function save(publish: boolean) {
    setSaving(publish ? 'publish' : 'draft')
    try {
      const out = await issueInvoice(buildInput(), { publish })
      const email = selectedClient?.email
      if (publish && autoSend && email) {
        try {
          const res = await fetch(`/api/keiri/invoices/${out.id}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          })
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
          if (!res.ok || !j.ok) throw new Error(j.error || `status ${res.status}`)
          toast.success('発行＆メール送信しました')
        } catch (e) {
          // 発行は済んでいるが送信に失敗。sent_at は未設定のまま＝未送信として残り、
          // 詳細画面の「メール送信」ボタンとリマインダーcronで再送できる。
          toast.error(
            `発行しましたがメール送信に失敗: ${e instanceof Error ? e.message : String(e)}。未送信として保存、後で再送信できます`,
          )
        }
      } else {
        toast.success(publish ? `発行しました ${out.invoice_number ?? ''}` : '下書き保存しました')
      }
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
            <div className="flex items-center gap-2">
              <select value={clientId} onChange={e => setClientId(e.target.value)} className={inputCls}>
                <option value="">選択してください</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewClientModal(true)}
                className="shrink-0 text-xs text-emerald-700 px-2 py-2.5 whitespace-nowrap"
              >
                + 新規
              </button>
            </div>
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
                  <textarea
                    value={l.description}
                    onChange={e => updateLine(idx, 'description', e.target.value)}
                    className={inputCls}
                    rows={2}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="数量">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={l.quantity}
                      onChange={e => updateLine(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="1"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="単価(税抜)">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={l.unit_price}
                      onChange={e => updateLine(idx, 'unit_price', e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0"
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

        {selectedClient?.email && (
          <label className="flex items-center gap-2 text-sm text-stone-600 px-2">
            <input type="checkbox" checked={autoSend} onChange={e => setAutoSend(e.target.checked)} />
            発行と同時に取引先 ({selectedClient.email}) へメール送信
          </label>
        )}

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

      {showNewClientModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h2 className="text-base font-semibold text-stone-800 tracking-wider">取引先を追加</h2>
            <Field label="取引先名 *">
              <input
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </Field>
            <Field label="担当者">
              <input
                value={newClientContact}
                onChange={e => setNewClientContact(e.target.value)}
                placeholder="例: 山田 太郎"
                className={inputCls}
              />
            </Field>
            <Field label="メール">
              <input
                type="email"
                value={newClientEmail}
                onChange={e => setNewClientEmail(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="登録番号 (T+13桁、任意)">
              <input
                value={newClientRegNum}
                onChange={e => setNewClientRegNum(e.target.value)}
                placeholder="T1234567890123"
                className={inputCls}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewClientModal(false)
                  resetNewClient()
                }}
                disabled={savingClient}
                className="border border-stone-200 text-stone-600 py-2.5 rounded-xl text-sm disabled:opacity-40"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveNewClient}
                disabled={savingClient}
                className="bg-stone-800 text-white py-2.5 rounded-xl text-sm disabled:opacity-40"
              >
                {savingClient ? '保存中...' : '保存して選択'}
              </button>
            </div>
          </div>
        </div>
      )}
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
