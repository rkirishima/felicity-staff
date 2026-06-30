'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession, getAdminSession } from '@/lib/session'
import { toast } from 'sonner'
import { Link2, ChevronLeft, Search, Store, Globe, CheckCircle2, Circle } from 'lucide-react'
import { WEB_VARIANTS, webVariantLabel } from '@/lib/inventory/webVariants'

// 正規SKU(keiri_sku_master)
type Sku = {
  sku_id: string
  name: string
  classification: string | null
  parent_sku: string | null
  variant_label: string | null
  current_stock: number | null
  active: boolean
}

// Square 候補(inv_square_catalog_candidates ビュー)
type SquareCandidate = {
  catalog_object_id: string
  item_name: string | null
  item_names: string[] | null
  variation_names: string[] | null
  revenue_category: string | null
  total_qty: number | null
  last_sold: string | null
}

// 既存マッピング(inv_sku_channel_map)
type ChannelMap = {
  channel: 'square' | 'web'
  external_id: string
  sku_id: string
}

function currentUserName(): string {
  return getSession()?.staffName || getAdminSession()?.staffName || '不明'
}

const UNASSIGNED = '__none__'

export default function ChannelMapPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  const [tab, setTab] = useState<'square' | 'web'>('square')
  const [skus, setSkus] = useState<Sku[]>([])
  const [squareCands, setSquareCands] = useState<SquareCandidate[]>([])
  const [maps, setMaps] = useState<ChannelMap[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  // フィルタ
  const [search, setSearch] = useState('')
  const [unmappedOnly, setUnmappedOnly] = useState(false)
  const [revCat, setRevCat] = useState<string>('all')

  async function load() {
    setLoading(true)
    const [sk, sc, mp] = await Promise.all([
      supabase.from('keiri_sku_master').select('sku_id, name, classification, parent_sku, variant_label, current_stock, active').eq('active', true).order('classification').order('name'),
      supabase.from('inv_square_catalog_candidates').select('catalog_object_id, item_name, item_names, variation_names, revenue_category, total_qty, last_sold').order('total_qty', { ascending: false }),
      supabase.from('inv_sku_channel_map').select('channel, external_id, sku_id'),
    ])
    if (sk.error) toast.error(`SKU読み込み失敗: ${sk.error.message}`)
    if (sc.error) toast.error(`Square候補読み込み失敗: ${sc.error.message}`)
    setSkus((sk.data as Sku[]) ?? [])
    setSquareCands((sc.data as SquareCandidate[]) ?? [])
    setMaps((mp.data as ChannelMap[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  // external_id → sku_id の引き
  const mapByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of maps) m.set(`${r.channel}:${r.external_id}`, r.sku_id)
    return m
  }, [maps])

  const skuLabel = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of skus) {
      const v = s.variant_label ? ` (${s.variant_label})` : ''
      m.set(s.sku_id, `${s.name}${v}`)
    }
    return m
  }, [skus])

  // Square の revenue_category 一覧
  const revCats = useMemo(() => {
    const set = new Set<string>()
    squareCands.forEach((c) => set.add(c.revenue_category || '(未分類)'))
    return Array.from(set).sort()
  }, [squareCands])

  // マッピング件数
  const stats = useMemo(() => {
    const sq = squareCands.length
    const sqMapped = squareCands.filter((c) => mapByKey.has(`square:${c.catalog_object_id}`)).length
    const wb = WEB_VARIANTS.length
    const wbMapped = WEB_VARIANTS.filter((v) => mapByKey.has(`web:${v.variant_id}`)).length
    return { sq, sqMapped, wb, wbMapped }
  }, [squareCands, mapByKey])

  // 表示中の候補(フィルタ適用)
  const squareFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return squareCands.filter((c) => {
      const mapped = mapByKey.has(`square:${c.catalog_object_id}`)
      if (unmappedOnly && mapped) return false
      if (revCat !== 'all' && (c.revenue_category || '(未分類)') !== revCat) return false
      if (q) {
        const hay = `${c.item_name ?? ''} ${(c.item_names ?? []).join(' ')} ${(c.variation_names ?? []).join(' ')} ${c.catalog_object_id}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [squareCands, mapByKey, search, unmappedOnly, revCat])

  const webFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return WEB_VARIANTS.filter((v) => {
      const mapped = mapByKey.has(`web:${v.variant_id}`)
      if (unmappedOnly && mapped) return false
      if (q) {
        const hay = `${webVariantLabel(v)} ${v.variant_id} ${v.category}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [mapByKey, search, unmappedOnly])

  // 割当(upsert) or 解除(delete)。推測ではなく人の操作のみ。
  async function assign(channel: 'square' | 'web', external_id: string, sku_id: string, label: string, variation_name: string | null) {
    setBusy(`${channel}:${external_id}`)
    if (sku_id === UNASSIGNED) {
      const { error } = await supabase.from('inv_sku_channel_map').delete().eq('channel', channel).eq('external_id', external_id)
      setBusy(null)
      if (error) { toast.error(`解除失敗: ${error.message}`); return }
      setMaps((prev) => prev.filter((m) => !(m.channel === channel && m.external_id === external_id)))
      return
    }
    const { error } = await supabase.from('inv_sku_channel_map').upsert(
      { channel, external_id, sku_id, label, variation_name, created_by: currentUserName() },
      { onConflict: 'channel,external_id' },
    )
    setBusy(null)
    if (error) { toast.error(`割当失敗: ${error.message}`); return }
    setMaps((prev) => {
      const rest = prev.filter((m) => !(m.channel === channel && m.external_id === external_id))
      return [...rest, { channel, external_id, sku_id }]
    })
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-950">
        <div className="text-stone-400 text-sm">管理者ログインが必要です</div>
      </main>
    )
  }

  const curStats = tab === 'square' ? { mapped: stats.sqMapped, total: stats.sq } : { mapped: stats.wbMapped, total: stats.wb }

  return (
    <main className="min-h-screen pb-24 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory" className="text-stone-400 hover:text-white"><ChevronLeft size={20} /></Link>
          <Link2 size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">チャネル対応付け</h1>
        </div>
        <p className="text-[10px] text-stone-500 mt-2">
          Square(店舗) / WEB の各商品を正規SKUに紐付け。名前ではなく catalog_object_id / variant id で対応。複数→1SKU(多対1)可。
        </p>

        {/* タブ */}
        <div className="flex gap-1 mt-3">
          <button onClick={() => setTab('square')}
            className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${tab === 'square' ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
            <Store size={14} /> Square ({stats.sqMapped}/{stats.sq})
          </button>
          <button onClick={() => setTab('web')}
            className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 ${tab === 'web' ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
            <Globe size={14} /> WEB ({stats.wbMapped}/{stats.wb})
          </button>
        </div>

        {/* 検索 + 未マッピングのみ */}
        <div className="flex gap-2 mt-2">
          <div className="flex-1 flex items-center gap-1.5 bg-stone-900 border border-stone-700 rounded-lg px-2.5">
            <Search size={14} className="text-stone-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="品名・id で検索"
              className="flex-1 bg-transparent text-white text-sm py-2 focus:outline-none" />
          </div>
          <button onClick={() => setUnmappedOnly((v) => !v)}
            className={`px-3 rounded-lg text-xs font-medium border ${unmappedOnly ? 'bg-rose-600 text-white border-rose-500' : 'bg-stone-900 text-stone-400 border-stone-700'}`}>
            未割当のみ
          </button>
        </div>

        {/* Square の revenue_category フィルタ */}
        {tab === 'square' && (
          <div className="flex gap-1 mt-2 overflow-x-auto -mx-1 px-1">
            <button onClick={() => setRevCat('all')}
              className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] ${revCat === 'all' ? 'bg-stone-200 text-stone-900' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>全カテゴリ</button>
            {revCats.map((rc) => (
              <button key={rc} onClick={() => setRevCat(rc)}
                className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] ${revCat === rc ? 'bg-stone-200 text-stone-900' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>{rc}</button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-3">
        <div className="text-[11px] text-stone-500 mb-2 px-1">
          {tab === 'square' ? `${squareFiltered.length}件表示` : `${webFiltered.length}件表示`} / 割当済 {curStats.mapped} ・ 全 {curStats.total}
        </div>

        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : tab === 'square' ? (
          <div className="space-y-2">
            {squareFiltered.map((c) => {
              const key = `square:${c.catalog_object_id}`
              const cur = mapByKey.get(key) ?? UNASSIGNED
              const variation = (c.variation_names ?? []).filter(Boolean).join(' / ')
              const altNames = (c.item_names ?? []).filter((n) => n && n !== c.item_name)
              return (
                <Row
                  key={c.catalog_object_id}
                  mapped={cur !== UNASSIGNED}
                  busy={busy === key}
                  title={c.item_name || c.catalog_object_id}
                  sub={
                    `${variation ? variation + ' · ' : ''}${c.revenue_category ?? '未分類'} · ${c.total_qty ?? 0}個` +
                    (altNames.length ? ` · 別表記: ${altNames.join(', ')}` : '')
                  }
                  mono={c.catalog_object_id}
                  skus={skus}
                  value={cur}
                  onChange={(sku_id) => assign('square', c.catalog_object_id, sku_id, c.item_name || '', variation || null)}
                  skuLabel={skuLabel}
                />
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {webFiltered.map((v) => {
              const key = `web:${v.variant_id}`
              const cur = mapByKey.get(key) ?? UNASSIGNED
              return (
                <Row
                  key={v.variant_id}
                  mapped={cur !== UNASSIGNED}
                  busy={busy === key}
                  title={webVariantLabel(v)}
                  sub={v.category}
                  mono={v.variant_id}
                  skus={skus}
                  value={cur}
                  onChange={(sku_id) => assign('web', v.variant_id, sku_id, webVariantLabel(v), v.size || null)}
                  skuLabel={skuLabel}
                />
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function Row({
  mapped, busy, title, sub, mono, skus, value, onChange, skuLabel,
}: {
  mapped: boolean
  busy: boolean
  title: string
  sub: string
  mono: string
  skus: Sku[]
  value: string
  onChange: (sku_id: string) => void
  skuLabel: Map<string, string>
}) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${mapped ? 'border border-emerald-600/40' : 'border border-stone-700'}`} style={{ backgroundColor: '#292524' }}>
      <div className="flex items-start gap-2">
        {mapped ? <CheckCircle2 size={15} className="text-emerald-400 mt-0.5 shrink-0" /> : <Circle size={15} className="text-stone-600 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white truncate">{title}</div>
          <div className="text-[10px] text-stone-500 truncate">{sub}</div>
          <div className="text-[9px] text-stone-600 font-mono truncate">{mono}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <select
          value={value}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-stone-900 text-white text-sm rounded-lg px-2.5 py-2 border border-stone-700 focus:border-amber-500 focus:outline-none disabled:opacity-50"
        >
          <option value={UNASSIGNED}>（未割当）</option>
          {skus.map((s) => (
            <option key={s.sku_id} value={s.sku_id}>
              {skuLabel.get(s.sku_id) ?? s.sku_id}{typeof s.current_stock === 'number' ? ` — 在庫${s.current_stock}` : ''}
            </option>
          ))}
        </select>
        {busy && <span className="text-[10px] text-stone-500">保存中…</span>}
      </div>
    </div>
  )
}
