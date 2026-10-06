'use client'

import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { fmtSec } from '@/lib/roast/profile'

type Brief = { focus: string; points: string[]; watch: { at: string; what: string }[] }
type Hist = {
  id: string
  roasted_at: string
  green_kg: number
  weight_loss_pct: number | null
  digest: { fc_s?: number | null; drop_s?: number | null; dtr_pct?: number | null } | null
  cup: { overall: number | null } | null
  review_headline: string | null
  next_time: string | null
}

/** 焼く前の「今日のポイント」。前回の宿題・カップ評価を踏まえて AI が作る。 */
export function AiBrief({ beanId, greenKg, level }: { beanId: string; greenKg: number; level: string }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [history, setHistory] = useState<Hist[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!beanId || !greenKg) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setErr(null)
      try {
        const res = await fetch('/api/roast/brief', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ beanId, greenKg, level }),
        })
        const j = await res.json()
        if (cancelled) return
        if (!j.ok) throw new Error(j.error ?? 'failed')
        setBrief(j.brief)
        setHistory(j.history ?? [])
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [beanId, greenKg, level, nonce])

  if (!beanId) return null

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#1e1b2e', border: '1px solid #4c1d95' }}>
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet-300" />
        <span className="text-xs font-semibold tracking-wider text-violet-200">今日のポイント（AI）</span>
        <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-auto text-violet-300/70 hover:text-violet-200 p-1" aria-label="作り直す">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !brief && <p className="text-xs text-violet-200/60">過去の焙煎とカップ評価を読んでいます…</p>}
      {err && <p className="text-xs text-rose-300">取得できませんでした: {err}</p>}
      {!loading && !err && !brief && <p className="text-xs text-violet-200/60">AIが応答しませんでした（右上で再試行）</p>}

      {brief && (
        <>
          {brief.focus && <p className="text-base font-bold text-white leading-snug">{brief.focus}</p>}
          {brief.points.length > 0 && (
            <ul className="space-y-1">
              {brief.points.map((p, i) => (
                <li key={i} className="text-[13px] text-violet-50 leading-relaxed flex gap-2">
                  <span className="text-violet-300">•</span><span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          {brief.watch.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {brief.watch.map((w, i) => (
                <span key={i} className="text-[11px] px-2 py-1 rounded-md bg-violet-900/50 text-violet-100">
                  <b className="tabular-nums">{w.at}</b> {w.what}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="pt-2 border-t border-violet-900/60 space-y-1">
          <p className="text-[10px] text-violet-300/70 tracking-wider">直近の同じ豆</p>
          {history.slice(0, 3).map((h) => (
            <div key={h.id} className="text-[11px] text-violet-100/80 flex gap-2 items-baseline">
              <span className="tabular-nums text-violet-300/70 shrink-0">{h.roasted_at.slice(5, 10)}</span>
              <span className="tabular-nums shrink-0">
                {h.digest?.fc_s != null ? `1ハゼ${fmtSec(h.digest.fc_s)}` : ''}
                {h.digest?.dtr_pct != null ? ` DTR${h.digest.dtr_pct}%` : ''}
                {h.weight_loss_pct != null ? ` 減${h.weight_loss_pct}%` : ''}
                {h.cup?.overall != null ? ` ☕${h.cup.overall}` : ''}
              </span>
              <span className="truncate text-violet-200/70">{h.next_time ? `宿題: ${h.next_time}` : h.review_headline ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
