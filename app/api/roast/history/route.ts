import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { weightLoss } from '@/lib/roast/data'

export const runtime = 'nodejs'

// 最近の焙煎一覧（バッジ用の軽い情報だけ）。GET ?bean=&limit=
export async function GET(request: NextRequest) {
  const denied = await requireAuth(); if (denied) return denied
  const bean = request.nextUrl.searchParams.get('bean')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 40) || 40, 100)

  const sb = createAdminClient()
  let q = sb
    .from('roast_logs')
    .select('id, roasted_at, bean_id, bean_raw, green_kg, roasted_kg, machine, roast_level, use_case, notes, events, roast_beans(display_name)')
    .order('roasted_at', { ascending: false })
    .limit(limit)
  if (bean) q = q.eq('bean_id', bean)
  const { data: logs, error } = await q
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  type L = { id: string; roasted_at: string; bean_id: string; bean_raw: string | null; green_kg: number; roasted_kg: number | null; machine: string | null; roast_level: string | null; use_case: string | null; notes: string | null; events: unknown; roast_beans: { display_name: string } | null }
  const rows = (logs as unknown as L[]) ?? []
  const ids = rows.map((r) => r.id)
  const [{ data: curves }, { data: reviews }, { data: cups }] = await Promise.all([
    ids.length ? sb.from('roast_curves').select('roast_log_id, fc_start_s, total_time_s, dtr_pct').in('roast_log_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? sb.from('roast_reviews').select('roast_log_id, review').in('roast_log_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? sb.from('roast_cuppings').select('roast_log_id, overall, cupped_at').in('roast_log_id', ids).order('cupped_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  const curveBy = new Map(((curves as { roast_log_id: string; fc_start_s: number | null; total_time_s: number | null; dtr_pct: number | null }[]) ?? []).map((c) => [c.roast_log_id, c]))
  const revBy = new Map(((reviews as { roast_log_id: string; review: { headline?: string; verdict?: string } }[]) ?? []).map((r) => [r.roast_log_id, r.review]))
  const cupBy = new Map<string, number | null>()
  for (const c of (cups as { roast_log_id: string; overall: number | null }[]) ?? []) if (!cupBy.has(c.roast_log_id)) cupBy.set(c.roast_log_id, c.overall)

  const items = rows.map((r) => {
    const c = curveBy.get(r.id)
    const rev = revBy.get(r.id)
    return {
      id: r.id,
      roasted_at: r.roasted_at,
      bean_id: r.bean_id,
      bean_name: r.roast_beans?.display_name ?? r.bean_raw ?? r.bean_id,
      green_kg: Number(r.green_kg),
      roasted_kg: r.roasted_kg,
      roast_level: r.roast_level,
      use_case: r.use_case,
      notes: r.notes,
      weight_loss_pct: weightLoss(r.green_kg, r.roasted_kg),
      has_curve: !!c,
      total_s: c?.total_time_s ?? null,
      dtr_pct: c?.dtr_pct != null ? Number(c.dtr_pct) : null,
      headline: rev?.headline ?? null,
      verdict: rev?.verdict ?? null,
      cup: cupBy.get(r.id) ?? null,
    }
  })

  const jst = new Date(Date.now() + 9 * 3600 * 1000)
  const monthStart = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 3600 * 1000)
  const { data: month } = await sb.from('roast_logs').select('green_kg').gte('roasted_at', monthStart.toISOString())
  const m = (month as { green_kg: number }[]) ?? []

  // Probat からのカーブ取り込みが止まっていないか（最新カーブの日時）
  const [{ data: lastCurve }, { data: sync }] = await Promise.all([
    sb.from('roast_curves').select('roasted_at').order('roasted_at', { ascending: false }).limit(1).maybeSingle(),
    // Mac mini の sync-probat.js が毎回書く稼働状況
    sb.from('probat_sync_status').select('checked_at, status, message, last_ok_at').eq('id', 'p05').maybeSingle(),
  ])

  return Response.json({
    ok: true,
    items,
    month: { batches: m.length, kg: m.reduce((a, x) => a + Number(x.green_kg || 0), 0) },
    last_curve_at: (lastCurve as { roasted_at?: string } | null)?.roasted_at ?? null,
    sync: sync ?? null,
  })
}
