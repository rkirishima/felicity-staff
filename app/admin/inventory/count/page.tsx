'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import { ChevronLeft, Boxes, Save, Filter } from 'lucide-react'

type Classification = 'apparel' | 'goods' | 'drip_pack' | 'coffee_beans' | 'food_other' | 'other'

type Sku = {
  sku_id: string
  name: string
  parent_sku: string | null
  variant_label: string | null
  classification: Classification
  current_stock: number
  cost_yen: number | null
  price: number
}

const CLASS_LABELS: Record<Classification, string> = {
  apparel: 'アパレル',
  goods: 'グッズ',
  drip_pack: 'ドリップパック',
  coffee_beans: '豆 (200g等)',
  food_other: '食品その他',
  other: 'その他',
}

export default function InventoryCountPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)

  const [skus, setSkus] = useState<Sku[]>([])
  const [loading, setLoading] = useState(true)
  const [classFilter, setClassFilter] = useState<'all' | Classification>('all')
  const [counts, setCounts] = useState<Record<string, string>>({}) // sku_id → 入力値(string)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('keiri_sku_master')
      .select('sku_id, name, parent_sku, variant_label, classification, current_stock, cost_yen, price')
      .eq('active', true)
      .order('classification').order('parent_sku', { nullsFirst: false }).order('name')
    setSkus((data as Sku[]) ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return skus.filter(s => classFilter === 'all' || s.classification === classFilter)
  }, [skus, classFilter])

  const changed = useMemo(() => {
    return filtered.filter(s => counts[s.sku_id] !== undefined && counts[s.sku_id] !== '' && Number(counts[s.sku_id]) !== s.current_stock)
  }, [filtered, counts])

  const summary = useMemo(() => {
    let deltaQty = 0
    let deltaValueCost = 0
    for (const s of changed) {
      const newQty = Number(counts[s.sku_id])
      const delta = newQty - s.current_stock
      deltaQty += delta
      if (s.cost_yen) deltaValueCost += delta * s.cost_yen
    }
    return { deltaQty, deltaValueCost, n: changed.length }
  }, [changed, counts])

  async function saveAll() {
    if (changed.length === 0) {
      toast.error('変更がありません')
      return
    }
    if (!confirm(`${changed.length}件の棚卸し結果を保存します。よろしいですか?`)) return
    setSaving(true)
    const events = changed.map(s => ({
      sku_id: s.sku_id,
      delta: Number(counts[s.sku_id]),
      event_type: 'count_set' as const,
      notes: '棚卸し(一括入力)',
      created_by: 'manual',
    }))
    const { error } = await supabase.from('cafe_stock_events').insert(events)
    setSaving(false)
    if (error) {
      toast.error(`保存失敗: ${error.message}`)
      return
    }
    toast.success(`${changed.length}件の棚卸しを記録しました`)
    setCounts({})
    load()
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者ログインが必要です</div>
      </main>
    )
  }

  // parent_sku でグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, Sku[]>()
    for (const s of filtered) {
      const key = s.parent_sku || s.sku_id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <main className="min-h-screen pb-32 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory" className="text-stone-400 hover:text-white">
            <ChevronLeft size={20} />
          </Link>
          <Boxes size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">棚卸し</h1>
          <span className="ml-auto text-[10px] text-stone-500">
            {changed.length > 0 ? `${changed.length}件変更中` : '変更なし'}
          </span>
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto -mx-1 px-1">
          {(['all', 'apparel', 'goods', 'drip_pack', 'coffee_beans', 'food_other', 'other'] as const).map(c => (
            <button key={c} onClick={() => setClassFilter(c)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${classFilter === c ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
              {c === 'all' ? '全部' : CLASS_LABELS[c as Classification]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        <p className="text-[10px] text-stone-500 mb-3">
          実数を入力してください。空欄=変更なし。送信で count_set イベント(現在DB値を実数で上書き)が記録されます。
        </p>
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : grouped.length === 0 ? (
          <p className="text-stone-500 text-sm">該当SKUなし</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([parentKey, items]) => (
              <div key={parentKey} className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                {items.length > 1 && (
                  <div className="px-3 py-1.5 text-[10px] text-stone-400 font-semibold" style={{ backgroundColor: '#1c1917' }}>
                    {items[0].parent_sku}
                  </div>
                )}
                {items.map((s) => {
                  const inputVal = counts[s.sku_id] ?? ''
                  const newQty = inputVal === '' ? null : Number(inputVal)
                  const delta = newQty === null ? null : newQty - s.current_stock
                  return (
                    <div key={s.sku_id} className="px-3 py-2 flex items-center gap-2 border-t" style={{ borderColor: '#3f3f3f' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {s.variant_label || s.name}
                        </p>
                        <p className="text-[10px] text-stone-500">
                          DB在庫: <span className="text-stone-300 font-bold">{s.current_stock}</span>
                          {s.cost_yen ? ` · 原価¥${s.cost_yen.toLocaleString()}` : ''}
                        </p>
                      </div>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={inputVal}
                        onChange={(e) => setCounts({ ...counts, [s.sku_id]: e.target.value })}
                        placeholder="実数"
                        className="w-20 bg-stone-900 text-white text-right rounded px-2 py-1.5 text-base border border-stone-700 focus:border-amber-500 focus:outline-none"
                      />
                      <div className="w-16 text-right text-xs">
                        {delta === null ? (
                          <span className="text-stone-600">—</span>
                        ) : delta === 0 ? (
                          <span className="text-stone-500">±0</span>
                        ) : (
                          <span className={delta > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {delta > 0 ? '+' : ''}{delta}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky 保存バー */}
      {changed.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4" style={{ backgroundColor: '#1c1917', borderTop: '1px solid #44403c' }}>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-stone-400">
                {summary.n}件変更 · 数量差 <span className={summary.deltaQty >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{summary.deltaQty > 0 ? '+' : ''}{summary.deltaQty}</span>
              </p>
              <p className="text-[10px] text-stone-500">
                原価ベース評価差: <span className={summary.deltaValueCost >= 0 ? 'text-emerald-400' : 'text-rose-400'}>¥{summary.deltaValueCost.toLocaleString('ja-JP')}</span>
              </p>
            </div>
            <button
              onClick={() => setCounts({})}
              className="text-stone-400 hover:text-stone-200 text-xs px-3 py-2"
            >
              リセット
            </button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 text-white font-bold py-3 px-5 rounded-lg flex items-center gap-2"
            >
              <Save size={16} />
              {saving ? '保存中...' : `${changed.length}件保存`}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
