'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import { History, ChevronLeft } from 'lucide-react'
import { STATUS_LABEL, STATUS_STYLE, asStatus } from '@/lib/inventory/labels'

// inv_purchase_orders: 発注履歴
type PO = {
  id: string
  item_id: string
  status_at_order: string | null
  supplier_id: string | null
  order_unit: string | null
  ordered_by: string | null
  ordered_at: string | null
  note: string | null
}

export default function InventoryOrderHistoryPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  const [orders, setOrders] = useState<PO[]>([])
  const [itemName, setItemName] = useState<Record<string, string>>({})
  const [supName, setSupName] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [po, items, sups] = await Promise.all([
      supabase.from('inv_purchase_orders').select('id, item_id, status_at_order, supplier_id, order_unit, ordered_by, ordered_at, note').order('ordered_at', { ascending: false }).limit(300),
      supabase.from('inv_items').select('id, name'),
      supabase.from('inv_suppliers').select('id, name'),
    ])
    if (po.error) toast.error(`履歴読み込み失敗: ${po.error.message}`)
    setOrders((po.data as PO[]) ?? [])
    const im: Record<string, string> = {}
    for (const it of (items.data as { id: string; name: string }[]) ?? []) im[it.id] = it.name
    setItemName(im)
    const sm: Record<string, string> = {}
    for (const s of (sups.data as { id: string; name: string }[]) ?? []) sm[s.id] = s.name
    setSupName(sm)
    setLoading(false)
  }

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  // 発注日（JST日付）ごとにグルーピング
  const byDate = useMemo(() => {
    const map = new Map<string, PO[]>()
    for (const o of orders) {
      const d = (o.ordered_at ?? '').slice(0, 10) || '不明'
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(o)
    }
    return Array.from(map.entries())
  }, [orders])

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
          <Link href="/inventory/orders" className="text-stone-400 hover:text-white"><ChevronLeft size={20} /></Link>
          <History size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">発注履歴</h1>
          <span className="ml-auto text-[10px] text-stone-500">{orders.length}件</span>
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : orders.length === 0 ? (
          <p className="text-stone-500 text-sm py-10 text-center">発注履歴はまだありません</p>
        ) : (
          <div className="space-y-4">
            {byDate.map(([date, list]) => (
              <div key={date}>
                <div className="text-[11px] font-semibold text-amber-400/80 mb-1.5 px-1 tracking-wide">{date}</div>
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                  {list.map((o, i) => {
                    const s = asStatus(o.status_at_order)
                    return (
                      <div key={o.id} className={`px-3 py-2.5 flex items-center gap-3 ${i > 0 ? 'border-t border-stone-700/60' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-white">{itemName[o.item_id] ?? o.item_id}</span>
                          <div className="text-[10px] text-stone-500">
                            {o.supplier_id ? (supName[o.supplier_id] ?? '—') : '発注先未設定'}
                            {o.order_unit ? ` · ${o.order_unit}` : ''}
                            {o.ordered_by ? ` · ${o.ordered_by}` : ''}
                            {o.ordered_at ? ` · ${o.ordered_at.slice(11, 16)}` : ''}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md ${STATUS_STYLE[s].chip}`}>{STATUS_LABEL[s]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
