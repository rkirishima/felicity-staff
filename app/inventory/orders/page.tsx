'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession, getAdminSession } from '@/lib/session'
import { toast } from 'sonner'
import { ShoppingCart, ChevronLeft, Check, History, AlertTriangle } from 'lucide-react'
import {
  STATUS_LABEL,
  STATUS_STYLE,
  CONTACT_LABEL,
  asStatus,
  type ContactMethod,
} from '@/lib/inventory/labels'

// inv_order_list ビュー: reorder/urgent の品目（urgent優先）
type OrderRow = {
  item_id: string
  name: string
  category: string | null
  order_unit: string | null
  supplier_id: string | null
  status: string | null
  checked_at: string | null
  priority: number | null
}

type Supplier = {
  id: string
  name: string
  contact_method: ContactMethod | null
  email: string | null
  lead_time_days: number | null
}

function currentUserName(): string {
  return getSession()?.staffName || getAdminSession()?.staffName || '不明'
}

const NO_SUPPLIER = '__none__'

export default function InventoryOrdersPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  const [rows, setRows] = useState<OrderRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orderedMap, setOrderedMap] = useState<Record<string, string>>({}) // item_id → 最新発注日(YYYY-MM-DD)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [ol, sup, po] = await Promise.all([
      supabase.from('inv_order_list').select('item_id, name, category, order_unit, supplier_id, status, checked_at, priority'),
      supabase.from('inv_suppliers').select('id, name, contact_method, email, lead_time_days').order('name'),
      supabase.from('inv_purchase_orders').select('item_id, ordered_at').order('ordered_at', { ascending: false }),
    ])
    if (ol.error) toast.error(`発注リスト読み込み失敗: ${ol.error.message}`)
    setRows((ol.data as OrderRow[]) ?? [])
    setSuppliers((sup.data as Supplier[]) ?? [])
    // item_id ごとの最新発注日
    const m: Record<string, string> = {}
    for (const r of (po.data as { item_id: string; ordered_at: string }[]) ?? []) {
      if (!m[r.item_id]) m[r.item_id] = (r.ordered_at ?? '').slice(0, 10)
    }
    setOrderedMap(m)
    setLoading(false)
  }

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  // 最新チェック以降に発注済みの品目は除外（チェックで再び発注ラインになれば再表示）
  const pending = useMemo(() => {
    return rows.filter((r) => {
      const orderedAt = orderedMap[r.item_id]
      if (!orderedAt) return true
      if (!r.checked_at) return false
      return orderedAt < r.checked_at
    })
  }, [rows, orderedMap])

  const supplierName = useMemo(() => {
    const m = new Map<string, Supplier>()
    suppliers.forEach((s) => m.set(s.id, s))
    return m
  }, [suppliers])

  // 発注先ごとにグルーピング（未設定は要設定バケット）
  const groups = useMemo(() => {
    const map = new Map<string, OrderRow[]>()
    for (const r of pending) {
      const key = r.supplier_id ?? NO_SUPPLIER
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    // 要設定を最後に
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === NO_SUPPLIER) return 1
      if (b[0] === NO_SUPPLIER) return -1
      return (supplierName.get(a[0])?.name ?? '').localeCompare(supplierName.get(b[0])?.name ?? '')
    })
  }, [pending, supplierName])

  // 1品を発注済みにする
  async function markOrdered(r: OrderRow) {
    setBusy(r.item_id)
    const { error } = await supabase.from('inv_purchase_orders').insert({
      item_id: r.item_id,
      status_at_order: asStatus(r.status) === 'urgent' ? 'urgent' : 'reorder',
      supplier_id: r.supplier_id,
      order_unit: r.order_unit,
      ordered_by: currentUserName(),
    })
    setBusy(null)
    if (error) { toast.error(`発注記録失敗: ${error.message}`); return }
    toast.success(`${r.name} を発注済みにしました`)
    load()
  }

  // 発注先まとめて発注済み
  async function markGroupOrdered(list: OrderRow[]) {
    if (!confirm(`${list.length}品をまとめて発注済みにします。よろしいですか?`)) return
    setBusy('group')
    const by = currentUserName()
    const insertRows = list.map((r) => ({
      item_id: r.item_id,
      status_at_order: asStatus(r.status) === 'urgent' ? 'urgent' : 'reorder',
      supplier_id: r.supplier_id,
      order_unit: r.order_unit,
      ordered_by: by,
    }))
    const { error } = await supabase.from('inv_purchase_orders').insert(insertRows)
    setBusy(null)
    if (error) { toast.error(`発注記録失敗: ${error.message}`); return }
    toast.success(`${list.length}品を発注済みにしました`)
    load()
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-950">
        <div className="text-stone-400 text-sm">ログインが必要です</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="text-stone-400 hover:text-white"><ChevronLeft size={20} /></Link>
          <ShoppingCart size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">発注リスト</h1>
          <Link href="/inventory/orders/history" className="ml-auto flex items-center gap-1 text-[11px] text-stone-400 hover:text-white">
            <History size={13} /> 履歴
          </Link>
        </div>
        <p className="text-[10px] text-stone-500 mt-2">発注ライン・緊急の品目。発注先ごとにまとまっています。</p>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : pending.length === 0 ? (
          <p className="text-stone-500 text-sm py-10 text-center">発注が必要な品目はありません 🎉</p>
        ) : (
          <div className="space-y-4">
            {groups.map(([key, list]) => {
              const sup = key === NO_SUPPLIER ? null : supplierName.get(key)
              return (
                <div key={key} className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                  {/* 発注先ヘッダー */}
                  <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: '#1c1917' }}>
                    {sup ? (
                      <>
                        <span className="text-sm text-white font-semibold">{sup.name}</span>
                        {sup.contact_method && <span className="text-[10px] text-stone-400">{CONTACT_LABEL[sup.contact_method]}</span>}
                        {typeof sup.lead_time_days === 'number' && <span className="text-[10px] text-stone-500">リードタイム{sup.lead_time_days}日</span>}
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-amber-300 font-semibold">
                        <AlertTriangle size={13} /> 発注先 要設定
                      </span>
                    )}
                    <button
                      onClick={() => markGroupOrdered(list)}
                      disabled={busy !== null}
                      className="ml-auto text-[11px] bg-emerald-700 hover:bg-emerald-600 disabled:bg-stone-700 text-white px-2.5 py-1 rounded-md"
                    >
                      全部発注済
                    </button>
                  </div>
                  {/* 品目 */}
                  {list.map((r, i) => {
                    const s = asStatus(r.status)
                    return (
                      <div key={r.item_id} className={`px-3 py-2.5 flex items-center gap-3 ${i > 0 ? 'border-t border-stone-700/60' : ''}`}>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_STYLE[s].dot}`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white">{r.name}</span>
                          <div className="text-[10px] text-stone-500">
                            {r.category ?? ''}{r.order_unit ? ` · ${r.order_unit}` : ''}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md ${STATUS_STYLE[s].chip}`}>{STATUS_LABEL[s]}</span>
                        <button
                          onClick={() => markOrdered(r)}
                          disabled={busy !== null}
                          className="shrink-0 flex items-center gap-1 text-[11px] bg-stone-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-2.5 py-1.5 rounded-md"
                        >
                          <Check size={13} /> 発注済
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
