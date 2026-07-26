'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { useIsStaff } from '@/lib/use-is-staff'
import { toast } from 'sonner'
import { ChevronLeft, ClipboardCheck, Save } from 'lucide-react'
import { fmtDateJST, type GreenStock } from '@/lib/green-stock'

export default function GreenCountPage() {
  const supabase = createClient()
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const isStaff = useIsStaff()

  const [rows, setRows] = useState<GreenStock[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({}) // bean_id → 実測kg
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const hasAccess = isAdmin || isStaff

  const load = useCallback(async () => {
    const { data } = await supabase.from('green_stock_current').select('*').order('display_name')
    setRows((data as GreenStock[]) ?? [])
    setLoading(false)
  }, [supabase])

  // load() は async で、setState は必ず await 後(マイクロタスク)に走る。
  // このルールが警告する「effect 本体での同期 setState」には当たらないので抑制する。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (hasAccess) load() }, [hasAccess, load])

  const entered = useMemo(
    () => rows.filter((r) => {
      const v = counts[r.bean_id]
      return v !== undefined && v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0
    }),
    [rows, counts],
  )

  async function saveAll() {
    if (entered.length === 0) return toast.error('入力がありません')
    if (!confirm(`${entered.length}銘柄の棚卸しを記録します。よろしいですか?`)) return

    setSaving(true)
    const staff = getSession()
    const events = entered.map((r) => ({
      bean_id: r.bean_id,
      delta_kg: Number(counts[r.bean_id]),
      event_type: 'count_set' as const,
      notes: '棚卸し(一括入力)',
      created_by: staff?.staffName ?? 'admin',
    }))
    const { error } = await supabase.from('green_stock_events').insert(events)
    setSaving(false)
    if (error) return toast.error(`保存失敗: ${error.message}`)

    toast.success(`${entered.length}銘柄の棚卸しを記録しました`)
    setCounts({})
    router.push('/admin/green')
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者またはスタッフでログインしてください</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-40" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <Link href="/admin/green" className="text-stone-500 text-xs flex items-center gap-1 mb-2">
          <ChevronLeft size={14} /> 生豆在庫
        </Link>
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">棚卸し</h1>
        </div>
        <p className="text-xs text-stone-400 mt-1">実測した kg を入力（入れた銘柄だけ記録されます）</p>
      </div>

      <div className="px-4 pt-4">
        <div className="rounded-2xl p-4 mb-4 text-xs text-stone-400 leading-relaxed" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
          袋ごと量ってください。ここで入れた値が新しい基準になり、以降は
          <span className="text-amber-300">焙煎するたび自動で引かれ</span>、仕入を入力すれば足されます。
          全部やる必要はありません — 量った銘柄だけで大丈夫です。
        </div>

        {loading ? (
          <p className="text-stone-500 text-sm text-center py-8">読み込み中...</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const v = counts[r.bean_id] ?? ''
              const theoretical = Number(r.kg_on_hand)
              const diff = v !== '' && !Number.isNaN(Number(v)) ? Number(v) - theoretical : null
              return (
                <div key={r.bean_id} className="rounded-2xl p-4" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                  <p className="text-sm font-semibold text-stone-100">{r.display_name}</p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    計算上 {theoretical.toFixed(1)} kg
                    {r.has_count && ` ・前回棚卸 ${fmtDateJST(r.last_count_at)}`}
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0"
                      value={v}
                      onChange={(e) => setCounts((c) => ({ ...c, [r.bean_id]: e.target.value }))}
                      placeholder="実測 kg"
                      className="w-32 bg-stone-900 text-white rounded-lg px-3 py-3 text-base border border-stone-700 focus:border-amber-500 focus:outline-none"
                    />
                    <span className="text-sm text-stone-500">kg</span>
                    {diff !== null && Math.abs(diff) >= 0.05 && (
                      <span className={`text-xs ${diff > 0 ? 'text-teal-400' : 'text-orange-400'}`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg ズレ
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {entered.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4">
          <button
            onClick={saveAll}
            disabled={saving}
            className="w-full bg-amber-600 text-white rounded-2xl py-4 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
          >
            <Save size={16} />
            {saving ? '保存中...' : `${entered.length}銘柄を記録`}
          </button>
        </div>
      )}
    </main>
  )
}
