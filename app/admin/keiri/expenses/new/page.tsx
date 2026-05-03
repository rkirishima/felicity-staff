'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'

type Category = { id: string; name: string; tax_category: string | null }

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-stone-500 tracking-wider mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full bg-white rounded-xl px-3 py-2.5 text-sm border border-stone-200 outline-none focus:border-stone-400'

export default function NewExpensePage() {
  const router = useRouter()
  const supabase = createClient()

  const [date, setDate] = useState(todayJST())
  const [amount, setAmount] = useState('')
  const [taxRate, setTaxRate] = useState<10 | 8>(10)
  const [categoryId, setCategoryId] = useState('')
  const [vendor, setVendor] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [memo, setMemo] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('keiri_categories')
        .select('id, name, tax_category')
        .eq('type', 'expense')
        .order('name')
      setCategories((data ?? []) as Category[])
    })()
  }, [router, supabase])

  async function save() {
    const amt = parseInt(amount, 10)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('金額を入力してください')
      return
    }
    if (!categoryId) {
      toast.error('勘定科目を選択してください')
      return
    }
    const tax = Math.round(amt - amt / (1 + taxRate / 100))
    const cat = categories.find(c => c.id === categoryId)
    const taxCategory = cat?.tax_category ?? (taxRate === 8 ? '軽減8' : '物販10')

    setSaving(true)
    try {
      const { error } = await supabase.from('keiri_transactions').insert({
        type: 'expense',
        source: 'manual',
        date,
        amount: amt,
        tax_amount: tax,
        tax_rate: taxRate,
        tax_category: taxCategory,
        category_id: categoryId,
        vendor: vendor || null,
        payment_method: paymentMethod || null,
        memo: memo || null,
      })
      if (error) throw error
      toast.success('登録しました')
      router.push('/admin/keiri/expenses')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`登録失敗: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/expenses')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">経費を追加</h1>
          <span className="w-10" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <Field label="日付">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="金額（税込・円）">
              <input
                inputMode="numeric"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                className={inputCls}
              />
            </Field>
            <Field label="税率">
              <select
                value={taxRate}
                onChange={e => setTaxRate(parseInt(e.target.value, 10) === 8 ? 8 : 10)}
                className={inputCls}
              >
                <option value={10}>10%</option>
                <option value={8}>8%</option>
              </select>
            </Field>
          </div>
          <Field label="勘定科目">
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">選択してください</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="取引先">
            <input value={vendor} onChange={e => setVendor(e.target.value)} className={inputCls} />
          </Field>
          <Field label="支払方法">
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
              <option value="">未指定</option>
              <option value="現金">現金</option>
              <option value="クレジット">クレジット</option>
              <option value="電子マネー">電子マネー</option>
              <option value="その他">その他</option>
            </select>
          </Field>
          <Field label="メモ">
            <textarea value={memo} onChange={e => setMemo(e.target.value)} className={inputCls} rows={2} />
          </Field>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-stone-800 text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </main>
  )
}
