'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import { Flame, Trash2, Coffee } from 'lucide-react'

type Bean = {
  id: string
  display_name: string
  origin_country: string | null
  active: boolean
}

type RoastLog = {
  id: string
  roasted_at: string
  bean_id: string
  bean_raw: string | null
  green_kg: number
  roasted_kg: number | null
  machine: string | null
  notes: string | null
  source: string
  roast_beans?: { display_name: string }
}

const MACHINES = ['Probat P05III', 'Roest L100P']

// JST datetime-local の現在時刻文字列(YYYY-MM-DDTHH:mm)
function nowJSTLocal(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 16)
}

// "YYYY-MM-DDTHH:mm" (JST扱い) を ISO with +09:00 に変換
function localToIso(local: string): string {
  return new Date(local + ':00+09:00').toISOString()
}

// ISO文字列をJSTで人間可読に
function fmtJST(iso: string): string {
  const d = new Date(iso)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const m = jst.toISOString()
  return `${m.slice(0, 10)} ${m.slice(11, 16)}`
}

export default function RoastPage() {
  const supabase = createClient()
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)

  const [beans, setBeans] = useState<Bean[]>([])
  const [logs, setLogs] = useState<RoastLog[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // フォーム状態
  const [beanId, setBeanId] = useState('')
  const [datetime, setDatetime] = useState(nowJSTLocal())
  const [greenKg, setGreenKg] = useState('')
  const [roastedKg, setRoastedKg] = useState('')
  const [machine, setMachine] = useState(MACHINES[0])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setIsStaff(!!getSession())
  }, [])

  const hasAccess = isAdmin || isStaff

  useEffect(() => {
    if (!hasAccess) return
    load()
  }, [hasAccess])

  async function load() {
    setLoading(true)
    const [{ data: beansData }, { data: logsData }] = await Promise.all([
      supabase
        .from('roast_beans')
        .select('id, display_name, origin_country, active')
        .eq('active', true)
        .order('display_name'),
      supabase
        .from('roast_logs')
        .select('id, roasted_at, bean_id, bean_raw, green_kg, roasted_kg, machine, notes, source, roast_beans(display_name)')
        .order('roasted_at', { ascending: false })
        .limit(20),
    ])
    setBeans((beansData as Bean[]) ?? [])
    setLogs((logsData as unknown as RoastLog[]) ?? [])
    setLoading(false)
  }

  // 今月集計
  const monthStats = useMemo(() => {
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const ymPrefix = jstNow.toISOString().slice(0, 7) // YYYY-MM (JST)
    let batches = 0
    let kg = 0
    for (const l of logs) {
      const ld = new Date(l.roasted_at)
      const ldJst = new Date(ld.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
      if (ldJst === ymPrefix) {
        batches += 1
        kg += Number(l.green_kg)
      }
    }
    return { batches, kg }
  }, [logs])

  async function submit() {
    if (!beanId) return toast.error('豆を選択してください')
    if (!greenKg || Number(greenKg) <= 0) return toast.error('生豆kgを入力してください')

    setSubmitting(true)
    const selected = beans.find((b) => b.id === beanId)
    const { error } = await supabase.from('roast_logs').insert({
      roasted_at: localToIso(datetime),
      bean_id: beanId,
      bean_raw: selected?.display_name ?? null,
      green_kg: Number(greenKg),
      roasted_kg: roastedKg ? Number(roastedKg) : null,
      machine,
      notes: notes.trim() || null,
      source: 'ipad_manual',
    })
    setSubmitting(false)
    if (error) {
      toast.error(`記録失敗: ${error.message}`)
      return
    }
    toast.success(`${selected?.display_name ?? '焙煎'} ${greenKg}kg 記録しました`)
    setGreenKg('')
    setRoastedKg('')
    setNotes('')
    setDatetime(nowJSTLocal())
    load()
  }

  async function remove(id: string) {
    if (!confirm('この焙煎ログを削除しますか?')) return
    const { error } = await supabase.from('roast_logs').delete().eq('id', id)
    if (error) {
      toast.error(`削除失敗: ${error.message}`)
      return
    }
    toast.success('削除しました')
    setLogs((prev) => prev.filter((l) => l.id !== id))
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">
          管理者またはスタッフでログインしてください
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Flame size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">焙煎ログ</h1>
        </div>
        <p className="text-xs text-stone-400 mt-1">
          今月: {monthStats.batches} バッチ / {monthStats.kg.toFixed(1)} kg
        </p>
      </div>

      {/* 記録フォーム */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
          <h2 className="text-sm font-semibold text-stone-200 tracking-wider flex items-center gap-2">
            <Coffee size={16} className="text-amber-400" />
            新規記録
          </h2>

          <div>
            <label className="block text-xs text-stone-400 mb-1">豆</label>
            <select
              value={beanId}
              onChange={(e) => setBeanId(e.target.value)}
              className="w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-sm border border-stone-700 focus:border-amber-500 focus:outline-none"
            >
              <option value="">選択してください</option>
              {beans.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">焙煎日時</label>
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                className="w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-sm border border-stone-700 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">焙煎機</label>
              <select
                value={machine}
                onChange={(e) => setMachine(e.target.value)}
                className="w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-sm border border-stone-700 focus:border-amber-500 focus:outline-none"
              >
                {MACHINES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">生豆 (kg)</label>
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={greenKg}
                onChange={(e) => setGreenKg(e.target.value)}
                placeholder="3.6"
                className="w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-base border border-stone-700 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">焙煎後 (kg、任意)</label>
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={roastedKg}
                onChange={(e) => setRoastedKg(e.target.value)}
                placeholder="2.9"
                className="w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-base border border-stone-700 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">メモ (任意)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-stone-900 text-white rounded-lg px-3 py-2 text-sm border border-stone-700 focus:border-amber-500 focus:outline-none resize-none"
            />
          </div>

          <button
            onClick={submit}
            disabled={submitting || !beanId || !greenKg}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 disabled:text-stone-500 text-white font-semibold py-3 rounded-lg transition-colors active:scale-[0.98]"
          >
            {submitting ? '記録中...' : '記録する'}
          </button>
        </div>
      </div>

      {/* 最近の焙煎 */}
      <div className="px-4 pt-6">
        <h2 className="text-xs text-stone-400 tracking-wider mb-2">最近の焙煎(最新20件)</h2>
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : logs.length === 0 ? (
          <p className="text-stone-500 text-sm">まだ記録がありません</p>
        ) : (
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="rounded-lg p-3 flex items-center gap-3" style={{ backgroundColor: '#292524', border: '1px solid #3f3f3f' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {l.roast_beans?.display_name ?? l.bean_raw ?? l.bean_id}
                  </p>
                  <p className="text-xs text-stone-400">
                    {fmtJST(l.roasted_at)} · {Number(l.green_kg).toFixed(1)}kg
                    {l.roasted_kg ? ` → ${Number(l.roasted_kg).toFixed(1)}kg` : ''}
                    {l.machine ? ` · ${l.machine}` : ''}
                  </p>
                  {l.notes && <p className="text-xs text-stone-500 mt-1">{l.notes}</p>}
                </div>
                <button
                  onClick={() => remove(l.id)}
                  className="text-stone-500 hover:text-red-400 p-2"
                  aria-label="削除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
