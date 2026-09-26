import { requireAuth } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRoastContext } from '@/lib/roast/data'
import { reviewRoast } from '@/lib/roast/ai'

export const runtime = 'nodejs'
export const maxDuration = 60

// 焙煎1件の AI レビューを作る（または作り直す）。
// body: { logId: string, force?: boolean }
export async function POST(request: Request) {
  const denied = await requireAuth(); if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as { logId?: string; force?: boolean }
  if (!body.logId) return Response.json({ ok: false, error: 'logId required' }, { status: 400 })

  const sb = createAdminClient()
  if (!body.force) {
    const { data: existing } = await sb.from('roast_reviews').select('review, flags, model, updated_at').eq('roast_log_id', body.logId).maybeSingle()
    if (existing) return Response.json({ ok: true, cached: true, ...existing })
  }

  const ctx = await loadRoastContext(sb, body.logId)
  if (!ctx) return Response.json({ ok: false, error: 'log not found' }, { status: 404 })

  const res = await reviewRoast(ctx)
  if (!res) return Response.json({ ok: false, error: 'AI レビューを生成できませんでした（APIキー/モデルを確認）' }, { status: 502 })

  const row = {
    roast_log_id: body.logId,
    curve_id: ctx.curve?.id ?? null,
    model: res.model,
    flags: ctx.digest?.flags ?? [],
    review: res.review,
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb.from('roast_reviews').upsert(row, { onConflict: 'roast_log_id' })
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  return Response.json({ ok: true, cached: false, review: res.review, flags: row.flags, model: res.model, updated_at: row.updated_at })
}
