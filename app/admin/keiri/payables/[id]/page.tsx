'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { updatePayable, type PayableInput } from '../actions'

export default function EditPayablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [form, setForm] = useState<PayableInput | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('keiri_payables')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        toast.error('未払が見つかりません')
        router.push('/admin/keiri/payables')
        return
      }
      setForm({
        vendor: data.vendor,
        description: data.description,
        amount: data.amount,
        invoice_number: data.invoice_number,
        order_date: data.order_date,
        due_date: data.due_date,
        notes: data.notes,
      })
    })()
    return () => { cancelled = true }
  }, [id, router])

  function set<K extends keyof PayableInput>(k: K, v: PayableInput[K]) {
    setForm(f => f ? { ...f, [k]: v } : f)
  }

  async function handleSave() {
    if (!form) return
    if (!form.vendor.trim()) { toast.error('取引先必須'); return }
    if (form.amount <= 0) { toast.error('金額を入力'); return }
    setSaving(true)
    try {
      await updatePayable(id, form)
      toast.success('保存しました')
      router.push('/admin/keiri/payables')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return (
      <main className="min-h-screen pt-8 px-4" style={{ backgroundColor: '#F5F0E8' }}>
        <p className="text-stone-400 text-sm text-center">読み込み中...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/payables')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">未払 編集</h1>
          <div className="w-12" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <Field label="取引先">
            <input type="text" value={form.vendor} onChange={e => set('vendor', e.target.value)} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200" />
          </Field>
          <Field label="摘要">
            <input type="text" value={form.description ?? ''} onChange={e => set('description', e.target.value)} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200" />
          </Field>
          <Field label="金額（円）">
            <input type="number" inputMode="numeric" value={form.amount || ''} onChange={e => set('amount', parseInt(e.target.value, 10) || 0)} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200" />
          </Field>
          <Field label="請求書番号">
            <input type="text" value={form.invoice_number ?? ''} onChange={e => set('invoice_number', e.target.value)} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="発注日">
              <input type="date" value={form.order_date ?? ''} onChange={e => set('order_date', e.target.value || null)} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200" />
            </Field>
            <Field label="支払期日">
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200" />
            </Field>
          </div>
          <Field label="メモ">
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3} className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200" />
          </Field>
        </div>

        <button onClick={handleSave} disabled={saving} className="w-full bg-stone-800 text-white py-3 rounded-2xl font-medium disabled:opacity-50">
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
