'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import { TrendingUp, ChevronLeft } from 'lucide-react'

// inv_menu_forecast_next7 ビュー: 今後7日のメニュー別需要予想
type ForecastRow = {
  forecast_date: string
  name: string
  predicted_qty: number
}

const WD = ['日', '月', '火', '水', '木', '金', '土']

// 'YYYY-MM-DD' → { md:'6/26', wd:'金' }（ローカル日付として安全にパース）
function fmtDate(d: string): { md: string; wd: string } {
  const [y, m, day] = d.split('-').map((n) => parseInt(n, 10))
  const dt = new Date(y, (m || 1) - 1, day || 1)
  return { md: `${m}/${day}`, wd: WD[dt.getDay()] }
}

// 小数予想を見やすく（整数ならそのまま、端数は小数1桁）
function fmtQty(q: number): string {
  const r = Math.round(q * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

export default function InventoryForecastPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  const [rows, setRows] = useState<ForecastRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inv_menu_forecast_next7')
      .select('forecast_date, name, predicted_qty')
      .order('forecast_date')
      .order('predicted_qty', { ascending: false })
    if (error) toast.error(`読み込み失敗: ${error.message}`)
    setRows((data as ForecastRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  // 日付ごとにグルーピング（各日 predicted_qty 降順は order 済み）
  const byDate = useMemo(() => {
    const map = new Map<string, ForecastRow[]>()
    for (const r of rows) {
      if (!map.has(r.forecast_date)) map.set(r.forecast_date, [])
      map.get(r.forecast_date)!.push(r)
    }
    return Array.from(map.entries())
  }, [rows])

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
          <TrendingUp size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">需要予想</h1>
          <span className="ml-auto text-[10px] text-stone-500">今後7日</span>
        </div>
        <p className="text-[10px] text-stone-500 mt-2">売上履歴からのメニュー別予想数（夜間バッチ更新）。発注・仕込みの目安に。</p>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : byDate.length === 0 ? (
          <p className="text-stone-500 text-sm py-10 text-center">予想データがありません</p>
        ) : (
          <div className="space-y-4">
            {byDate.map(([date, list]) => {
              const { md, wd } = fmtDate(date)
              const isWeekend = wd === '土' || wd === '日'
              return (
                <div key={date}>
                  <div className="flex items-baseline gap-2 mb-1.5 px-1">
                    <span className="text-sm font-bold text-white tracking-wide">{md}</span>
                    <span className={`text-xs font-semibold ${wd === '日' ? 'text-rose-400' : wd === '土' ? 'text-sky-400' : 'text-stone-400'}`}>({wd})</span>
                    {isWeekend && <span className="text-[10px] text-amber-300/70">週末</span>}
                    <span className="ml-auto text-[10px] text-stone-500">{list.length}品</span>
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                    {list.map((r, i) => (
                      <div key={`${date}-${r.name}-${i}`} className={`px-3 py-2.5 flex items-center gap-3 ${i > 0 ? 'border-t border-stone-700/60' : ''}`}>
                        <span className="text-[11px] text-stone-600 font-mono w-5 text-right shrink-0">{i + 1}</span>
                        <span className="flex-1 min-w-0 text-sm text-white truncate">{r.name}</span>
                        <span className="shrink-0 text-sm font-bold text-amber-300 tabular-nums">{fmtQty(r.predicted_qty)}</span>
                        <span className="shrink-0 text-[10px] text-stone-500">食</span>
                      </div>
                    ))}
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
