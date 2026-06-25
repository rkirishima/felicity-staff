'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession, getAdminSession } from '@/lib/session'
import { toast } from 'sonner'
import { Coffee, ChevronLeft, Flame, Check, X } from 'lucide-react'

// 焙煎済み豆のレベル(人の判断が正)。enough=十分 / low=そろそろ / roast_now=要焙煎
type BeanLevel = 'enough' | 'low' | 'roast_now'

// inv_bean_status ビュー
type BeanStatus = {
  bean_id: string
  display_name: string
  origin_country: string | null
  process: string | null
  notes: string | null
  level: BeanLevel | null
  container_note: string | null
  checked_by: string | null
  checked_at: string | null
  last_roast: string | null
  days_since_roast: number | null
  roast_count_30d: number | null
  roasted_kg_30d: number | null
}

const LEVEL_LABEL: Record<BeanLevel, string> = {
  enough: '十分',
  low: 'そろそろ',
  roast_now: '要焙煎',
}
const LEVEL_CHOICES: BeanLevel[] = ['enough', 'low', 'roast_now']

// 色: enough=緑 / low=黄 / roast_now=赤 / 未チェック=グレー
const LEVEL_STYLE: Record<BeanLevel, { dot: string; chip: string; activeBtn: string; idleBtn: string }> = {
  enough: { dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30', activeBtn: 'bg-emerald-600 text-white border-emerald-500', idleBtn: 'bg-stone-900 text-emerald-300/70 border-stone-700' },
  low: { dot: 'bg-yellow-400', chip: 'bg-yellow-400/15 text-yellow-200 border border-yellow-400/30', activeBtn: 'bg-yellow-500 text-stone-900 border-yellow-400', idleBtn: 'bg-stone-900 text-yellow-200/70 border-stone-700' },
  roast_now: { dot: 'bg-red-600', chip: 'bg-red-600/20 text-red-300 border border-red-600/40', activeBtn: 'bg-red-700 text-white border-red-600', idleBtn: 'bg-stone-900 text-red-400/70 border-stone-700' },
}
const UNCHECKED_DOT = 'bg-stone-500'

// 並び順: 要焙煎→そろそろ→十分→未チェック、同レベル内は焙煎からの経過日数が長い順
const LEVEL_RANK: Record<string, number> = { roast_now: 0, low: 1, enough: 2 }
function rank(level: BeanLevel | null): number {
  return level ? LEVEL_RANK[level] : 3
}

function currentUserName(): string {
  return getSession()?.staffName || getAdminSession()?.staffName || '不明'
}

export default function BeansInventoryPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  const [rows, setRows] = useState<BeanStatus[]>([])
  const [loading, setLoading] = useState(true)
  // 編集中カード: bean_id → { level, note }
  const [draft, setDraft] = useState<Record<string, { level: BeanLevel | null; note: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inv_bean_status')
      .select('bean_id, display_name, origin_country, process, notes, level, container_note, checked_by, checked_at, last_roast, days_since_roast, roast_count_30d, roasted_kg_30d')
    if (error) toast.error(`読み込み失敗: ${error.message}`)
    setRows((data as BeanStatus[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const r = rank(a.level) - rank(b.level)
      if (r !== 0) return r
      return (b.days_since_roast ?? -1) - (a.days_since_roast ?? -1)
    })
  }, [rows])

  async function record(bean: BeanStatus) {
    const d = draft[bean.bean_id]
    if (!d || !d.level) { toast.error('レベルを選んでください'); return }
    setBusy(bean.bean_id)
    const { error } = await supabase.from('inv_bean_checks').insert({
      bean_id: bean.bean_id,
      level: d.level,
      container_note: d.note.trim() || null,
      checked_by: currentUserName(),
    })
    setBusy(null)
    if (error) { toast.error(`記録失敗: ${error.message}`); return }
    toast.success(`${bean.display_name.split(' ')[0]} を記録しました`)
    setDraft((prev) => { const n = { ...prev }; delete n[bean.bean_id]; return n })
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
    <main className="min-h-screen pb-24 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="text-stone-400 hover:text-white"><ChevronLeft size={20} /></Link>
          <Coffee size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">焙煎在庫</h1>
          <span className="ml-auto text-[10px] text-stone-500">{rows.length}原産地</span>
        </div>
        <p className="text-[10px] text-stone-500 mt-2">焙煎済み豆のレベルを記録(人の判断が正)。袋詰めは受注後なので袋在庫は管理しません。</p>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : sorted.length === 0 ? (
          <p className="text-stone-500 text-sm py-10 text-center">active な原産地がありません</p>
        ) : (
          <div className="space-y-2.5">
            {sorted.map((bean) => {
              const d = draft[bean.bean_id]
              const editing = d !== undefined
              const lv = bean.level
              return (
                <div key={bean.bean_id} className="rounded-2xl px-3 py-3" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                  {/* 見出し行 */}
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${lv ? LEVEL_STYLE[lv].dot : UNCHECKED_DOT}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white leading-snug">{bean.display_name}</div>
                      <div className="text-[10px] text-stone-500 mt-0.5">
                        {bean.last_roast
                          ? `最終焙煎 ${bean.days_since_roast}日前`
                          : '焙煎記録なし'}
                        {` · 30日 ${bean.roast_count_30d ?? 0}回`}
                        {bean.roasted_kg_30d != null ? ` ${Number(bean.roasted_kg_30d).toFixed(1)}kg` : ''}
                      </div>
                      {bean.container_note && !editing && (
                        <div className="text-[10px] text-amber-300/70 mt-0.5">📦 {bean.container_note}{bean.checked_at ? ` (${bean.checked_at.slice(5)})` : ''}</div>
                      )}
                    </div>
                    {lv && !editing && (
                      <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-md ${LEVEL_STYLE[lv].chip}`}>{LEVEL_LABEL[lv]}</span>
                    )}
                    {lv === 'roast_now' && <Flame size={14} className="text-red-400 shrink-0 mt-0.5" />}
                  </div>

                  {/* レベル選択 */}
                  <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                    {LEVEL_CHOICES.map((l) => {
                      const active = d?.level === l
                      const st = LEVEL_STYLE[l]
                      return (
                        <button
                          key={l}
                          onClick={() => setDraft((prev) => ({ ...prev, [bean.bean_id]: { level: l, note: prev[bean.bean_id]?.note ?? bean.container_note ?? '' } }))}
                          className={`py-2 rounded-lg text-xs font-medium border transition-colors ${active ? st.activeBtn : st.idleBtn}`}
                        >
                          {LEVEL_LABEL[l]}
                        </button>
                      )
                    })}
                  </div>

                  {/* 容器メモ + 記録(レベル選択後に表示) */}
                  {editing && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={d.note}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [bean.bean_id]: { level: prev[bean.bean_id]?.level ?? null, note: e.target.value } }))}
                        placeholder="容器メモ(例 1.5kg容器 半分)"
                        className="flex-1 bg-stone-900 text-white text-sm rounded-lg px-2.5 py-2 border border-stone-700 focus:border-amber-500 focus:outline-none"
                      />
                      <button onClick={() => setDraft((prev) => { const n = { ...prev }; delete n[bean.bean_id]; return n })}
                        className="text-stone-400 hover:text-stone-200 p-2"><X size={16} /></button>
                      <button onClick={() => record(bean)} disabled={busy === bean.bean_id}
                        className="bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 text-white text-sm font-bold px-3 py-2 rounded-lg flex items-center gap-1">
                        <Check size={15} /> 記録
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
