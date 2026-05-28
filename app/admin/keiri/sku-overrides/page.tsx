'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { effectiveRevenueCategory, type RevenueCategory } from '@/lib/keiri/classifyRevenue'
import { setOverride } from './actions'

type LineRow = {
  item_name: string | null
  tax_rate: number | null
  category: string | null
  gross_amount: number
  quantity: number
}

type OverrideRow = { item_name: string; revenue_category: RevenueCategory; note: string | null }

type ItemAggregate = {
  item_name: string
  category: string | null
  tax_rate: number | null
  count: number
  total: number
  heuristic: RevenueCategory
  override: RevenueCategory | null
  note: string | null
}

const CHOICES: { v: RevenueCategory; label: string }[] = [
  { v: 'dine_in_10', label: '🍽 10% イートイン' },
  { v: 'goods_10', label: '👕 10% 物販' },
  { v: 'beans_8', label: '☕ 8% 豆等の物販' },
  { v: 'takeout_8', label: '🥡 8% テイクアウト' },
  { v: 'unknown', label: '❓ 未分類' },
]

type Tab = 'unclassified' | 'override' | 'all'

export default function SkuOverridesPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [items, setItems] = useState<ItemAggregate[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('unclassified')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [linesRes, overridesRes] = await Promise.all([
        supabase
          .from('keiri_square_line_items')
          .select('item_name, tax_rate, category, gross_amount, quantity'),
        supabase
          .from('keiri_square_item_overrides')
          .select('item_name, revenue_category, note'),
      ])
      if (cancelled) return

      const lines = (linesRes.data ?? []) as LineRow[]
      const overrides = new Map<string, OverrideRow>()
      for (const o of (overridesRes.data ?? []) as OverrideRow[]) {
        overrides.set(o.item_name, o)
      }

      // Aggregate by item_name
      const agg = new Map<string, ItemAggregate>()
      for (const li of lines) {
        if (!li.item_name) continue
        const cur = agg.get(li.item_name) ?? {
          item_name: li.item_name,
          category: li.category,
          tax_rate: li.tax_rate,
          count: 0,
          total: 0,
          heuristic: 'unknown' as RevenueCategory,
          override: null,
          note: null,
        }
        cur.count += 1
        cur.total += li.gross_amount || 0
        agg.set(li.item_name, cur)
      }
      // Re-compute heuristic + apply overrides
      for (const [name, a] of agg) {
        a.heuristic = effectiveRevenueCategory(
          { tax_rate: a.tax_rate, item_name: name, category: a.category },
          undefined,
        )
        const ov = overrides.get(name)
        a.override = ov?.revenue_category ?? null
        a.note = ov?.note ?? null
      }

      const list = Array.from(agg.values()).sort((a, b) => b.total - a.total)
      setItems(list)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, reload])

  const filtered = useMemo(() => {
    let f = items
    if (tab === 'unclassified') {
      f = items.filter(i => !i.override && i.heuristic === 'unknown')
    } else if (tab === 'override') {
      f = items.filter(i => i.override !== null)
    }
    if (search.trim()) {
      const q = search.trim()
      f = f.filter(i => i.item_name.includes(q) || (i.category ?? '').includes(q))
    }
    return f
  }, [items, tab, search])

  async function handleChange(itemName: string, value: string) {
    try {
      if (value === '__none__') {
        await setOverride(itemName, null)
        toast.success('オーバーライド解除')
      } else {
        await setOverride(itemName, value as RevenueCategory)
        toast.success('保存しました')
      }
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失敗')
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">商品分類</h1>
          <div className="w-12" />
        </div>

        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm">
          {([
            { k: 'unclassified' as Tab, label: '未分類' },
            { k: 'override' as Tab, label: '上書き済' },
            { k: 'all' as Tab, label: '全て' },
          ]).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 text-xs rounded-xl transition ${
                tab === k ? 'bg-stone-800 text-white font-medium' : 'text-stone-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="商品名・カテゴリで検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        />

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-500 text-sm">該当する商品がありません</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(i => {
              const effective = i.override ?? i.heuristic
              return (
                <li key={i.item_name} className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-800 truncate">{i.item_name}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {i.category && <>カテゴリ: {i.category} ・</>}
                        税率 {i.tax_rate ?? '—'}％ ・ {i.count}件 ・ ¥{i.total.toLocaleString()}
                      </p>
                      {i.note && <p className="text-[10px] text-stone-500 mt-1">📝 {i.note}</p>}
                    </div>
                    {i.override && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded whitespace-nowrap">
                        手動
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400">現在</span>
                    <span className="text-xs px-2 py-1 bg-stone-100 text-stone-700 rounded">
                      {CHOICES.find(c => c.v === effective)?.label ?? effective}
                    </span>
                  </div>
                  <select
                    value={i.override ?? '__none__'}
                    onChange={e => handleChange(i.item_name, e.target.value)}
                    className="w-full bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
                  >
                    <option value="__none__">— 自動判定に任せる —</option>
                    {CHOICES.map(c => (
                      <option key={c.v} value={c.v}>
                        {c.label} に固定
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
        )}

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
          <p className="font-medium">仕組み</p>
          <p>商品名で 5区分（10%イートイン / 10%物販 / 8%豆 / 8%テイクアウト / 未分類）に固定上書きできます。商品名キーワード自動判定の例外を補正する用途。</p>
          <p>変更すると Square 売上ページ・税理士レポート・CSV/PDF すべてに即反映されます。</p>
        </div>
      </div>
    </main>
  )
}
