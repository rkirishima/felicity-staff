'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import Link from 'next/link'
import { Package, Plus, Pencil, Trash2, Boxes, AlertTriangle, X, Link2 } from 'lucide-react'

type Classification = 'apparel' | 'goods' | 'drip_pack' | 'coffee_beans' | 'food_other' | 'other'

type Sku = {
  sku_id: string
  name: string
  parent_sku: string | null
  variant_label: string | null
  classification: Classification
  price: number
  cost_yen: number | null
  tax_rate: number
  current_stock: number
  reorder_threshold: number | null
  reorder_default_qty: number | null
  supplier_id: string | null
  notes: string | null
  active: boolean
  updated_at: string
}

type Supplier = { id: string; name: string; active: boolean }

type StockEvent = {
  id: string
  sku_id: string
  ts: string
  delta: number
  event_type: 'purchase' | 'sale' | 'adjustment' | 'waste' | 'count_set'
  notes: string | null
  created_at: string
}

const CLASS_LABELS: Record<Classification, string> = {
  apparel: 'アパレル',
  goods: 'グッズ',
  drip_pack: 'ドリップパック',
  coffee_beans: '豆 (200g等)',
  food_other: '食品その他',
  other: 'その他',
}

const TABS: { key: 'all' | Classification; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'apparel', label: 'アパレル' },
  { key: 'goods', label: 'グッズ' },
  { key: 'drip_pack', label: 'ドリップパック' },
  { key: 'coffee_beans', label: '豆 200g' },
  { key: 'food_other', label: '食品' },
  { key: 'other', label: 'その他' },
]

const EVENT_LABELS: Record<StockEvent['event_type'], string> = {
  purchase: '仕入',
  sale: '販売',
  adjustment: '調整',
  waste: '廃棄',
  count_set: '棚卸',
}

export default function InventoryPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)

  const [skus, setSkus] = useState<Sku[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [events, setEvents] = useState<StockEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<'all' | Classification>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editingSku, setEditingSku] = useState<Sku | null>(null)
  const [adjustingSku, setAdjustingSku] = useState<Sku | null>(null)

  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  async function load() {
    setLoading(true)
    const [{ data: s }, { data: sup }, { data: ev }] = await Promise.all([
      supabase.from('keiri_sku_master')
        .select('*')
        .order('classification')
        .order('parent_sku', { nullsFirst: false })
        .order('name'),
      supabase.from('cafe_suppliers').select('id, name, active').order('name'),
      supabase.from('cafe_stock_events')
        .select('id, sku_id, ts, delta, event_type, notes, created_at')
        .order('ts', { ascending: false })
        .limit(30),
    ])
    setSkus((s as Sku[]) ?? [])
    setSuppliers((sup as Supplier[]) ?? [])
    setEvents((ev as StockEvent[]) ?? [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return skus.filter((s) => s.active && (tab === 'all' || s.classification === tab))
  }, [skus, tab])

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

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者ログインが必要です</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Boxes size={20} className="text-emerald-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">在庫管理</h1>
          <Link
            href="/admin/inventory/count"
            className="ml-auto bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Boxes size={14} /> 棚卸し
          </Link>
          <Link
            href="/admin/inventory/sync"
            className="bg-stone-700 hover:bg-stone-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Link2 size={14} /> POS紐付け
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Plus size={14} /> 新規SKU
          </button>
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto -mx-1 px-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : grouped.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#292524', border: '1px dashed #44403c' }}>
            <p className="text-stone-400 text-sm">このカテゴリにはSKUがまだありません</p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              最初のSKUを追加
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([parentKey, items]) => (
              <div key={parentKey} className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                {items.length > 1 && (
                  <div className="px-4 py-2 text-xs text-stone-400 font-semibold" style={{ backgroundColor: '#1c1917' }}>
                    {items[0].parent_sku} ({items.length}バリエーション)
                  </div>
                )}
                {items.map((s) => (
                  <SkuRow
                    key={s.sku_id}
                    sku={s}
                    onAdjust={() => setAdjustingSku(s)}
                    onEdit={() => setEditingSku(s)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 最近の在庫イベント */}
        {events.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs text-stone-400 tracking-wider mb-2">最近の在庫イベント</h2>
            <div className="space-y-1">
              {events.map((e) => {
                const sku = skus.find(s => s.sku_id === e.sku_id)
                return (
                  <div key={e.id} className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ backgroundColor: '#1c1917', border: '1px solid #292524' }}>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      e.event_type === 'purchase' ? 'bg-emerald-900 text-emerald-200' :
                      e.event_type === 'sale'     ? 'bg-blue-900 text-blue-200' :
                      e.event_type === 'waste'    ? 'bg-rose-900 text-rose-200' :
                      e.event_type === 'count_set' ? 'bg-amber-900 text-amber-200' :
                      'bg-stone-700 text-stone-300'
                    }`}>{EVENT_LABELS[e.event_type]}</span>
                    <span className="text-stone-200 truncate flex-1">{sku?.name ?? e.sku_id}</span>
                    <span className={`font-mono font-semibold ${e.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {e.event_type === 'count_set' ? `=${e.delta}` : `${e.delta >= 0 ? '+' : ''}${e.delta}`}
                    </span>
                    <span className="text-stone-500 text-[10px]">{new Date(e.ts).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* モーダル */}
      {showAdd && (
        <SkuFormModal
          suppliers={suppliers}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load() }}
        />
      )}
      {editingSku && (
        <SkuFormModal
          suppliers={suppliers}
          sku={editingSku}
          onClose={() => setEditingSku(null)}
          onSaved={() => { setEditingSku(null); load() }}
        />
      )}
      {adjustingSku && (
        <AdjustModal
          sku={adjustingSku}
          onClose={() => setAdjustingSku(null)}
          onSaved={() => { setAdjustingSku(null); load() }}
        />
      )}
    </main>
  )
}

// ─── SKU行 ──────────────────────────────────────

function SkuRow({ sku, onAdjust, onEdit }: { sku: Sku; onAdjust: () => void; onEdit: () => void }) {
  const lowStock = sku.reorder_threshold !== null && sku.current_stock <= sku.reorder_threshold
  return (
    <div className="px-4 py-3 flex items-center gap-3 border-t" style={{ borderColor: '#3f3f3f' }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">
          {sku.variant_label ? sku.variant_label : sku.name}
        </p>
        <p className="text-[10px] text-stone-500 truncate">
          ¥{sku.price.toLocaleString()} (税率{sku.tax_rate}%)
          {sku.cost_yen ? ` · 原価¥${sku.cost_yen.toLocaleString()}` : ''}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <p className={`text-2xl font-bold leading-none ${lowStock ? 'text-rose-400' : 'text-emerald-300'}`}>
          {sku.current_stock}
        </p>
        {lowStock && (
          <span className="text-[9px] text-rose-300 flex items-center gap-0.5">
            <AlertTriangle size={9} /> 閾値{sku.reorder_threshold}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={onAdjust}
          className="bg-stone-700 hover:bg-stone-600 text-white text-xs px-3 py-1.5 rounded font-semibold"
        >
          調整
        </button>
        <button onClick={onEdit} className="text-stone-500 hover:text-stone-300 p-1" title="編集">
          <Pencil size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── 新規/編集モーダル ──────────────────────────

function SkuFormModal({ sku, suppliers, onClose, onSaved }: {
  sku?: Sku
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const isEdit = !!sku
  const [skuId, setSkuId] = useState(sku?.sku_id ?? '')
  const [name, setName] = useState(sku?.name ?? '')
  const [parentSku, setParentSku] = useState(sku?.parent_sku ?? '')
  const [variantLabel, setVariantLabel] = useState(sku?.variant_label ?? '')
  const [classification, setClassification] = useState<Classification>(sku?.classification ?? 'apparel')
  const [price, setPrice] = useState(String(sku?.price ?? ''))
  const [costYen, setCostYen] = useState(sku?.cost_yen ? String(sku.cost_yen) : '')
  const [taxRate, setTaxRate] = useState(String(sku?.tax_rate ?? 10))
  const [reorderThreshold, setReorderThreshold] = useState(sku?.reorder_threshold ? String(sku.reorder_threshold) : '')
  const [reorderDefaultQty, setReorderDefaultQty] = useState(sku?.reorder_default_qty ? String(sku.reorder_default_qty) : '')
  const [supplierId, setSupplierId] = useState(sku?.supplier_id ?? '')
  const [notes, setNotes] = useState(sku?.notes ?? '')
  const [initialStock, setInitialStock] = useState('') // 新規時のみ
  const [submitting, setSubmitting] = useState(false)

  async function save() {
    if (!skuId.trim() || !name.trim() || !price) {
      toast.error('SKU ID, 名前, 価格は必須')
      return
    }
    setSubmitting(true)
    const row = {
      sku_id: skuId.trim(),
      name: name.trim(),
      parent_sku: parentSku.trim() || null,
      variant_label: variantLabel.trim() || null,
      classification,
      price: Number(price),
      cost_yen: costYen ? Number(costYen) : null,
      tax_rate: Number(taxRate) as 8 | 10,
      reorder_threshold: reorderThreshold ? Number(reorderThreshold) : null,
      reorder_default_qty: reorderDefaultQty ? Number(reorderDefaultQty) : null,
      supplier_id: supplierId || null,
      notes: notes.trim() || null,
      active: true,
    }
    if (isEdit) {
      const { error } = await supabase.from('keiri_sku_master').update(row).eq('sku_id', sku!.sku_id)
      if (error) { toast.error(error.message); setSubmitting(false); return }
      toast.success('更新しました')
    } else {
      const { error } = await supabase.from('keiri_sku_master').insert(row)
      if (error) { toast.error(error.message); setSubmitting(false); return }
      // 初期在庫があれば棚卸しイベント
      if (initialStock) {
        await supabase.from('cafe_stock_events').insert({
          sku_id: skuId.trim(),
          delta: Number(initialStock),
          event_type: 'count_set',
          notes: '初期棚卸し',
          created_by: 'manual',
        })
      }
      toast.success('追加しました')
    }
    setSubmitting(false)
    onSaved()
  }

  return (
    <ModalShell title={isEdit ? 'SKU編集' : '新規SKU'} onClose={onClose}>
      <div className="space-y-3">
        <Row label="SKU ID *">
          <input value={skuId} onChange={(e) => setSkuId(e.target.value)} disabled={isEdit}
                 placeholder="staff-cap-grey 等(半角英数+ハイフン)"
                 className="input" />
        </Row>
        <Row label="商品名 *">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Felicity スタッフキャップ グレー" className="input" />
        </Row>
        <div className="grid grid-cols-2 gap-2">
          <Row label="親SKU(任意)">
            <input value={parentSku} onChange={(e) => setParentSku(e.target.value)} placeholder="staff-cap" className="input" />
          </Row>
          <Row label="バリエーション">
            <input value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} placeholder="グレー / L 等" className="input" />
          </Row>
        </div>
        <Row label="カテゴリ">
          <select value={classification} onChange={(e) => setClassification(e.target.value as Classification)} className="input">
            {(Object.keys(CLASS_LABELS) as Classification[]).map(c => (
              <option key={c} value={c}>{CLASS_LABELS[c]}</option>
            ))}
          </select>
        </Row>
        <div className="grid grid-cols-3 gap-2">
          <Row label="販売価格 *">
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="input" />
          </Row>
          <Row label="原価">
            <input type="number" value={costYen} onChange={(e) => setCostYen(e.target.value)} className="input" />
          </Row>
          <Row label="税率">
            <select value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="input">
              <option value="10">10%</option>
              <option value="8">8% (軽減)</option>
            </select>
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Row label="再発注閾値">
            <input type="number" value={reorderThreshold} onChange={(e) => setReorderThreshold(e.target.value)} placeholder="3" className="input" />
          </Row>
          <Row label="推奨発注数">
            <input type="number" value={reorderDefaultQty} onChange={(e) => setReorderDefaultQty(e.target.value)} placeholder="10" className="input" />
          </Row>
        </div>
        <Row label="仕入先">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input">
            <option value="">(未設定)</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Row>
        {!isEdit && (
          <Row label="初期在庫(棚卸し)">
            <input type="number" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} placeholder="0" className="input" />
          </Row>
        )}
        <Row label="メモ">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
        </Row>
        <button
          onClick={save}
          disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-700 text-white font-semibold py-3 rounded-lg"
        >
          {submitting ? '保存中...' : isEdit ? '更新' : '追加'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── 在庫調整モーダル ──────────────────────────

function AdjustModal({ sku, onClose, onSaved }: { sku: Sku; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [mode, setMode] = useState<'purchase' | 'waste' | 'count_set' | 'adjustment'>('purchase')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function save() {
    const n = Number(qty)
    if (!qty || isNaN(n) || n < 0) {
      toast.error('数量を正しく入力してください')
      return
    }
    setSubmitting(true)
    const delta = mode === 'count_set' ? n : (mode === 'waste' ? -n : (mode === 'adjustment' ? n : n))
    const event_type = mode
    const finalDelta = mode === 'waste' ? -Math.abs(n) : (mode === 'adjustment' ? Number(qty) : n) // adjustmentは±符号付き入力想定
    const { error } = await supabase.from('cafe_stock_events').insert({
      sku_id: sku.sku_id,
      delta: mode === 'count_set' ? n : finalDelta,
      event_type,
      notes: notes.trim() || null,
      created_by: 'manual',
    })
    setSubmitting(false)
    if (error) { toast.error(error.message); return }
    toast.success('記録しました')
    onSaved()
  }

  return (
    <ModalShell title={`在庫調整: ${sku.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-stone-400">現在: <span className="text-white font-bold">{sku.current_stock}</span> 個</p>
        <div className="grid grid-cols-4 gap-2">
          {([
            ['purchase', '+ 仕入', 'bg-emerald-600'],
            ['waste', '- 廃棄', 'bg-rose-600'],
            ['count_set', '棚卸し', 'bg-amber-600'],
            ['adjustment', '± 調整', 'bg-stone-600'],
          ] as const).map(([m, label, color]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === m ? `${color} text-white` : 'bg-stone-900 text-stone-400 border border-stone-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Row label={
          mode === 'count_set' ? '実数(物理計量値)' :
          mode === 'adjustment' ? '増減(±符号付き、例: -2 で2減)' :
          '数量'
        }>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={mode === 'adjustment' ? '-2 / +3' : '5'}
            className="input"
          />
        </Row>
        <Row label="メモ">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
        </Row>
        <button
          onClick={save}
          disabled={submitting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-700 text-white font-semibold py-3 rounded-lg"
        >
          {submitting ? '記録中...' : '記録'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── 共通 ──────────────────────────────────────

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
        <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#292524', borderBottom: '1px solid #44403c' }}>
          <h2 className="text-sm font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
      <style jsx>{`
        :global(.input) {
          width: 100%;
          background-color: #1c1917;
          color: #fff;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          border: 1px solid #44403c;
          outline: none;
        }
        :global(.input:focus) { border-color: #10b981; }
      `}</style>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-stone-400 mb-1 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}
