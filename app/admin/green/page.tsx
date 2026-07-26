'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { useIsStaff } from '@/lib/use-is-staff'
import { Bean, ClipboardCheck, TruckIcon, AlertTriangle, ChevronLeft } from 'lucide-react'
import {
  STATUS_META,
  fmtDateJST,
  runsOutOn,
  type GreenStock,
} from '@/lib/green-stock'

export default function GreenStockPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const isStaff = useIsStaff()
  const [rows, setRows] = useState<GreenStock[]>([])
  const [loading, setLoading] = useState(true)

  const hasAccess = isAdmin || isStaff

  const load = useCallback(async () => {
    const { data } = await supabase.from('green_stock_current').select('*')
    setRows((data as GreenStock[]) ?? [])
    setLoading(false)
  }, [supabase])

  // load() は async で、setState は必ず await 後(マイクロタスク)に走る。
  // このルールが警告する「effect 本体での同期 setState」には当たらないので抑制する。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (hasAccess) load() }, [hasAccess, load])

  // 在庫が薄い順。ステータス優先、同順位なら残日数の少ない順。
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const d = STATUS_META[a.status].order - STATUS_META[b.status].order
      if (d !== 0) return d
      if (a.days_cover !== null && b.days_cover !== null) return a.days_cover - b.days_cover
      return Number(a.kg_on_hand) - Number(b.kg_on_hand)
    })
  }, [rows])

  const totals = useMemo(() => {
    const kg = rows.reduce((s, r) => s + Number(r.kg_on_hand), 0)
    const alerts = rows.filter((r) => r.status === 'urgent' || r.status === 'out').length
    const uncounted = rows.filter((r) => !r.has_count).length
    return { kg, alerts, uncounted }
  }, [rows])

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者またはスタッフでログインしてください</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <Link href="/admin" className="text-stone-500 text-xs flex items-center gap-1 mb-2">
          <ChevronLeft size={14} /> 管理メニュー
        </Link>
        <div className="flex items-center gap-2">
          <Bean size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">生豆在庫</h1>
        </div>
        <p className="text-xs text-stone-400 mt-1">
          合計 {totals.kg.toFixed(1)} kg / {rows.length} 銘柄
          {totals.alerts > 0 && <span className="text-orange-400"> ・要発注 {totals.alerts}</span>}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* 棚卸し未実施の警告 */}
        {totals.uncounted > 0 && (
          <div className="rounded-2xl p-4 flex gap-3" style={{ backgroundColor: 'rgba(245,158,11,0.10)', border: '1px solid #78350f' }}>
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-stone-300 leading-relaxed">
              <p className="font-semibold text-amber-300 mb-1">棚卸しが必要です（{totals.uncounted} 銘柄）</p>
              下の数字は仕入記録と焙煎実績の差し引きです。仕入の記録漏れがあるとズレます
              （マイナス表示はその状態）。一度だけ実測を入れれば、以降は焙煎ぶんが自動で引かれます。
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/admin/green/count"
            className="rounded-2xl p-4 flex items-center gap-3 active:opacity-70"
            style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}
          >
            <ClipboardCheck size={18} className="text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-stone-100">棚卸し</p>
              <p className="text-xs text-stone-500">実測kgを入力</p>
            </div>
          </Link>
          <Link
            href="/admin/green/purchase"
            className="rounded-2xl p-4 flex items-center gap-3 active:opacity-70"
            style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}
          >
            <TruckIcon size={18} className="text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-stone-100">仕入入力</p>
              <p className="text-xs text-stone-500">生豆の入荷</p>
            </div>
          </Link>
        </div>

        {loading ? (
          <p className="text-stone-500 text-sm text-center py-8">読み込み中...</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((r) => {
              const meta = STATUS_META[r.status]
              const out = runsOutOn(r)
              return (
                <div
                  key={r.bean_id}
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: '#292524', border: `1px solid ${meta.border}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-100 truncate">{r.display_name}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {[r.origin_country, r.process].filter(Boolean).join(' / ') || '—'}
                      </p>
                    </div>
                    <span
                      className="text-[10px] px-2 py-1 rounded-full shrink-0 font-medium"
                      style={{ color: meta.text, backgroundColor: meta.bg }}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <div className="flex items-end justify-between mt-3">
                    <div>
                      <p
                        className="text-2xl font-light"
                        style={{ color: Number(r.kg_on_hand) < 0 ? '#fca5a5' : '#fafaf9' }}
                      >
                        {Number(r.kg_on_hand).toFixed(1)}
                        <span className="text-sm text-stone-500 ml-1">kg</span>
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {Number(r.kg_per_day_60d) > 0
                          ? `${(Number(r.kg_per_day_60d) * 7).toFixed(1)} kg/週ペース`
                          : '直近60日の焙煎なし'}
                      </p>
                    </div>
                    <div className="text-right">
                      {r.days_cover !== null && r.days_cover >= 0 ? (
                        <>
                          <p className="text-sm text-stone-300">残り {r.days_cover} 日</p>
                          {out && (
                            <p className="text-xs text-stone-500 mt-0.5">
                              {out.toISOString().slice(0, 10)} 頃に切れる
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-stone-600">予測不可</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 mt-3 pt-3 text-[11px] text-stone-500" style={{ borderTop: '1px solid #44403c' }}>
                    <span>最終焙煎 {fmtDateJST(r.last_roast_at)}</span>
                    <span>最終仕入 {fmtDateJST(r.last_purchase_at)}</span>
                    {r.has_count && <span>棚卸 {fmtDateJST(r.last_count_at)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
