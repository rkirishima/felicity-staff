'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'
import { Flame, Trash2, Coffee, Thermometer, Lightbulb, AlertTriangle } from 'lucide-react'
import {
  profileFor,
  profilesForBean,
  chargeTempFor,
  heatMethodJa,
  ROAST_LEVEL_LABELS,
  type RoastLevel,
} from '@/lib/roast-profiles'

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
const BATCH_PRESETS = [1.0, 2.0, 3.6]

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
  const [roastLevel, setRoastLevel] = useState<RoastLevel | ''>('')
  const [datetime, setDatetime] = useState(nowJSTLocal())
  const [greenKg, setGreenKg] = useState('')
  const [roastedKg, setRoastedKg] = useState('')
  const [machine, setMachine] = useState(MACHINES[0])
  const [notes, setNotes] = useState('')

  // 豆選択時に利用可能なローストレベルから最初のものを自動選択
  useEffect(() => {
    if (!beanId) { setRoastLevel(''); return }
    const profiles = profilesForBean(beanId)
    if (profiles.length > 0) {
      // 既存のレベルが選択中の豆にあればそれを保持、無ければ最初のもの
      const cur = profiles.find((p) => p.roast_level === roastLevel)
      if (!cur) setRoastLevel(profiles[0].roast_level)
    } else {
      setRoastLevel('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beanId])

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
      roast_level: roastLevel || null,
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

          {/* ローストレベル選択(豆選択時に表示) */}
          {beanId && profilesForBean(beanId).length > 0 && (
            <div>
              <label className="block text-xs text-stone-400 mb-1">ローストレベル</label>
              <div className="flex flex-wrap gap-2">
                {profilesForBean(beanId).map((p) => (
                  <button
                    key={p.roast_level}
                    type="button"
                    onClick={() => setRoastLevel(p.roast_level)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      roastLevel === p.roast_level
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-900 text-stone-400 border border-stone-700 hover:border-amber-500'
                    }`}
                  >
                    {ROAST_LEVEL_LABELS[p.roast_level]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 焙煎プロファイル(豆 × レベル選択時に表示) */}
          {(() => {
            if (!beanId) return null
            const p = profileFor(beanId, (roastLevel || undefined) as RoastLevel | undefined)
            if (!p) return (
              <div className="rounded-lg p-3 text-xs text-stone-400" style={{ backgroundColor: '#1c1917', border: '1px solid #3f3f3f' }}>
                この豆のプロファイル未登録。経験値で焙煎してください。
              </div>
            )
            const kgNum = Number(greenKg) || 1
            const charge = chargeTempFor(p, kgNum)
            return (
              <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }}>
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <Thermometer size={14} />
                  <span className="font-semibold tracking-wider">推奨プロファイル</span>
                  <span className="ml-auto text-stone-500">{p.group}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-stone-900 rounded p-2">
                    <p className="text-[10px] text-stone-500">CHARGE</p>
                    <p className="text-base font-bold text-white">{charge}°C</p>
                    <p className="text-[9px] text-stone-600">{kgNum}kg時</p>
                  </div>
                  <div className="bg-stone-900 rounded p-2">
                    <p className="text-[10px] text-stone-500">FC</p>
                    <p className="text-base font-bold text-white">{p.fc_c}°C</p>
                  </div>
                  <div className="bg-stone-900 rounded p-2">
                    <p className="text-[10px] text-stone-500">DROP</p>
                    <p className="text-base font-bold text-amber-400">{p.drop_c}°C</p>
                  </div>
                  <div className="bg-stone-900 rounded p-2">
                    <p className="text-[10px] text-stone-500">TIME</p>
                    <p className="text-base font-bold text-white">{p.total_time_min}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-blue-900 text-blue-200">熱量: {heatMethodJa(p.heat_method)}</span>
                  <span className="px-2 py-0.5 rounded bg-stone-700 text-stone-300">ドラム: {p.drum_rpm} RPM</span>
                  {p.soak && <span className="px-2 py-0.5 rounded bg-emerald-900 text-emerald-200">SOAK 60秒(CHARGE後30%)</span>}
                  {p.drum_note && <span className="px-2 py-0.5 rounded bg-rose-900 text-rose-200">{p.drum_note}</span>}
                </div>

                <div className="text-xs text-stone-300 leading-relaxed">
                  <span className="text-amber-400">🎯</span> {p.flavor}
                </div>
                <div className="text-xs text-stone-400 leading-relaxed">
                  <Lightbulb size={12} className="inline text-amber-500 mr-1" />
                  {p.strategy}
                </div>
                <div className="text-xs text-stone-300 leading-relaxed border-l-2 border-rose-700 pl-2">
                  <AlertTriangle size={12} className="inline text-rose-400 mr-1" />
                  {p.pro_tip}
                </div>
              </div>
            )
          })()}

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
              <div className="flex gap-2 mb-2">
                {BATCH_PRESETS.map((kg) => (
                  <button
                    key={kg}
                    type="button"
                    onClick={() => setGreenKg(String(kg))}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      Number(greenKg) === kg
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-900 text-stone-400 border border-stone-700 hover:border-amber-500'
                    }`}
                  >
                    {kg}kg
                  </button>
                ))}
              </div>
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={greenKg}
                onChange={(e) => setGreenKg(e.target.value)}
                placeholder="カスタム (例 1.3)"
                className="w-full bg-stone-900 text-white rounded-lg px-3 py-2 text-sm border border-stone-700 focus:border-amber-500 focus:outline-none"
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
