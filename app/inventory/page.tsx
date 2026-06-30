'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import { Boxes, ClipboardCheck, ShoppingCart, Settings, Snowflake, TrendingUp, Coffee } from 'lucide-react'
import {
  STATUS_LABEL,
  STATUS_STYLE,
  FREQ_LABEL,
  FREQ_CHOICES,
  asStatus,
  type StockStatus,
  type CheckFrequency,
} from '@/lib/inventory/labels'

// inv_latest_status ビュー: 品目ごとの最新チェック状態
type Row = {
  item_id: string
  name: string
  category: string | null
  check_frequency: CheckFrequency
  order_unit: string | null
  storage: string | null
  memo: string | null
  supplier_id: string | null
  status: string | null
  checked_by: string | null
  checked_at: string | null
}

export default function InventoryHomePage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [freqFilter, setFreqFilter] = useState<'all' | CheckFrequency>('all')
  const [catFilter, setCatFilter] = useState<string>('all')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inv_latest_status')
      .select('item_id, name, category, check_frequency, order_unit, storage, memo, supplier_id, status, checked_by, checked_at')
      .order('category', { nullsFirst: false })
      .order('name')
    if (error) toast.error(`読み込み失敗: ${error.message}`)
    setRows((data as Row[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  // カテゴリ一覧（データから動的に）
  const categories = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => set.add(r.category || 'その他'))
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (freqFilter !== 'all' && r.check_frequency !== freqFilter) return false
      if (catFilter !== 'all' && (r.category || 'その他') !== catFilter) return false
      return true
    })
  }, [rows, freqFilter, catFilter])

  // 状態別カウント（フィルタ適用後）
  const counts = useMemo(() => {
    const c: Record<StockStatus, number> = { enough: 0, reorder: 0, urgent: 0, unchecked: 0 }
    filtered.forEach((r) => { c[asStatus(r.status)]++ })
    return c
  }, [filtered])

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of filtered) {
      const key = r.category || 'その他'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map.entries())
  }, [filtered])

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-950">
        <div className="text-stone-400 text-sm">ログインが必要です</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#1c1917' }}>
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Boxes size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">在庫</h1>
          <span className="ml-auto text-[10px] text-stone-500">{filtered.length}品</span>
        </div>

        {/* アクションボタン */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Link href="/inventory/check" className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-2.5 rounded-xl">
            <ClipboardCheck size={15} /> チェック
          </Link>
          <Link href="/inventory/orders" className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold py-2.5 rounded-xl border border-stone-700">
            <ShoppingCart size={15} /> 発注
          </Link>
          {isAdmin ? (
            <Link href="/inventory/admin" className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold py-2.5 rounded-xl border border-stone-700">
              <Settings size={15} /> 管理
            </Link>
          ) : (
            <Link href="/inventory/orders/history" className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold py-2.5 rounded-xl border border-stone-700">
              履歴
            </Link>
          )}
        </div>

        {/* 需要予想・焙煎在庫への導線 */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Link href="/inventory/forecast" className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-bold py-2 rounded-xl border border-stone-700">
            <TrendingUp size={14} /> 需要予想
          </Link>
          <Link href="/inventory/beans" className="flex items-center justify-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-bold py-2 rounded-xl border border-stone-700">
            <Coffee size={14} /> 焙煎在庫
          </Link>
        </div>

        {/* 状態サマリー */}
        <div className="flex gap-1.5 mt-3">
          {(['urgent', 'reorder', 'enough', 'unchecked'] as StockStatus[]).map((s) => (
            <div key={s} className={`flex-1 rounded-lg px-2 py-1.5 text-center ${STATUS_STYLE[s].chip}`}>
              <div className="text-sm font-bold leading-none">{counts[s]}</div>
              <div className="text-[9px] mt-0.5 opacity-80">{STATUS_LABEL[s]}</div>
            </div>
          ))}
        </div>

        {/* 頻度フィルタ */}
        <div className="flex gap-1 mt-3 overflow-x-auto -mx-1 px-1">
          {(['all', ...FREQ_CHOICES] as const).map((f) => (
            <button key={f} onClick={() => setFreqFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${freqFilter === f ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
              {f === 'all' ? '全頻度' : FREQ_LABEL[f as CheckFrequency]}
            </button>
          ))}
        </div>

        {/* カテゴリフィルタ */}
        <div className="flex gap-1 mt-1.5 overflow-x-auto -mx-1 px-1">
          <button onClick={() => setCatFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${catFilter === 'all' ? 'bg-stone-200 text-stone-900' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
            全カテゴリ
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${catFilter === c ? 'bg-stone-200 text-stone-900' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : grouped.length === 0 ? (
          <p className="text-stone-500 text-sm py-10 text-center">該当する品目がありません</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <div className="text-[11px] font-semibold text-amber-400/80 mb-1.5 px-1 tracking-wide">{category}</div>
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                  {list.map((r, i) => {
                    const s = asStatus(r.status)
                    return (
                      <div key={r.item_id} className={`px-3 py-2.5 flex items-center gap-3 ${i > 0 ? 'border-t border-stone-700/60' : ''}`}>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_STYLE[s].dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-white truncate">{r.name}</span>
                            {r.storage === '冷凍' && <Snowflake size={11} className="text-sky-400 shrink-0" />}
                          </div>
                          <div className="text-[10px] text-stone-500">
                            {FREQ_LABEL[r.check_frequency]}
                            {r.order_unit ? ` · ${r.order_unit}` : ''}
                            {r.checked_at ? ` · ${r.checked_at.slice(5)} ${r.checked_by ?? ''}` : ' · 未チェック'}
                          </div>
                        </div>
                        <span className={`shrink-0 text-[10px] px-2 py-1 rounded-md ${STATUS_STYLE[s].chip}`}>{STATUS_LABEL[s]}</span>
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
