'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw, CheckCircle2, Archive, Pencil } from 'lucide-react'
import { useIsAdmin } from '@/lib/admin-context'
import { ROAST_LEVEL_LABELS, type RoastLevel } from '@/lib/roast-profiles'
import { fmtSec } from '@/lib/roast/profile'
import { BATCHES, LEVELS, STATUS_LABEL, pickRecipe, type Recipe } from '@/lib/roast/recipe'
import { RecipeCard } from './RecipeCard'
import { RecipeEditor } from './RecipeEditor'

type Bean = { id: string; display_name: string; origin_country: string | null }
type Cand = {
  curve_id: string; roasted_at: string; batch_kg: number; roast_level: RoastLevel; level_inferred: boolean
  probat_name: string | null; weight_loss_pct: number | null; cup: number | null; score: number; reasons: string[]
  fc_s: number | null; fc_c: number | null; drop_s: number | null; drop_c: number | null; dev_s: number | null; dtr_pct: number | null
}

const jstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10)

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-2 rounded-xl text-sm font-medium ${on ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-300 border border-stone-700'}`}>
      {children}
    </button>
  )
}

/** 豆ごとのレシピを、実際のベスト焙煎から選んで確定する画面 */
export function RecipeManager({ beans }: { beans: Bean[] }) {
  const isAdmin = useIsAdmin()
  const [all, setAll] = useState<Recipe[]>([])
  const [beanId, setBeanId] = useState('')
  const [kg, setKg] = useState(2)
  const [level, setLevel] = useState<RoastLevel>('city')
  const [cands, setCands] = useState<Cand[] | null>(null)
  const [meta, setMeta] = useState<{ total: number; rejected: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // 編集中の 豆|kg|レベル（切り替えたら編集は閉じる）
  const [editKey, setEditKey] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const j = await fetch('/api/roast/recipes').then((r) => r.json()).catch(() => null)
    if (j?.ok) setAll(j.recipes)
  }, [])
   
  useEffect(() => { loadAll() }, [loadAll])

  const byBean = useMemo(() => {
    const m = new Map<string, Recipe[]>()
    for (const r of all) m.set(r.bean_id, [...(m.get(r.bean_id) ?? []), r])
    return m
  }, [all])

  const current = (byBean.get(beanId) ?? []).filter((r) => Number(r.batch_kg) === kg && r.roast_level === level)
    .sort((a, b) => (a.status === 'confirmed' ? -1 : b.status === 'confirmed' ? 1 : 0))[0] ?? null

  useEffect(() => {
    if (!beanId) return
    let alive = true
     
    setCands(null)
     
    fetch('/api/roast/recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'candidates', bean: beanId, kg, level }) })
      .then((r) => r.json())
      .then((j) => { if (alive && j.ok) { setCands(j.candidates); setMeta({ total: j.total, rejected: j.rejected }) } })
      .catch(() => {})
    return () => { alive = false }
  }, [beanId, kg, level])

  async function act(body: Record<string, unknown>, label: string): Promise<boolean> {
    setBusy(label)
    try {
      const j = await fetch('/api/roast/recipes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
      if (!j.ok) throw new Error(j.error)
      if (body.action === 'rebuild') toast.success(`提案を ${j.created} 件作りました（記録不完全で除外 ${j.rejected_recordings} 本）`)
      else toast.success('保存しました')
      await loadAll()
      return true
    } catch (e) {
      toast.error(`${label}失敗: ${e instanceof Error ? e.message : e}`)
      return false
    } finally {
      setBusy(null)
    }
  }

  const bean = beans.find((b) => b.id === beanId)
  const key = `${beanId}|${kg}|${level}`
  const editing = editKey === key
  // レシピが無い組み合わせは、この豆の一番近いレシピを下書きにして手で作る
  const nearest = !current ? pickRecipe(byBean.get(beanId) ?? [], kg, level)?.recipe ?? null : null
  async function saveEdit(recipe: Record<string, unknown>) {
    const ok = await act(current ? { action: 'save', id: current.id, recipe } : { action: 'save', bean: beanId, kg, level, recipe }, '保存')
    if (ok) setEditKey(null)
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <button onClick={() => act({ action: 'rebuild' }, '作り直し')} disabled={!!busy}
          className="w-full rounded-xl py-3 bg-stone-800 text-stone-200 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          <RefreshCw size={15} className={busy === '作り直し' ? 'animate-spin' : ''} />
          全部の豆で、ベスト焙煎から提案を作り直す（確定済みはそのまま）
        </button>
      )}

      {/* 豆ごとの状況 */}
      <div className="space-y-1.5">
        {beans.map((b) => {
          const rs = byBean.get(b.id) ?? []
          const on = b.id === beanId
          return (
            <button key={b.id} onClick={() => setBeanId(on ? '' : b.id)}
              className={`w-full text-left rounded-xl px-3 py-2.5 border ${on ? 'border-amber-500 bg-stone-900' : 'border-stone-800 bg-stone-900/60'}`}>
              <p className="text-sm font-semibold text-white">{b.display_name}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {rs.length === 0 && <span className="text-[11px] text-stone-500">レシピなし</span>}
                {rs.map((r) => (
                  <span key={r.id} className={`text-[11px] px-1.5 py-0.5 rounded ${STATUS_LABEL[r.status].cls}`}>
                    {r.batch_kg}kg {ROAST_LEVEL_LABELS[r.roast_level].split(' ')[0]}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {bean && (
        <div className="space-y-3 rounded-2xl p-3" style={{ backgroundColor: '#0c0a09', border: '1px solid #44403c' }}>
          <p className="text-sm font-bold text-white">{bean.display_name}</p>
          <div className="flex flex-wrap gap-2">{BATCHES.map((k) => <Chip key={k} on={kg === k} onClick={() => setKg(k)}>{k}kg</Chip>)}</div>
          <div className="flex flex-wrap gap-2">{LEVELS.map((lv) => <Chip key={lv} on={level === lv} onClick={() => setLevel(lv)}>{ROAST_LEVEL_LABELS[lv]}</Chip>)}</div>

          {editing ? (
            <RecipeEditor base={current ?? nearest} saving={busy === '保存'} onSave={saveEdit} onCancel={() => setEditKey(null)} />
          ) : current ? (
            <>
              <RecipeCard recipe={current} beanName={bean.display_name} greenKg={kg} exact />
              {isAdmin && (
                <button onClick={() => setEditKey(key)} disabled={!!busy}
                  className="w-full rounded-xl py-3 bg-stone-700 text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  <Pencil size={15} />このレシピを編集する
                </button>
              )}
              {isAdmin && current.status !== 'confirmed' && (
                <button onClick={() => act({ action: 'confirm', id: current.id }, '確定')} disabled={!!busy}
                  className="w-full rounded-xl py-3 bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                  <CheckCircle2 size={16} />このレシピで確定する
                </button>
              )}
              {isAdmin && (
                <button onClick={() => act({ action: 'archive', id: current.id }, '片付け')} disabled={!!busy}
                  className="w-full text-xs text-stone-500 py-1 flex items-center justify-center gap-1"><Archive size={12} />このレシピを過去にする</button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-stone-400">この {kg}kg・{ROAST_LEVEL_LABELS[level]} のレシピはまだありません。</p>
              {isAdmin && (
                <button onClick={() => setEditKey(key)} disabled={!!busy}
                  className="w-full rounded-xl py-3 bg-stone-700 text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  <Pencil size={15} />{nearest ? `${nearest.batch_kg}kg・${ROAST_LEVEL_LABELS[nearest.roast_level].split(' ')[0]} のレシピをもとに手で作る` : '手で作る'}
                </button>
              )}
            </>
          )}

          {isAdmin && (
            <button onClick={() => act({ action: 'ai_draft', bean: beanId, kg, level }, 'AI設計')} disabled={!!busy}
              className="w-full rounded-xl py-3 bg-violet-800 text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              <Sparkles size={15} className={busy === 'AI設計' ? 'animate-pulse' : ''} />
              {busy === 'AI設計' ? 'AIが過去の焙煎と研究から設計中…' : `AIで ${kg}kg・${ROAST_LEVEL_LABELS[level].split(' ')[0]} の試作レシピを作る`}
            </button>
          )}

          <div className="space-y-1.5">
            <p className="text-xs text-stone-400">
              過去の焙煎（良い順）{meta ? ` · この豆で使える記録 ${meta.total} 本 / 記録不完全 ${meta.rejected} 本` : ''}
            </p>
            {cands == null && <p className="text-xs text-stone-500">読み込み中…</p>}
            {cands?.length === 0 && <p className="text-xs text-stone-500">この組み合わせの使える記録はありません。AI試作から始めてください。</p>}
            {cands?.map((c) => (
              <div key={c.curve_id} className="rounded-xl p-3 bg-stone-900 border border-stone-800">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-white tabular-nums">{Math.min(100, c.score)}点</span>
                  <span className="text-xs text-stone-300">{jstDate(c.roasted_at)}</span>
                  <span className="text-xs text-stone-400 truncate flex-1">{c.probat_name ?? ''}</span>
                </div>
                <p className="text-xs text-stone-300 tabular-nums mt-0.5">
                  1ハゼ {fmtSec(c.fc_s)}/{c.fc_c}°C · ドロップ {fmtSec(c.drop_s)}/{c.drop_c}°C · 発達 {fmtSec(c.dev_s)}（{c.dtr_pct}%）
                  {c.weight_loss_pct != null ? ` · 減 ${c.weight_loss_pct}%` : ''}{c.cup != null ? ` · ☕${c.cup}` : ''}
                </p>
                <p className="text-[11px] text-stone-500">{c.reasons.join('・')}{c.level_inferred ? '・レベル推定' : ''}</p>
                {isAdmin && (
                  <button onClick={() => act({ action: 'choose', bean: beanId, curve_id: c.curve_id }, '確定')} disabled={!!busy}
                    className="mt-2 w-full rounded-lg py-2 bg-stone-700 text-white text-sm disabled:opacity-50">この焙煎をレシピにして確定</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
