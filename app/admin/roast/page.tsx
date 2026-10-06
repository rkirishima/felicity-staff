'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { useIsStaff } from '@/lib/use-is-staff'
import { toast } from 'sonner'
import { Flame, ListChecks, AlertTriangle, Sparkles } from 'lucide-react'
import { ROAST_LEVEL_LABELS, type RoastLevel } from '@/lib/roast-profiles'
import { AiBrief } from '@/components/roast/AiBrief'
import { RoastDetail } from '@/components/roast/RoastDetail'
import { RecipeCard } from '@/components/roast/RecipeCard'
import { RecipeManager } from '@/components/roast/RecipeManager'
import { fmtSec } from '@/lib/roast/profile'
import { BATCHES, LEVELS, pickRecipe, roastedKgRange, type Recipe } from '@/lib/roast/recipe'

// 焙煎機は Probat P05III のみを扱う（Roest のサンプル焙煎は別管理）
const MACHINE = 'Probat P05III'

type Bean = { id: string; display_name: string; origin_country: string | null }
type Item = {
  id: string
  roasted_at: string
  bean_id: string
  bean_name: string
  green_kg: number
  roasted_kg: number | null
  roast_level: string | null
  use_case: string | null
  notes: string | null
  weight_loss_pct: number | null
  has_curve: boolean
  total_s: number | null
  dtr_pct: number | null
  headline: string | null
  verdict: 'good' | 'ok' | 'fix' | null
  cup: number | null
}

function nowJSTLocal(): string {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16)
}
function localToIso(local: string): string {
  return new Date(local + ':00+09:00').toISOString()
}
function fmtJST(iso: string): string {
  const m = new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString()
  return `${m.slice(5, 10).replace('-', '/')} ${m.slice(11, 16)}`
}
function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400e3)
  return d <= 0 ? '今日' : d === 1 ? '昨日' : `${d}日前`
}

type SyncStatus = { checked_at: string; status: 'ok' | 'unreachable' | 'failed'; message: string | null; last_ok_at: string | null }

// Mac mini の Probat 取り込みが止まっていたら、その理由を一文で返す（問題なければ null）
function syncProblem(sync: SyncStatus | null, items: Item[]): string | null {
  if (!sync) return null
  const ago = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 60e3)
  const m = ago(sync.checked_at)
  if (m > 60) return `Mac mini の Probat 取り込みが ${m >= 120 ? `${Math.floor(m / 60)}時間` : `${m}分`}動いていません（電源・スリープ・ネットを確認）`
  if (sync.status === 'failed') return `Probat 取り込みでエラー: ${sync.message ?? '不明'}`
  // 電源オフの日は見えなくて当然。今日焼いたのにカーブが無い時だけ知らせる
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  const waiting = items.some((i) => !i.has_curve && new Date(new Date(i.roasted_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10) === today && ago(i.roasted_at) > 40)
  if (sync.status === 'unreachable' && waiting) return 'Mac mini から Probat が見えません。今日のカーブが取り込めていません（Mac mini の有線LANを確認）'
  return null
}

const VERDICT_DOT: Record<string, string> = { good: 'bg-emerald-400', ok: 'bg-amber-400', fix: 'bg-rose-500' }

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${on ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-300 border border-stone-700'}`}>
      {children}
    </button>
  )
}

export default function RoastPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const isStaff = useIsStaff()
  const hasAccess = isAdmin || isStaff

  const [tab, setTab] = useState<'roast' | 'log' | 'recipes'>('roast')
  const [beans, setBeans] = useState<Bean[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [month, setMonth] = useState({ batches: 0, kg: 0 })
  const [lastCurveAt, setLastCurveAt] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // 焼く前の選択
  const [beanId, setBeanId] = useState('')
  const [level, setLevel] = useState<RoastLevel>('city')
  const [greenKg, setGreenKg] = useState('2')
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)

  // 焼いた後の記録
  const [roastedKg, setRoastedKg] = useState('')
  const [notes, setNotes] = useState('')
  const [datetime, setDatetime] = useState(nowJSTLocal())
  const [saving, setSaving] = useState(false)

  // 記録タブ
  const [filterBean, setFilterBean] = useState<string>('')
  const [onlyUncupped, setOnlyUncupped] = useState(false)
  const [cupCutoff] = useState(() => Date.now() - 21 * 86400e3) // 3週間以内の焙煎だけ「カップ未」にする
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: beansData }, res] = await Promise.all([
      supabase.from('roast_beans').select('id, display_name, origin_country').eq('active', true).order('display_name'),
      fetch('/api/roast/history?limit=60').then((r) => r.json()).catch(() => null),
    ])
    setBeans((beansData as Bean[]) ?? [])
    if (res?.ok) {
      setItems(res.items)
      setMonth(res.month)
      setLastCurveAt(res.last_curve_at)
      setSync(res.sync)
    }
    setLoading(false)
  }, [supabase])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (hasAccess) load() }, [hasAccess, load])

  // 豆を選んだらその豆のレシピを読む
  useEffect(() => {
    if (!beanId) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecipes(null)
    fetch(`/api/roast/recipes?bean=${encodeURIComponent(beanId)}`).then((r) => r.json())
      .then((j) => { if (alive) setRecipes(j.ok ? j.recipes : []) })
      .catch(() => { if (alive) setRecipes([]) })
    return () => { alive = false }
  }, [beanId])

  // 豆ごとの最終焙煎日（よく焼く豆を上に）
  const beanStats = useMemo(() => {
    const m = new Map<string, { last: string; n: number }>()
    for (const it of items) {
      const s = m.get(it.bean_id)
      if (!s) m.set(it.bean_id, { last: it.roasted_at, n: 1 })
      else s.n++
    }
    return m
  }, [items])
  const sortedBeans = useMemo(() => [...beans].sort((a, b) =>
    (beanStats.get(b.id)?.n ?? 0) - (beanStats.get(a.id)?.n ?? 0) || a.display_name.localeCompare(b.display_name)), [beans, beanStats])

  const kg = Number(greenKg) || 0
  const bean = beans.find((b) => b.id === beanId)
  const picked = recipes ? pickRecipe(recipes, kg || 1, level) : null
  const recipe = picked?.recipe ?? null

  // Probat カーブの取り込みが止まっていないか
  const curveLagDays = useMemo(() => {
    if (!lastCurveAt || !items.length) return 0
    const newestLog = items[0]?.roasted_at
    if (!newestLog) return 0
    return Math.floor((new Date(newestLog).getTime() - new Date(lastCurveAt).getTime()) / 86400e3)
  }, [lastCurveAt, items])
  const syncIssue = useMemo(() => syncProblem(sync, items), [sync, items])

  const wl = roastedKg && kg ? (1 - Number(roastedKg) / kg) * 100 : null
  const wlT = recipe?.targets
  const wlOk = wl != null && wlT?.wl_lo != null && wlT?.wl_hi != null ? wl >= wlT.wl_lo - 0.3 && wl <= wlT.wl_hi + 0.3 : null
  const expected = recipe ? roastedKgRange(kg, recipe.targets) : null

  async function save() {
    if (!beanId) return toast.error('豆を選んでください')
    if (!kg) return toast.error('生豆の量を入れてください')
    setSaving(true)
    const { data, error } = await supabase.from('roast_logs').insert({
      roasted_at: localToIso(datetime),
      bean_id: beanId,
      bean_raw: bean?.display_name ?? null,
      green_kg: kg,
      roasted_kg: roastedKg ? Number(roastedKg) : null,
      machine: MACHINE,
      roast_level: level,
      profile_id: picked?.exact ? recipe?.id ?? null : null,
      notes: notes.trim() || null,
      source: 'ipad_manual',
    }).select('id').single()
    setSaving(false)
    if (error || !data) return toast.error(`記録失敗: ${error?.message}`)
    toast.success(`${bean?.display_name} ${kg}kg を記録しました。Probat のカーブは自動で紐づきます`)
    setRoastedKg('')
    setNotes('')
    setDatetime(nowJSTLocal())
    await load()
    setTab('log')
    setOpenId((data as { id: string }).id) // 詳細を開くと AI レビューが自動で走る
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者またはスタッフでログインしてください</div>
      </main>
    )
  }

  // カップ評価はその日にはできないので、後から付けるものとして一覧で目立たせる
  const uncupped = (i: Item) => i.cup == null && new Date(i.roasted_at).getTime() > cupCutoff
  const uncuppedCount = items.filter(uncupped).length
  const shown = items.filter((i) => (!filterBean || i.bean_id === filterBean) && (!onlyUncupped || uncupped(i)))

  return (
    <main className="min-h-screen pb-24 dark-forms" style={{ backgroundColor: '#1c1917', colorScheme: 'dark' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Flame size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">焙煎</h1>
          <span className="text-xs text-stone-500 ml-1">Probat P05III</span>
          <span className="ml-auto text-xs text-stone-400">今月 {month.batches}バッチ / {month.kg.toFixed(1)}kg</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([['roast', '焼く'], ['log', '記録と振り返り'], ['recipes', 'レシピ']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`py-2 rounded-lg text-sm font-semibold ${tab === k ? 'bg-stone-100 text-stone-900' : 'bg-stone-800 text-stone-400'}`}>{label}</button>
          ))}
        </div>
        {syncIssue && (
          <p className="mt-2 text-[11px] text-rose-300 flex gap-1.5">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />{syncIssue}
          </p>
        )}
        {!syncIssue && curveLagDays >= 3 && (
          <p className="mt-2 text-[11px] text-amber-300 flex gap-1.5">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            Probat のカーブ取り込みが {curveLagDays} 日止まっています（最終 {lastCurveAt?.slice(0, 10)}）。
          </p>
        )}
      </div>

      {tab === 'roast' && (
        <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">
          {/* 1. 豆 */}
          <section>
            <p className="text-xs text-stone-400 mb-2">1. 豆</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sortedBeans.map((b) => {
                const st = beanStats.get(b.id)
                const on = b.id === beanId
                return (
                  <button key={b.id} type="button" onClick={() => setBeanId(on ? '' : b.id)}
                    className={`text-left rounded-xl px-3 py-2.5 border transition-colors ${on ? 'bg-amber-600/90 border-amber-400 text-white' : 'bg-stone-900 border-stone-700 text-stone-200'}`}>
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{b.display_name}</p>
                    <p className={`text-[10px] mt-0.5 ${on ? 'text-amber-100' : 'text-stone-500'}`}>{st ? `前回 ${daysAgo(st.last)}` : '記録なし'}</p>
                  </button>
                )
              })}
            </div>
          </section>

          {beanId && (
            <>
              {/* 2. 量・レベル */}
              <section className="space-y-3">
                <div>
                  <p className="text-xs text-stone-400 mb-2">2. 生豆の量</p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {BATCHES.map((k) => <Chip key={k} on={kg === k} onClick={() => setGreenKg(String(k))}>{k}kg</Chip>)}
                    <input type="number" step="0.1" inputMode="decimal" value={greenKg} onChange={(e) => setGreenKg(e.target.value)}
                      className="w-20 bg-stone-900 text-white rounded-xl px-3 py-2.5 text-sm border border-stone-700" aria-label="生豆の量 kg" />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-stone-400 mb-2">3. ローストレベル</p>
                  <div className="flex flex-wrap gap-2">{LEVELS.map((lv) => <Chip key={lv} on={level === lv} onClick={() => setLevel(lv)}>{ROAST_LEVEL_LABELS[lv]}</Chip>)}</div>
                </div>
              </section>

              {/* 4. レシピ */}
              <section className="space-y-3">
                <p className="text-xs text-stone-400">4. レシピ</p>
                {recipes == null ? (
                  <p className="text-sm text-stone-500">読み込み中…</p>
                ) : recipe ? (
                  <RecipeCard recipe={recipe} beanName={bean?.display_name ?? ''} greenKg={kg} exact={!!picked?.exact} />
                ) : (
                  <div className="rounded-xl p-4 text-sm text-stone-300 space-y-2" style={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }}>
                    <p>この豆のレシピはまだありません。</p>
                    <button onClick={() => setTab('recipes')} className="text-violet-300 flex items-center gap-1 text-sm">
                      <Sparkles size={14} />「レシピ」タブで、過去の焙煎から作るか AI に試作させる
                    </button>
                  </div>
                )}
                <AiBrief beanId={beanId} greenKg={kg} level={level} />
              </section>

              {/* 5. 焼いたら記録 */}
              <section className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }}>
                <p className="text-sm font-bold text-white">5. 焼いたら記録</p>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">焙煎後の重さ kg（冷めてから・後で入力も可）</label>
                  <input type="number" step="0.01" inputMode="decimal" value={roastedKg} onChange={(e) => setRoastedKg(e.target.value)}
                    placeholder={expected ? `目安 ${expected.lo.toFixed(2)}〜${expected.hi.toFixed(2)}` : '例 1.72'}
                    className="w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-lg border border-stone-700" />
                  {wl != null && (
                    <p className={`text-sm mt-1 tabular-nums ${wlOk == null ? 'text-stone-300' : wlOk ? 'text-emerald-300' : 'text-rose-300'}`}>
                      重量減 {wl.toFixed(1)}%{wlT?.wl_lo != null ? `（目標 ${wlT.wl_lo}〜${wlT.wl_hi}%）` : ''}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">焙煎日時</label>
                  <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)}
                    className="w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-sm border border-stone-700" style={{ colorScheme: 'dark' }} />
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="気づいたこと（例: 1ハゼが弱い、煙が多い）"
                  className="w-full bg-stone-900 text-white rounded-lg px-3 py-2 text-sm border border-stone-700 resize-none" />
                <button onClick={save} disabled={saving} className="w-full py-3.5 rounded-xl bg-amber-600 disabled:bg-stone-700 text-white font-bold">
                  {saving ? '記録中…' : `${kg || '—'}kg を記録してAIレビュー`}
                </button>
                <p className="text-[11px] text-stone-500">Probat パネルで「投入」と「ドロップ」を必ず押してください。押し忘れるとカーブが学習に使えません。</p>
              </section>
            </>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="px-4 pt-4 max-w-2xl mx-auto">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            <Chip on={onlyUncupped} onClick={() => setOnlyUncupped(!onlyUncupped)}>
              <span className="whitespace-nowrap">☕ カップ未評価 {uncuppedCount}</span>
            </Chip>
            <Chip on={!filterBean} onClick={() => setFilterBean('')}>すべて</Chip>
            {sortedBeans.filter((b) => beanStats.has(b.id)).map((b) => (
              <Chip key={b.id} on={filterBean === b.id} onClick={() => setFilterBean(b.id)}>
                <span className="whitespace-nowrap">{b.display_name}</span>
              </Chip>
            ))}
          </div>

          {loading ? <p className="text-stone-500 text-sm pt-4">読み込み中…</p> : shown.length === 0 ? <p className="text-stone-500 text-sm pt-4">まだ記録がありません</p> : (
            <div className="space-y-2 pt-2">
              {shown.map((l) => (
                <button key={l.id} onClick={() => setOpenId(l.id)} className="w-full text-left rounded-xl p-3 flex gap-3 items-start" style={{ backgroundColor: '#292524', border: '1px solid #3f3f3f' }}>
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${l.verdict ? VERDICT_DOT[l.verdict] : 'bg-stone-600'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm text-white truncate flex-1">{l.bean_name}</p>
                      {l.cup != null
                        ? <span className="text-xs text-amber-300 tabular-nums">☕{l.cup}</span>
                        : uncupped(l) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-700 text-stone-200 whitespace-nowrap">カップ未</span>}
                    </div>
                    <p className="text-[11px] text-stone-400 tabular-nums">
                      {fmtJST(l.roasted_at)} · {l.green_kg}kg
                      {l.total_s ? ` · ${fmtSec(l.total_s)}` : ''}
                      {l.dtr_pct != null ? ` · DTR ${l.dtr_pct}%` : ''}
                      {l.weight_loss_pct != null ? ` · 減 ${l.weight_loss_pct}%` : ' · 重量未入力'}
                      {!l.has_curve ? ' · カーブなし' : ''}
                    </p>
                    {l.headline
                      ? <p className="text-[12px] text-violet-200/90 mt-0.5 flex gap-1"><Sparkles size={11} className="mt-0.5 shrink-0" />{l.headline}</p>
                      : <p className="text-[11px] text-stone-500 mt-0.5">タップでAIレビュー</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-stone-600 pt-4 flex items-center gap-1"><ListChecks size={11} />カップ評価を入れると、AIが味とカーブを結びつけて次回のポイントに反映します。</p>
        </div>
      )}

      {tab === 'recipes' && (
        <div className="px-4 pt-4 max-w-2xl mx-auto">
          <RecipeManager beans={sortedBeans} />
        </div>
      )}

      {openId && <RoastDetail logId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </main>
  )
}
