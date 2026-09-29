'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X, Sparkles, RefreshCw, Coffee, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { CurveChart } from './CurveChart'
import { fmtSec, parseRange, parseWindow, type RecommendedProfile } from '@/lib/roast/profile'
import type { CurveDigest, RoastFlag } from '@/lib/roast/curve'

type Review = {
  headline: string
  verdict: 'good' | 'ok' | 'fix'
  summary: string
  what_happened: string[]
  cup_link?: string | null
  next_time: { change: string; why: string }
  keep?: string[]
}
type Cupping = { id: string; cupped_at: string; overall: number | null; sweetness: number | null; acidity: number | null; body: number | null; defects: string[] | null; notes: string | null; cupped_by?: string | null }
type Detail = {
  log: { id: string; roasted_at: string; green_kg: number; roasted_kg: number | null; notes: string | null; roast_level: string | null; use_case: string | null }
  bean_name: string
  weight_loss_pct: number | null
  digest: Partial<CurveDigest> | null
  points: { t: number; bt: number | null; et: number | null; ror: number | null }[]
  has_curve: boolean
  profile: RecommendedProfile | null
  cuppings: Cupping[]
  review: { review: Review; flags: RoastFlag[]; model: string; updated_at: string } | null
  review_stale: boolean
}

const DEFECTS = ['生焼け・草', 'ロースティ・焦げ', 'フラット・ベイクド', '酸が尖る', '渋い・えぐい', '重い・濁る']
const VERDICT = {
  good: { label: '良い', cls: 'bg-emerald-900/60 text-emerald-200' },
  ok: { label: 'まずまず', cls: 'bg-amber-900/60 text-amber-200' },
  fix: { label: '要修正', cls: 'bg-rose-900/60 text-rose-200' },
}

function Row({ k, actual, target, ok }: { k: string; actual: string; target: string; ok: boolean | null }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2 text-sm py-1 border-b border-stone-800 last:border-0">
      <span className="text-stone-400 text-xs self-center">{k}</span>
      <span className={`tabular-nums ${ok == null ? 'text-white' : ok ? 'text-emerald-300' : 'text-rose-300'}`}>{actual}</span>
      <span className="tabular-nums text-stone-500">{target}</span>
    </div>
  )
}

function Scale({ label, max, value, onChange }: { label: string; max: number; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-[11px] text-stone-400 mb-1">{label}</p>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={`flex-1 py-2 rounded-md text-sm tabular-nums ${value === n ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function RoastDetail({ logId, onClose, onChanged }: { logId: string; onClose: () => void; onChanged?: () => void }) {
  const [d, setD] = useState<Detail | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [roastedKg, setRoastedKg] = useState('')
  const [cup, setCup] = useState<{ overall: number | null; sweetness: number | null; acidity: number | null; body: number | null; defects: string[]; notes: string }>({ overall: null, sweetness: null, acidity: null, body: null, defects: [], notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/roast/log?id=${logId}`)
    const j = await res.json()
    if (!j.ok) { toast.error(j.error ?? '読み込み失敗'); return }
    setD(j as Detail)
    setRoastedKg(j.log.roasted_kg != null ? String(j.log.roasted_kg) : '')
    return j as Detail
  }, [logId])

  const runReview = useCallback(async (force: boolean) => {
    setAiBusy(true)
    try {
      const res = await fetch('/api/roast/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ logId, force }) })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      await load()
      onChanged?.()
    } catch (e) {
      toast.error(`AIレビュー失敗: ${e instanceof Error ? e.message : e}`)
    } finally {
      setAiBusy(false)
    }
  }, [logId, load, onChanged])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const j = await load()
      // まだレビューが無ければ自動で作る
      if (alive && j && !j.review) runReview(false)
    })()
    return () => { alive = false }
  }, [load, runReview])

  async function saveKg() {
    const v = roastedKg.trim() ? Number(roastedKg) : null
    const res = await fetch('/api/roast/log', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: logId, roasted_kg: v }) })
    const j = await res.json()
    if (!j.ok) return toast.error(j.error)
    toast.success('焙煎後重量を保存しました')
    await load()
    onChanged?.()
  }

  async function saveCup() {
    if (!cup.overall) return toast.error('総合点を選んでください')
    setSaving(true)
    const res = await fetch('/api/roast/cupping', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ logId, ...cup }) })
    const j = await res.json()
    setSaving(false)
    if (!j.ok) return toast.error(j.error)
    toast.success('カップ評価を保存。AIが味とカーブを照合します')
    setCup({ overall: null, sweetness: null, acidity: null, body: null, defects: [], notes: '' })
    await runReview(true)
  }

  const p = d?.profile ?? null
  const g = d?.digest ?? null
  const fcW = parseWindow(p?.fc_target)
  const dropW = parseWindow(p?.drop_target)
  const dtrR = parseRange(p?.dtr_pct)
  const wlR = parseRange(p?.weight_loss_pct)
  const inW = (v: number | null | undefined, w: { lo: number; hi: number } | null, slack = 0) =>
    v == null || !w ? null : v >= w.lo - slack && v <= w.hi + slack
  const rev = d?.review?.review ?? null

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto" style={{ backgroundColor: 'rgba(12,10,9,0.97)' }}>
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-24 space-y-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-white truncate">{d?.bean_name ?? '読み込み中…'}</p>
            {d && <p className="text-xs text-stone-400">{new Date(new Date(d.log.roasted_at).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} · {d.log.green_kg}kg{d.log.use_case ? ` · ${d.log.use_case}` : ''}</p>}
          </div>
          <button onClick={onClose} className="p-2 text-stone-400" aria-label="閉じる"><X size={22} /></button>
        </div>

        {/* AI レビュー */}
        <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: '#1e1b2e', border: '1px solid #4c1d95' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet-300" />
            <span className="text-xs font-semibold text-violet-200 tracking-wider">AIレビュー</span>
            {rev && <span className={`text-[10px] px-1.5 py-0.5 rounded ${VERDICT[rev.verdict].cls}`}>{VERDICT[rev.verdict].label}</span>}
            <button onClick={() => runReview(true)} disabled={aiBusy} className="ml-auto text-violet-300/70 p-1" aria-label="作り直す">
              <RefreshCw size={13} className={aiBusy ? 'animate-spin' : ''} />
            </button>
          </div>
          {d?.review_stale && (
            <button onClick={() => runReview(true)} className="w-full text-xs text-amber-200 bg-amber-900/30 rounded-md py-2">
              Probat のカーブが届きました。カーブ込みで作り直す
            </button>
          )}
          {!rev && <p className="text-xs text-violet-200/60">{aiBusy ? 'カーブと過去の焙煎を読んでいます…' : 'まだありません'}</p>}
          {rev && (
            <>
              <p className="text-base font-bold text-white">{rev.headline}</p>
              <p className="text-[13px] text-violet-50 leading-relaxed">{rev.summary}</p>
              {rev.what_happened.length > 0 && (
                <ul className="space-y-0.5">
                  {rev.what_happened.map((w, i) => <li key={i} className="text-[12px] text-violet-100/80 flex gap-2"><span>·</span><span>{w}</span></li>)}
                </ul>
              )}
              {rev.cup_link && <p className="text-[12px] text-violet-100/90 border-l-2 border-violet-500 pl-2">☕ {rev.cup_link}</p>}
              <div className="rounded-lg p-2.5 bg-amber-500/10 border border-amber-600/40">
                <p className="text-[10px] text-amber-300 tracking-wider">次回 変えること（1つだけ）</p>
                <p className="text-sm font-semibold text-amber-100">{rev.next_time.change}</p>
                <p className="text-[11px] text-amber-200/70">{rev.next_time.why}</p>
              </div>
              {rev.keep && rev.keep.length > 0 && (
                <p className="text-[11px] text-emerald-200/80"><CheckCircle2 size={11} className="inline mr-1" />維持: {rev.keep.join(' / ')}</p>
              )}
            </>
          )}
        </div>

        {/* 目標との比較 */}
        {d && (
          <div className="rounded-xl p-3" style={{ backgroundColor: '#1c1917', border: '1px solid #3f3f3f' }}>
            <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2 text-[10px] text-stone-500 pb-1">
              <span /> <span>今回</span> <span>目標</span>
            </div>
            <Row k="ボトム" actual={g?.tp_c != null ? `${g.tp_c}°C @${fmtSec(g.tp_s)}` : '—'} target="—" ok={null} />
            <Row k="150°C" actual={fmtSec(g?.dry_end_s)} target={p?.dry_end ?? '—'} ok={inW(g?.dry_end_s, parseWindow(p?.dry_end), 15)} />
            <Row k="1ハゼ" actual={`${fmtSec(g?.fc_s)}${g?.fc_c ? ` / ${g.fc_c}°` : ''}`} target={`${p?.fc_target ?? '—'}${p?.fc_temp_c ? ` / ${p.fc_temp_c}°` : ''}`} ok={inW(g?.fc_s, fcW, 10)} />
            <Row k="ドロップ" actual={`${fmtSec(g?.drop_s)}${g?.drop_c ? ` / ${g.drop_c}°` : ''}`} target={`${p?.drop_target ?? '—'}${p?.drop_temp_c ? ` / ${p.drop_temp_c}°` : ''}`} ok={inW(g?.drop_s, dropW, 10)} />
            <Row k="DTR" actual={g?.dtr_pct != null ? `${g.dtr_pct}%` : '—'} target={p?.dtr_pct ? `${p.dtr_pct}%` : '—'} ok={inW(g?.dtr_pct, dtrR, 1)} />
            <Row k="RoR@ドロップ" actual={g?.ror_at_drop != null ? String(g.ror_at_drop) : '—'} target={p?.ror_drop_min != null ? `${p.ror_drop_min}前後` : '—'} ok={g?.ror_at_drop != null && p?.ror_drop_min != null ? g.ror_at_drop <= p.ror_drop_min + 2 : null} />
            <Row k="重量減" actual={d.weight_loss_pct != null ? `${d.weight_loss_pct}%` : '未入力'} target={p?.weight_loss_pct ? `${p.weight_loss_pct}%` : '11〜13%(浅)'} ok={inW(d.weight_loss_pct, wlR, 0.5)} />

            <div className="flex gap-2 pt-3 items-center">
              <input type="number" step="0.01" inputMode="decimal" value={roastedKg} onChange={(e) => setRoastedKg(e.target.value)}
                placeholder="焙煎後 kg" className="flex-1 bg-stone-900 text-white rounded-lg px-3 py-2 text-base border border-stone-700" />
              <button onClick={saveKg} className="px-4 py-2 rounded-lg bg-stone-700 text-white text-sm">保存</button>
            </div>
          </div>
        )}

        {/* 判定フラグ */}
        {g?.flags && g.flags.length > 0 && (
          <div className="space-y-1">
            {g.flags.map((f, i) => (
              <p key={i} className={`text-[12px] flex gap-1.5 ${f.severity === 'bad' ? 'text-rose-300' : f.severity === 'warn' ? 'text-amber-300' : 'text-stone-400'}`}>
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />{f.message}
              </p>
            ))}
          </div>
        )}

        {d && (
          <CurveChart
            points={d.points}
            marks={[
              { t: g?.dry_end_s, label: '150°', color: '#eab308' },
              { t: g?.fc_s, label: '1ハゼ', color: '#f97316' },
              { t: g?.drop_s, label: 'DROP', color: '#f43f5e' },
            ]}
            targets={[
              ...(fcW ? [{ ...fcW, label: '1ハゼ目標' }] : []),
              ...(dropW ? [{ ...dropW, label: 'ドロップ目標' }] : []),
            ]}
          />
        )}

        {/* カップ評価 */}
        <div className="rounded-xl p-3 space-y-3" style={{ backgroundColor: '#1c1917', border: '1px solid #3f3f3f' }}>
          <p className="text-xs font-semibold text-stone-200 tracking-wider flex items-center gap-2"><Coffee size={14} className="text-amber-400" />カップ評価（飲んだら10秒で）</p>
          <Scale label="総合" max={10} value={cup.overall} onChange={(v) => setCup({ ...cup, overall: v })} />
          <div className="grid grid-cols-3 gap-2">
            <Scale label="甘さ" max={5} value={cup.sweetness} onChange={(v) => setCup({ ...cup, sweetness: v })} />
            <Scale label="酸" max={5} value={cup.acidity} onChange={(v) => setCup({ ...cup, acidity: v })} />
            <Scale label="ボディ" max={5} value={cup.body} onChange={(v) => setCup({ ...cup, body: v })} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEFECTS.map((df) => {
              const on = cup.defects.includes(df)
              return (
                <button key={df} type="button" onClick={() => setCup({ ...cup, defects: on ? cup.defects.filter((x) => x !== df) : [...cup.defects, df] })}
                  className={`text-xs px-2.5 py-1.5 rounded-full ${on ? 'bg-rose-700 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
                  {df}
                </button>
              )
            })}
          </div>
          <textarea value={cup.notes} onChange={(e) => setCup({ ...cup, notes: e.target.value })} rows={2} placeholder="味のメモ（例: 甘いが後半に灰っぽさ）"
            className="w-full bg-stone-900 text-white rounded-lg px-3 py-2 text-sm border border-stone-700 resize-none" />
          <button onClick={saveCup} disabled={saving || !cup.overall}
            className="w-full bg-amber-600 disabled:bg-stone-700 text-white font-semibold py-3 rounded-lg">
            {saving ? '保存中…' : '保存してAIに照合させる'}
          </button>

          {d && d.cuppings.length > 0 && (
            <div className="pt-2 space-y-1">
              {d.cuppings.map((c) => (
                <p key={c.id} className="text-[11px] text-stone-400">
                  {c.cupped_at.slice(5, 10)} ☕{c.overall}/10 甘{c.sweetness ?? '-'} 酸{c.acidity ?? '-'} ボ{c.body ?? '-'}
                  {c.defects?.length ? ` · ${c.defects.join('・')}` : ''}{c.notes ? ` · ${c.notes}` : ''}{c.cupped_by ? ` (${c.cupped_by})` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
