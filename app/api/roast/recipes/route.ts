import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, requireRole, getSession } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { candidatesForBean, recipeRowFrom, type Candidate } from '@/lib/roast/best'
import { designRecipe } from '@/lib/roast/designer'
import { downsample } from '@/lib/roast/curve'
import { batchBucket, LEVELS, sanitizeRecipeInput } from '@/lib/roast/recipe'
import type { RoastLevel } from '@/lib/roast-profiles'

export const runtime = 'nodejs'
export const maxDuration = 60

const COLS = 'id, bean_id, batch_kg, roast_level, status, source, source_curve_id, charge_temp_c, drum_pct, steps, targets, watch, why, score, confirmed_by, confirmed_at, updated_at'

// GET ?bean=ID → その豆のレシピ / ?curve=ID → 基準カーブ（グラフ用）/ なし → 全豆の一覧（管理画面）
export async function GET(request: NextRequest) {
  const denied = await requireAuth(); if (denied) return denied
  const sb = createAdminClient()
  const bean = request.nextUrl.searchParams.get('bean')
  const curve = request.nextUrl.searchParams.get('curve')

  if (curve) {
    const { data } = await sb.from('roast_curves').select('samples').eq('id', curve).maybeSingle()
    return Response.json({ ok: true, points: downsample((data as { samples?: [] } | null)?.samples ?? null) })
  }
  if (bean) await fillMissing(sb, bean)
  let q = sb.from('roast_recipes').select(COLS).neq('status', 'archived').order('batch_kg')
  if (bean) q = q.eq('bean_id', bean)
  const { data, error } = await q
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  return Response.json({ ok: true, recipes: data ?? [] })
}

/**
 * 焙煎済みなのにレシピが無い 豆×バッチ×レベル に、ベスト焙煎の「提案」を作る（既にある組には触らない）。
 * 新しい豆を焼いた直後でも、その豆を開けばレシピが出るようにするため。作った数を返す
 */
async function fillMissing(sb: SupabaseClient, bean: string, list?: Candidate[]): Promise<number> {
  const cands = list ?? (await candidatesForBean(sb, bean)).list
  if (!cands.length) return 0
  const { data: have } = await sb.from('roast_recipes').select('batch_kg, roast_level').eq('bean_id', bean).neq('status', 'archived')
  const exists = new Set(((have as { batch_kg: number; roast_level: string }[]) ?? []).map((r) => `${Number(r.batch_kg)}|${r.roast_level}`))
  let n = 0
  for (const c of cands) { // スコア順なので、各組の最初がベスト
    const k = `${c.batch_kg}|${c.roast_level}`
    if (exists.has(k)) continue
    exists.add(k)
    const { error } = await sb.from('roast_recipes').insert(recipeRowFrom(c, 'suggested'))
    if (!error) n++
  }
  return n
}

type Body = { action?: string; bean?: string; kg?: number; level?: string; id?: string; curve_id?: string; recipe?: Record<string, unknown> }

function slim(c: Candidate) {
  return {
    curve_id: c.curve_id, roasted_at: c.roasted_at, batch_kg: c.batch_kg, roast_level: c.roast_level, level_inferred: c.level_inferred,
    probat_name: c.probat_name, weight_loss_pct: c.weight_loss_pct, cup: c.cup, score: c.score, reasons: c.reasons,
    fc_s: c.digest.fc_s, fc_c: c.digest.fc_c, drop_s: c.digest.drop_s, drop_c: c.digest.drop_c, dev_s: c.digest.dev_s, dtr_pct: c.digest.dtr_pct,
  }
}

/** 同じ豆×バッチ×レベルの既存行を片付ける。確定は「過去」に、提案は消す */
async function clearGroup(sb: SupabaseClient, bean: string, kg: number, level: string, statuses: string[]) {
  if (statuses.includes('confirmed')) {
    await sb.from('roast_recipes').update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('bean_id', bean).eq('batch_kg', kg).eq('roast_level', level).eq('status', 'confirmed')
  }
  const del = statuses.filter((s) => s !== 'confirmed')
  if (del.length) await sb.from('roast_recipes').delete().eq('bean_id', bean).eq('batch_kg', kg).eq('roast_level', level).in('status', del)
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as Body
  const sb = createAdminClient()

  // 候補一覧は焙煎担当も見られる。書き込みは管理者だけ
  if (b.action === 'candidates') {
    const denied = await requireAuth(); if (denied) return denied
    if (!b.bean) return Response.json({ ok: false, error: 'bean required' }, { status: 400 })
    const { list, rejected } = await candidatesForBean(sb, b.bean)
    const filled = await fillMissing(sb, b.bean, list)
    const kg = b.kg != null ? batchBucket(Number(b.kg)) : null
    const shown = list.filter((c) => (kg == null || c.batch_kg === kg) && (!b.level || c.roast_level === b.level))
    return Response.json({ ok: true, candidates: shown.slice(0, 8).map(slim), total: list.length, rejected, filled })
  }

  const denied = await requireRole(['admin']); if (denied) return denied
  const session = await getSession()
  const now = new Date().toISOString()

  if (b.action === 'rebuild') {
    // 確定が無い 豆×バッチ×レベル に、ベスト焙煎の「提案」を作り直す
    const beanIds = b.bean
      ? [b.bean]
      : (((await sb.from('roast_beans').select('id').eq('active', true)).data as { id: string }[]) ?? []).map((x) => x.id)
    const { data: existing } = await sb.from('roast_recipes').select('bean_id, batch_kg, roast_level').eq('status', 'confirmed')
    const confirmed = new Set(((existing as { bean_id: string; batch_kg: number; roast_level: string }[]) ?? []).map((r) => `${r.bean_id}|${Number(r.batch_kg)}|${r.roast_level}`))
    let created = 0
    let rejectedTotal = 0
    for (const bean of beanIds) {
      const { list, rejected } = await candidatesForBean(sb, bean)
      rejectedTotal += rejected
      const best = new Map<string, Candidate>()
      for (const c of list) {
        const k = `${bean}|${c.batch_kg}|${c.roast_level}`
        if (!best.has(k)) best.set(k, c) // list はスコア順
      }
      for (const [k, c] of best) {
        if (confirmed.has(k)) continue
        await clearGroup(sb, bean, c.batch_kg, c.roast_level, ['suggested'])
        const { error } = await sb.from('roast_recipes').insert(recipeRowFrom(c, 'suggested'))
        if (!error) created++
      }
    }
    return Response.json({ ok: true, created, rejected_recordings: rejectedTotal })
  }

  if (b.action === 'choose') {
    // 候補の中から、このローストを確定レシピにする
    if (!b.bean || !b.curve_id) return Response.json({ ok: false, error: 'bean/curve_id required' }, { status: 400 })
    const { list } = await candidatesForBean(sb, b.bean)
    const c = list.find((x) => x.curve_id === b.curve_id)
    if (!c) return Response.json({ ok: false, error: 'この焙煎は記録が不完全なため使えません' }, { status: 400 })
    await clearGroup(sb, b.bean, c.batch_kg, c.roast_level, ['confirmed', 'suggested', 'ai_draft'])
    const { data, error } = await sb.from('roast_recipes')
      .insert({ ...recipeRowFrom(c, 'confirmed'), confirmed_by: session?.name ?? null, confirmed_at: now }).select(COLS).single()
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
    return Response.json({ ok: true, recipe: data })
  }

  if (b.action === 'confirm') {
    if (!b.id) return Response.json({ ok: false, error: 'id required' }, { status: 400 })
    const { data: r } = await sb.from('roast_recipes').select('bean_id, batch_kg, roast_level').eq('id', b.id).maybeSingle()
    if (!r) return Response.json({ ok: false, error: 'not found' }, { status: 404 })
    const row = r as { bean_id: string; batch_kg: number; roast_level: string }
    await clearGroup(sb, row.bean_id, Number(row.batch_kg), row.roast_level, ['confirmed'])
    const { data, error } = await sb.from('roast_recipes')
      .update({ status: 'confirmed', confirmed_by: session?.name ?? null, confirmed_at: now, updated_at: now }).eq('id', b.id).select(COLS).single()
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
    // 同じ組の残りの提案/試作は不要
    await sb.from('roast_recipes').delete().eq('bean_id', row.bean_id).eq('batch_kg', row.batch_kg).eq('roast_level', row.roast_level).in('status', ['suggested', 'ai_draft'])
    return Response.json({ ok: true, recipe: data })
  }

  if (b.action === 'ai_draft') {
    if (!b.bean || !b.kg || !b.level || !LEVELS.includes(b.level as RoastLevel)) return Response.json({ ok: false, error: 'bean/kg/level required' }, { status: 400 })
    const kg = batchBucket(Number(b.kg))
    const res = await designRecipe(sb, b.bean, kg, b.level as RoastLevel)
    if (!res) return Response.json({ ok: false, error: 'AI がレシピを作れませんでした（APIキー/モデルを確認）' }, { status: 502 })
    await clearGroup(sb, b.bean, kg, b.level, ['ai_draft'])
    const { data, error } = await sb.from('roast_recipes').insert(res.row).select(COLS).single()
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
    return Response.json({ ok: true, recipe: data })
  }

  if (b.action === 'save') {
    // 手で編集したレシピを保存。id があれば上書き、無ければその 豆×バッチ×レベル の確定レシピとして新規作成
    const clean = sanitizeRecipeInput(b.recipe ?? {})
    if (clean.steps.length === 0) return Response.json({ ok: false, error: '操作の行が1つもありません' }, { status: 400 })
    const stamp = `手動編集 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}${session?.name ? `（${session.name}）` : ''}`
    if (b.id) {
      const { data: cur } = await sb.from('roast_recipes').select('why').eq('id', b.id).maybeSingle()
      if (!cur) return Response.json({ ok: false, error: 'not found' }, { status: 404 })
      const base = ((cur as { why: string | null }).why ?? '').replace(/^手動編集[^。]*。\s*/, '')
      const { data, error } = await sb.from('roast_recipes')
        .update({ ...clean, source: 'manual', why: `${stamp}。${base}`.slice(0, 600), updated_at: now })
        .eq('id', b.id).select(COLS).single()
      if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
      return Response.json({ ok: true, recipe: data })
    }
    if (!b.bean || !b.kg || !b.level || !LEVELS.includes(b.level as RoastLevel)) return Response.json({ ok: false, error: 'bean/kg/level required' }, { status: 400 })
    const kg = batchBucket(Number(b.kg))
    await clearGroup(sb, b.bean, kg, b.level, ['confirmed', 'suggested', 'ai_draft'])
    const { data, error } = await sb.from('roast_recipes').insert({
      bean_id: b.bean, batch_kg: kg, roast_level: b.level, status: 'confirmed', source: 'manual', source_curve_id: null,
      ...clean, why: `${stamp}。`, score: null, confirmed_by: session?.name ?? null, confirmed_at: now, updated_at: now,
    }).select(COLS).single()
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
    return Response.json({ ok: true, recipe: data })
  }

  if (b.action === 'archive') {
    if (!b.id) return Response.json({ ok: false, error: 'id required' }, { status: 400 })
    const { error } = await sb.from('roast_recipes').update({ status: 'archived', updated_at: now }).eq('id', b.id)
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  return Response.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
