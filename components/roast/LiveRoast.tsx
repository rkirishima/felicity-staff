'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Flame, Wind } from 'lucide-react'
import { checkpointsOf, fmtSec, parseRange, type RecommendedProfile } from '@/lib/roast/profile'

export type LiveEvents = { charge_at: string; dry_end_s: number | null; fc_s: number | null; drop_s: number | null }

type Status = 'early' | 'ok' | 'late' | 'pending'

function judge(t: number, w: { lo: number; hi: number } | null): Status {
  if (!w) return 'pending'
  if (t < w.lo - 5) return 'early'
  if (t > w.hi + 5) return 'late'
  return 'ok'
}

const STATUS_STYLE: Record<Status, { text: string; label: string }> = {
  early: { text: 'text-sky-300', label: '早い' },
  ok: { text: 'text-emerald-300', label: '予定どおり' },
  late: { text: 'text-rose-300', label: '遅い' },
  pending: { text: 'text-stone-400', label: '' },
}

/**
 * 焙煎中の画面。投入と同時にスタート → ドライエンド / 1ハゼ / ドロップ をタップ。
 * 次のチェックポイントの目標時刻・温度・ガス指示を大きく出し、1ハゼ後は発達時間と DTR をリアルタイム表示。
 */
export function LiveRoast({
  profile,
  beanName,
  greenKg,
  onDone,
  onCancel,
}: {
  profile: RecommendedProfile | null
  beanName: string
  greenKg: number
  onDone: (ev: LiveEvents) => void
  onCancel: () => void
}) {
  const [start] = useState(() => Date.now())
  const [chargeAt] = useState(() => new Date().toISOString())
  const [now, setNow] = useState(() => Date.now())
  const [ev, setEv] = useState<{ dry_end_s: number | null; fc_s: number | null; drop_s: number | null }>({ dry_end_s: null, fc_s: null, drop_s: null })
  const wake = useRef<{ release: () => Promise<void> } | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    // iPad の画面が消えないようにする（対応ブラウザのみ）
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { wake.current = l }).catch(() => {})
    return () => { clearInterval(id); wake.current?.release().catch(() => {}) }
  }, [])

  const t = Math.floor((now - start) / 1000)
  const cps = profile ? checkpointsOf(profile) : []
  const cp = (k: 'dry_end' | 'fc' | 'drop') => cps.find((c) => c.key === k) ?? null
  const dtrRange = parseRange(profile?.dtr_pct)

  const stage: 'dry' | 'maillard' | 'dev' = ev.fc_s != null ? 'dev' : ev.dry_end_s != null ? 'maillard' : 'dry'
  const next = stage === 'dry' ? cp('dry_end') : stage === 'maillard' ? cp('fc') : cp('drop')
  const nextStatus = next?.window ? judge(t, next.window) : 'pending'
  const remaining = next?.window ? next.window.lo - t : null

  const dev = ev.fc_s != null ? t - ev.fc_s : null
  const dtrNow = dev != null && t > 0 ? (dev / t) * 100 : null
  // 目標 DTR の下限に届く時刻（1ハゼ時刻から逆算）
  const dropByDtr = ev.fc_s != null && dtrRange ? { lo: ev.fc_s / (1 - dtrRange.lo / 100), hi: ev.fc_s / (1 - dtrRange.hi / 100) } : null

  function mark(k: 'dry_end_s' | 'fc_s') {
    setEv((e) => ({ ...e, [k]: e[k] ?? t }))
  }
  function drop() {
    const final = { ...ev, drop_s: t }
    setEv(final)
    onDone({ charge_at: chargeAt, ...final })
  }

  const recorded = [
    { k: 'ドライエンド', v: ev.dry_end_s, w: cp('dry_end')?.window ?? null },
    { k: '1ハゼ', v: ev.fc_s, w: cp('fc')?.window ?? null },
  ]

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: '#0c0a09' }}>
      <div className="flex items-center gap-2 px-4 pt-10 pb-2">
        <Flame size={18} className="text-amber-400" />
        <span className="text-sm text-stone-300 truncate">{beanName} · {greenKg}kg</span>
        <button onClick={() => { if (confirm('焙煎タイマーを中止しますか？（記録されません）')) onCancel() }} className="ml-auto p-2 text-stone-500" aria-label="中止">
          <X size={20} />
        </button>
      </div>

      <div className="text-center pt-2">
        <p className="text-[96px] leading-none font-bold text-white tabular-nums tracking-tight">{fmtSec(t)}</p>
        {dev != null && (
          <p className="mt-2 text-2xl tabular-nums text-amber-300">
            発達 {fmtSec(dev)} · DTR {dtrNow?.toFixed(1)}%
            {dtrRange && <span className="text-sm text-stone-400"> （目標 {profile?.dtr_pct}%）</span>}
          </p>
        )}
      </div>

      {/* 次にやること */}
      {next && (
        <div className="mx-4 mt-6 rounded-2xl p-4" style={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }}>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-stone-400">次</span>
            <span className="text-xl font-bold text-white">{next.label}</span>
            {next.window && (
              <span className="text-lg tabular-nums text-stone-200">
                {fmtSec(next.window.lo)}{next.window.hi !== next.window.lo ? `〜${fmtSec(next.window.hi)}` : ''}
              </span>
            )}
            {next.tempC != null && <span className="text-lg tabular-nums text-stone-300">{next.tempC}°C</span>}
          </div>
          <p className={`mt-1 text-sm ${STATUS_STYLE[nextStatus].text}`}>
            {remaining != null && remaining > 0 ? `あと ${fmtSec(remaining)}` : STATUS_STYLE[nextStatus].label}
          </p>
          {stage === 'dev' && dropByDtr && (
            <p className="mt-1 text-sm text-amber-200 tabular-nums">DTR基準のドロップ: {fmtSec(dropByDtr.lo)}〜{fmtSec(dropByDtr.hi)}</p>
          )}
          {(next.gas != null || next.fan != null) && (
            <div className="mt-3 flex gap-4 text-lg">
              {next.gas != null && <span className="flex items-center gap-1 text-orange-300"><Flame size={16} />ガス {next.gas}%</span>}
              {next.fan != null && <span className="flex items-center gap-1 text-sky-300"><Wind size={16} />ファン {next.fan}</span>}
            </div>
          )}
        </div>
      )}
      {!profile && (
        <p className="mx-4 mt-6 text-sm text-stone-400">この豆は目標プロファイルが未登録です。時刻だけ記録します。</p>
      )}

      {/* 記録済み */}
      <div className="mx-4 mt-4 flex gap-3">
        {recorded.map((r) => {
          const s = r.v != null ? judge(r.v, r.w) : 'pending'
          return (
            <div key={r.k} className="flex-1 rounded-xl p-2 text-center" style={{ backgroundColor: '#1c1917' }}>
              <p className="text-[11px] text-stone-500">{r.k}</p>
              <p className="text-lg tabular-nums text-white">{fmtSec(r.v)}</p>
              {r.v != null && <p className={`text-[11px] ${STATUS_STYLE[s].text}`}>{STATUS_STYLE[s].label}</p>}
            </div>
          )
        })}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-3 p-4 pb-10">
        <button onClick={() => mark('dry_end_s')} disabled={ev.dry_end_s != null}
          className="rounded-2xl py-6 text-lg font-bold bg-yellow-700 text-white disabled:opacity-30 active:scale-95">
          ドライエンド
        </button>
        <button onClick={() => mark('fc_s')} disabled={ev.fc_s != null}
          className="rounded-2xl py-6 text-lg font-bold bg-orange-700 text-white disabled:opacity-30 active:scale-95">
          1ハゼ
        </button>
        <button onClick={drop}
          className="rounded-2xl py-6 text-lg font-bold bg-rose-700 text-white active:scale-95">
          ドロップ
        </button>
      </div>
    </div>
  )
}
