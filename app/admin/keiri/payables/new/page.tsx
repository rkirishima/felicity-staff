'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { createPayable, type PayableInput } from '../actions'

function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function plusDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function NewPayablePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<PayableInput>({
    vendor: '',
    description: '',
    amount: 0,
    invoice_number: '',
    order_date: todayJST(),
    due_date: plusDays(todayJST(), 30),
    notes: '',
  })

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  function set<K extends keyof PayableInput>(k: K, v: PayableInput[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.vendor.trim()) { toast.error('取引先必須'); return }
    if (form.amount <= 0) { toast.error('金額を入力'); return }
    if (!form.due_date) { toast.error('支払期日必須'); return }
    setSaving(true)
    try {
      const session = getAdminSession()
      await createPayable(form, session?.staffName ?? null)
      toast.success('未払を追加しました')
      router.push('/admin/keiri/payables')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">未払 新規</h1>
          <div className="w-12" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <Field label="取引先（必須）">
            <input
              type="text"
              value={form.vendor}
              onChange={e => set('vendor', e.target.value)}
              placeholder="○○商事"
              className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
          </Field>
          <Field label="摘要">
            <input
              type="text"
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value)}
              placeholder="エチオピア生豆 30kg"
              className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
          </Field>
          <Field label="金額（必須・円）">
            <input
              type="number"
              inputMode="numeric"
              value={form.amount || ''}
              onChange={e => set('amount', parseInt(e.target.value, 10) || 0)}
              className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
          </Field>
          <Field label="請求書番号">
            <input
              type="text"
              value={form.invoice_number ?? ''}
              onChange={e => set('invoice_number', e.target.value)}
              className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="発注日">
              <input
                type="date"
                value={form.order_date ?? ''}
                onChange={e => set('order_date', e.target.value || null)}
                className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
              />
            </Field>
            <Field label="支払期日（必須）">
              <input
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
              />
            </Field>
          </div>
          <div className="flex gap-1.5 text-xs">
            <button
              onClick={() => set('due_date', plusDays(todayJST(), 7))}
              className="px-2.5 py-1 bg-stone-100 text-stone-600 rounded-lg"
            >
              +7日
            </button>
            <button
              onClick={() => set('due_date', plusDays(todayJST(), 14))}
              className="px-2.5 py-1 bg-stone-100 text-stone-600 rounded-lg"
            >
              +14日
            </button>
            <button
              onClick={() => set('due_date', plusDays(todayJST(), 30))}
              className="px-2.5 py-1 bg-stone-100 text-stone-600 rounded-lg"
            >
              +30日
            </button>
            <button
              onClick={() => {
                // 月末
                const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
                const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
                set('due_date', end.toISOString().slice(0, 10))
              }}
              className="px-2.5 py-1 bg-stone-100 text-stone-600 rounded-lg"
            >
              月末
            </button>
            <button
              onClick={() => {
                // 翌月末
                const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
                const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0))
                set('due_date', end.toISOString().slice(0, 10))
              }}
              className="px-2.5 py-1 bg-stone-100 text-stone-600 rounded-lg"
            >
              翌月末
            </button>
          </div>
          <Field label="メモ">
            <textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
          </Field>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-stone-800 text-white py-3 rounded-2xl font-medium disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-stone-600 font-medium mb-1">{label}</label>
      {children}
    </div>
  )
}
