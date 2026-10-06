import type { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRoastContext } from '@/lib/roast/data'
import { downsample } from '@/lib/roast/curve'

export const runtime = 'nodejs'

// 焙煎1件の詳細（カーブ・要約・目標・カップ・AIレビュー）。GET ?id=
export async function GET(request: NextRequest) {
  const denied = await requireAuth(); if (denied) return denied
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ ok: false, error: 'id required' }, { status: 400 })

  const sb = createAdminClient()
  const [ctx, { data: review }] = await Promise.all([
    loadRoastContext(sb, id),
    sb.from('roast_reviews').select('review, flags, model, updated_at, curve_id').eq('roast_log_id', id).maybeSingle(),
  ])
  if (!ctx) return Response.json({ ok: false, error: 'not found' }, { status: 404 })

  return Response.json({
    ok: true,
    log: ctx.log,
    bean_name: ctx.bean_name,
    weight_loss_pct: ctx.weight_loss_pct,
    digest: ctx.digest,
    points: downsample(ctx.curve?.samples ?? null),
    has_curve: !!ctx.curve && (ctx.curve.samples?.length ?? 0) > 30,
    profile: ctx.profile,
    cuppings: ctx.cuppings,
    review: review ?? null,
    // レビュー作成時にはまだカーブが無かったが、今はある → 作り直しを促す
    review_stale: !!review && !review.curve_id && !!ctx.curve,
  })
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAuth(); if (denied) return denied
  const b = (await request.json().catch(() => ({}))) as { id?: string; roasted_kg?: number | null; notes?: string | null }
  if (!b.id) return Response.json({ ok: false, error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (b.roasted_kg !== undefined) patch.roasted_kg = b.roasted_kg == null ? null : Number(b.roasted_kg)
  if (b.notes !== undefined) patch.notes = b.notes
  const sb = createAdminClient()
  const { error } = await sb.from('roast_logs').update(patch).eq('id', b.id)
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}

// 間違えて記録した焙煎を消す（管理者のみ）。レビュー・カップ評価も消え、Probat カーブは紐付けが外れるだけ。
export async function DELETE(request: NextRequest) {
  const denied = await requireRole(['admin']); if (denied) return denied
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ ok: false, error: 'id required' }, { status: 400 })
  const sb = createAdminClient()
  const { error } = await sb.from('roast_logs').delete().eq('id', id)
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
