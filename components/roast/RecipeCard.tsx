'use client'

import { useEffect, useState } from 'react'
import { Flame, Wind, AlertTriangle, Info } from 'lucide-react'
import { CurveChart } from './CurveChart'
import { fmtSec } from '@/lib/roast/profile'
import { ROAST_LEVEL_LABELS } from '@/lib/roast-profiles'
import { roastedKgRange, STATUS_LABEL, type Recipe } from '@/lib/roast/recipe'

type Row =
  | { kind: 'step'; t: number; bt: number | null; gas: number | null; fan: number | null; note?: string | null }
  | { kind: 'mark'; t: number; label: string; temp: number | null }

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl px-3 py-2 bg-stone-900 border border-stone-800">
      <p className="text-[11px] text-stone-400">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-stone-400 tabular-nums">{sub}</p>}
    </div>
  )
}

/** 焙煎中に見るレシピ。上に大事な数字、下に「いつ・何度で・ガス/ファンをいくつに」の表 */
export function RecipeCard({ recipe, beanName, greenKg, exact }: { recipe: Recipe; beanName: string; greenKg: number; exact: boolean }) {
  const t = recipe.targets ?? {}
  const [points, setPoints] = useState<{ t: number; bt: number | null; et: number | null; ror: number | null }[]>([])

  useEffect(() => {
    if (!recipe.source_curve_id) return
    let alive = true
    fetch(`/api/roast/recipes?curve=${recipe.source_curve_id}`).then((r) => r.json()).then((j) => { if (alive && j.ok) setPoints(j.points) }).catch(() => {})
    return () => { alive = false }
  }, [recipe.source_curve_id])

  const rows: Row[] = [
    ...(recipe.steps ?? []).map((s) => ({ kind: 'step' as const, ...s })),
    ...(t.yellow_s != null ? [{ kind: 'mark' as const, t: t.yellow_s, label: '150°C（黄色）', temp: 150 }] : []),
    ...(t.fc_s != null ? [{ kind: 'mark' as const, t: t.fc_s, label: '1ハゼ', temp: t.fc_c ?? null }] : []),
    ...(t.drop_s != null ? [{ kind: 'mark' as const, t: t.drop_s, label: 'ドロップ', temp: t.drop_c ?? null }] : []),
  ].sort((a, b) => a.t - b.t || (a.kind === 'mark' ? 1 : -1))

  const st = STATUS_LABEL[recipe.status]
  const roasted = roastedKgRange(greenKg, t)

  return (
    <div className="rounded-2xl p-4 space-y-4" style={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }}>
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-white leading-snug">{beanName}</p>
          <p className="text-sm text-stone-300">{recipe.batch_kg}kg · {ROAST_LEVEL_LABELS[recipe.roast_level]}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-md ${st.cls}`}>{st.label}</span>
      </div>

      {!exact && (
        <p className="text-xs text-amber-200 bg-amber-900/30 rounded-lg px-3 py-2 flex gap-1.5">
          <Info size={14} className="shrink-0 mt-0.5" />
          選んだバッチ/レベルのレシピがまだ無いので、一番近い {recipe.batch_kg}kg・{ROAST_LEVEL_LABELS[recipe.roast_level]} を表示しています。
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Big label="投入（豆温度）" value={recipe.charge_temp_c != null ? `${Math.round(recipe.charge_temp_c)}°C` : '—'} sub={recipe.drum_pct != null ? `ドラム ${recipe.drum_pct}` : undefined} />
        <Big label="1ハゼ" value={fmtSec(t.fc_s)} sub={t.fc_c != null ? `${t.fc_c}°C` : undefined} />
        <Big label="ドロップ" value={t.drop_c != null ? `${t.drop_c}°C` : '—'} sub={`${fmtSec(t.drop_s)} · 発達 ${fmtSec(t.dev_s)}${t.dtr_pct != null ? `（${t.dtr_pct}%）` : ''}`} />
        <Big label="重量減" value={t.wl_lo != null ? `${t.wl_lo}〜${t.wl_hi}%` : '—'} sub={roasted ? `焙煎後 ${roasted.lo.toFixed(2)}〜${roasted.hi.toFixed(2)}kg` : undefined} />
        <Big label="ボトム" value={fmtSec(t.tp_s)} sub={t.tp_c != null ? `${t.tp_c}°C` : undefined} />
        <Big label="150°C" value={fmtSec(t.yellow_s)} />
      </div>

      {recipe.watch && (
        <p className="text-[15px] leading-relaxed text-amber-100 bg-amber-500/10 border border-amber-600/40 rounded-xl px-3 py-2.5 flex gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-1 text-amber-400" />{recipe.watch}
        </p>
      )}

      <div className="rounded-xl overflow-hidden border border-stone-800">
        <div className="grid grid-cols-[3.5rem_4rem_1fr_1fr] gap-2 px-3 py-2 text-[11px] text-stone-400 bg-stone-900">
          <span>時間</span><span>豆温度</span><span className="flex items-center gap-1"><Flame size={11} />ガス</span><span className="flex items-center gap-1"><Wind size={11} />ファン</span>
        </div>
        {rows.map((r, i) => r.kind === 'mark' ? (
          <div key={`m${i}`} className="grid grid-cols-[3.5rem_4rem_1fr] gap-2 px-3 py-1.5 bg-amber-950/40 border-t border-stone-800 text-sm">
            <span className="tabular-nums text-amber-300 font-semibold">{fmtSec(r.t)}</span>
            <span className="tabular-nums text-amber-300">{r.temp != null ? `${r.temp}°C` : ''}</span>
            <span className="text-amber-200 font-semibold">{r.label}</span>
          </div>
        ) : (
          <div key={`s${i}`} className="grid grid-cols-[3.5rem_4rem_1fr_1fr] gap-2 px-3 py-2 border-t border-stone-800 text-base items-baseline">
            <span className="tabular-nums text-white font-semibold">{r.t === 0 ? '投入' : fmtSec(r.t)}</span>
            <span className="tabular-nums text-stone-300 text-sm">{r.bt != null ? `${r.bt}°C` : ''}</span>
            <span className="tabular-nums text-orange-300 font-bold">{r.gas != null ? `${r.gas}%` : <span className="text-stone-600 font-normal">—</span>}</span>
            <span className="tabular-nums text-sky-300 font-bold">
              {r.fan != null ? r.fan : <span className="text-stone-600 font-normal">—</span>}
              {r.note && <span className="block text-[11px] font-normal text-stone-400">{r.note}</span>}
            </span>
          </div>
        ))}
      </div>

      {points.length > 0 && (
        <CurveChart
          points={points}
          marks={[
            { t: t.yellow_s, label: '150°', color: '#eab308' },
            { t: t.fc_s, label: '1ハゼ', color: '#f97316' },
            { t: t.drop_s, label: 'DROP', color: '#f43f5e' },
          ]}
        />
      )}

      {recipe.why && <p className="text-[11px] text-stone-500 leading-relaxed">{recipe.why}</p>}
    </div>
  )
}
