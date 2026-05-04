'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ItemInput } from '@/app/admin/keiri/items/actions'

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

export type ItemFormValues = {
  name: string
  description: string
  unit_price: string
  tax_rate: 10 | 8
  unit: string
  category_id: string
}

export function emptyItem(): ItemFormValues {
  return { name: '', description: '', unit_price: '', tax_rate: 10, unit: '', category_id: '' }
}

export function normalizeItem(v: ItemFormValues): ItemInput {
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    unit_price: parseInt(v.unit_price || '0', 10) || 0,
    tax_rate: v.tax_rate,
    unit: v.unit.trim() || null,
    category_id: v.category_id || null,
  }
}

type Category = { id: string; name: string; type: string }

export function ItemForm({
  initial,
  onSave,
  saving,
  saveLabel,
}: {
  initial: ItemFormValues
  onSave: (v: ItemInput) => Promise<void> | void
  saving: boolean
  saveLabel: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [v, setV] = useState<ItemFormValues>(initial)
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('keiri_categories')
        .select('id, name, type')
        .in('type', ['income', 'expense'])
        .order('name')
      setCategories((data ?? []) as Category[])
    })()
  }, [supabase])

  function up<K extends keyof ItemFormValues>(k: K, val: ItemFormValues[K]) {
    setV(prev => ({ ...prev, [k]: val }))
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <Field label="商品名 *">
          <input value={v.name} onChange={e => up('name', e.target.value)} className={inputCls} />
        </Field>
        <Field label="説明">
          <textarea
            value={v.description}
            onChange={e => up('description', e.target.value)}
            className={inputCls}
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="単価（税抜・円）">
            <input
              inputMode="numeric"
              value={v.unit_price}
              onChange={e => up('unit_price', e.target.value.replace(/[^0-9]/g, ''))}
              className={inputCls}
            />
          </Field>
          <Field label="税率">
            <select
              value={v.tax_rate}
              onChange={e => up('tax_rate', parseInt(e.target.value, 10) === 8 ? 8 : 10)}
              className={inputCls}
            >
              <option value={10}>10%</option>
              <option value={8}>8%</option>
            </select>
          </Field>
        </div>
        <Field label="単位">
          <input
            value={v.unit}
            onChange={e => up('unit', e.target.value)}
            className={inputCls}
            placeholder="例: 個 / 時間 / 式"
          />
        </Field>
        <Field label="カテゴリ">
          <select value={v.category_id} onChange={e => up('category_id', e.target.value)} className={inputCls}>
            <option value="">未選択</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                [{c.type}] {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        onClick={() => onSave(normalizeItem(v))}
        disabled={saving}
        className="w-full bg-stone-800 text-white py-4 rounded-2xl font-medium shadow-sm disabled:opacity-40"
      >
        {saving ? '保存中...' : saveLabel}
      </button>
    </div>
  )
}
