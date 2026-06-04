'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import Link from 'next/link'
import { Link2, ChevronLeft, Check, Search } from 'lucide-react'

type Sku = {
  sku_id: string
  name: string
  classification: string
  active: boolean
  current_stock: number
  square_catalog_object_id: string | null
  stripe_product_id: string | null
}

type SquareItem = {
  catalog_object_id: string
  item_name: string | null
  variation_name: string | null
  sales_count: number
  last_sold: string | null
}

type StripeItem = {
  product_id: string
  product_name: string | null
  sales_count: number
  last_sold: string | null
}

export default function SyncPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)

  const [skus, setSkus] = useState<Sku[]>([])
  const [squareItems, setSquareItems] = useState<SquareItem[]>([])
  const [stripeItems, setStripeItems] = useState<StripeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'square' | 'stripe'>('square')
  const [filter, setFilter] = useState<'all' | 'unmapped' | 'mapped'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  async function load() {
    setLoading(true)
    const [
      { data: skuData },
      { data: sqRaw },
      { data: stRaw },
    ] = await Promise.all([
      supabase.from('keiri_sku_master')
        .select('sku_id, name, classification, active, current_stock, square_catalog_object_id, stripe_product_id')
        .eq('active', true)
        .order('classification').order('name'),
      // Distinct Square catalog items (last 6 months)
      supabase.from('keiri_square_line_items')
        .select('catalog_object_id, item_name, variation_name, date')
        .not('catalog_object_id', 'is', null)
        .gte('date', new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10))
        .limit(5000),
      // Distinct Stripe products
      supabase.from('keiri_stripe_line_items')
        .select('product_id, product_name, date')
        .not('product_id', 'is', null)
        .limit(2000),
    ])

    setSkus((skuData as Sku[]) ?? [])

    // Distinct Square items を JS で集計
    const sqMap = new Map<string, SquareItem>()
    for (const r of (sqRaw as any[]) ?? []) {
      const key = r.catalog_object_id
      if (!sqMap.has(key)) {
        sqMap.set(key, { catalog_object_id: key, item_name: r.item_name, variation_name: r.variation_name, sales_count: 0, last_sold: null })
      }
      const cur = sqMap.get(key)!
      cur.sales_count += 1
      if (!cur.last_sold || r.date > cur.last_sold) cur.last_sold = r.date
    }
    setSquareItems(Array.from(sqMap.values()).sort((a, b) => (b.last_sold ?? '').localeCompare(a.last_sold ?? '') || b.sales_count - a.sales_count))

    // Stripe
    const stMap = new Map<string, StripeItem>()
    for (const r of (stRaw as any[]) ?? []) {
      const key = r.product_id
      if (!stMap.has(key)) stMap.set(key, { product_id: key, product_name: r.product_name, sales_count: 0, last_sold: null })
      const cur = stMap.get(key)!
      cur.sales_count += 1
      if (!cur.last_sold || r.date > cur.last_sold) cur.last_sold = r.date
    }
    setStripeItems(Array.from(stMap.values()).sort((a, b) => (b.last_sold ?? '').localeCompare(a.last_sold ?? '') || b.sales_count - a.sales_count))

    setLoading(false)
  }

  const squareSkuByCatalog = useMemo(() => {
    const m = new Map<string, Sku>()
    for (const s of skus) if (s.square_catalog_object_id) m.set(s.square_catalog_object_id, s)
    return m
  }, [skus])

  const stripeSkuByProduct = useMemo(() => {
    const m = new Map<string, Sku>()
    for (const s of skus) if (s.stripe_product_id) m.set(s.stripe_product_id, s)
    return m
  }, [skus])

  const visibleSquareItems = useMemo(() => {
    return squareItems.filter(i => {
      const mapped = squareSkuByCatalog.has(i.catalog_object_id)
      if (filter === 'mapped' && !mapped) return false
      if (filter === 'unmapped' && mapped) return false
      if (search) {
        const hay = `${i.item_name ?? ''} ${i.variation_name ?? ''}`.toLowerCase()
        if (!hay.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [squareItems, squareSkuByCatalog, filter, search])

  const visibleStripeItems = useMemo(() => {
    return stripeItems.filter(i => {
      const mapped = stripeSkuByProduct.has(i.product_id)
      if (filter === 'mapped' && !mapped) return false
      if (filter === 'unmapped' && mapped) return false
      if (search) {
        const hay = `${i.product_name ?? ''}`.toLowerCase()
        if (!hay.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [stripeItems, stripeSkuByProduct, filter, search])

  async function setMapping(item: SquareItem | StripeItem, newSkuId: string, kind: 'square' | 'stripe') {
    const col = kind === 'square' ? 'square_catalog_object_id' : 'stripe_product_id'
    const value = 'catalog_object_id' in item ? item.catalog_object_id : item.product_id

    // 既に value が他のSKUに付いているなら、まずクリア(1対1にする)
    await supabase.from('keiri_sku_master').update({ [col]: null }).eq(col, value)

    if (newSkuId) {
      const { error } = await supabase.from('keiri_sku_master').update({ [col]: value }).eq('sku_id', newSkuId)
      if (error) { toast.error(`紐付け失敗: ${error.message}`); return }
      toast.success('紐付けました')
    } else {
      toast.success('紐付けを解除しました')
    }
    load()
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者ログインが必要です</div>
      </main>
    )
  }

  const stats = {
    sqTotal: squareItems.length,
    sqMapped: squareItems.filter(i => squareSkuByCatalog.has(i.catalog_object_id)).length,
    stTotal: stripeItems.length,
    stMapped: stripeItems.filter(i => stripeSkuByProduct.has(i.product_id)).length,
  }

  return (
    <main className="min-h-screen pb-24 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory" className="text-stone-400 hover:text-white">
            <ChevronLeft size={20} />
          </Link>
          <Link2 size={18} className="text-emerald-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">POS紐付け</h1>
          <p className="ml-auto text-[10px] text-stone-500">
            Square {stats.sqMapped}/{stats.sqTotal} · Stripe {stats.stMapped}/{stats.stTotal}
          </p>
        </div>
        <div className="flex gap-1 mt-3">
          <button onClick={() => setTab('square')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'square' ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
            Square ({stats.sqTotal})
          </button>
          <button onClick={() => setTab('stripe')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ${tab === 'stripe' ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
            Stripe ({stats.stTotal})
          </button>
        </div>
        <div className="flex gap-1 mt-2">
          {(['all', 'unmapped', 'mapped'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-2 py-1 rounded text-[10px] ${filter === f ? 'bg-stone-700 text-white' : 'bg-stone-900 text-stone-500 border border-stone-700'}`}>
              {f === 'all' ? '全部' : f === 'unmapped' ? '未紐付け' : '紐付け済み'}
            </button>
          ))}
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="商品名で検索"
              className="w-full bg-stone-900 text-white text-xs pl-7 pr-2 py-1 rounded border border-stone-700"
            />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : tab === 'square' ? (
          <div className="space-y-1">
            {visibleSquareItems.map((item) => {
              const mapped = squareSkuByCatalog.get(item.catalog_object_id)
              return (
                <MappingRow
                  key={item.catalog_object_id}
                  itemLabel={[item.item_name, item.variation_name].filter(Boolean).join(' / ') || '(no name)'}
                  externalId={item.catalog_object_id}
                  salesCount={item.sales_count}
                  lastSold={item.last_sold}
                  mappedSku={mapped ?? null}
                  skus={skus}
                  onChange={(skuId) => setMapping(item, skuId, 'square')}
                />
              )
            })}
            {visibleSquareItems.length === 0 && (
              <p className="text-stone-500 text-sm text-center py-8">該当する商品なし</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleStripeItems.map((item) => {
              const mapped = stripeSkuByProduct.get(item.product_id)
              return (
                <MappingRow
                  key={item.product_id}
                  itemLabel={item.product_name ?? '(no name)'}
                  externalId={item.product_id}
                  salesCount={item.sales_count}
                  lastSold={item.last_sold}
                  mappedSku={mapped ?? null}
                  skus={skus}
                  onChange={(skuId) => setMapping(item, skuId, 'stripe')}
                />
              )
            })}
            {visibleStripeItems.length === 0 && (
              <p className="text-stone-500 text-sm text-center py-8">該当する商品なし</p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function MappingRow({ itemLabel, externalId, salesCount, lastSold, mappedSku, skus, onChange }: {
  itemLabel: string
  externalId: string
  salesCount: number
  lastSold: string | null
  mappedSku: Sku | null
  skus: Sku[]
  onChange: (skuId: string) => void
}) {
  // 候補スコアリング: 名前の単語一致で順位付け
  const ranked = useMemo(() => {
    const words = itemLabel.toLowerCase().split(/[\s/／\-_,]+/).filter(w => w.length >= 2)
    return [...skus].sort((a, b) => {
      const sa = words.filter(w => a.name.toLowerCase().includes(w)).length
      const sb = words.filter(w => b.name.toLowerCase().includes(w)).length
      return sb - sa
    })
  }, [itemLabel, skus])

  return (
    <div className="rounded-lg p-3 flex items-center gap-3" style={{ backgroundColor: mappedSku ? '#0c4a3e' : '#292524', border: '1px solid ' + (mappedSku ? '#10b981' : '#3f3f3f') }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate" title={itemLabel}>{itemLabel}</p>
        <p className="text-[10px] text-stone-500 truncate">
          {salesCount}件売上 · 最終 {lastSold ?? '不明'} · <span className="font-mono">{externalId.slice(0, 12)}…</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {mappedSku && <Check size={14} className="text-emerald-400" />}
        <select
          value={mappedSku?.sku_id ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="bg-stone-900 text-white text-xs px-2 py-1.5 rounded border border-stone-700 max-w-[200px]"
        >
          <option value="">— 紐付けなし —</option>
          {ranked.map(s => (
            <option key={s.sku_id} value={s.sku_id}>
              [{s.classification}] {s.name} (在庫{s.current_stock})
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
