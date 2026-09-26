import { requireAuth, getSession } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const DEFECTS = new Set(['生焼け・草', 'ロースティ・焦げ', 'フラット・ベイクド', '酸が尖る', '渋い・えぐい', '重い・濁る'])

function score(v: unknown, max: number): number | null {
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null
}

// カップ評価を保存。body: { logId, overall(1-10), sweetness/acidity/body(1-5), defects[], notes }
export async function POST(request: Request) {
  const denied = await requireAuth(); if (denied) return denied
  const session = await getSession()
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!b.logId) return Response.json({ ok: false, error: 'logId required' }, { status: 400 })

  const row = {
    roast_log_id: String(b.logId),
    overall: score(b.overall, 10),
    sweetness: score(b.sweetness, 5),
    acidity: score(b.acidity, 5),
    body: score(b.body, 5),
    defects: Array.isArray(b.defects) ? (b.defects as unknown[]).map(String).filter((d) => DEFECTS.has(d)) : [],
    notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 500) : null,
    cupped_by: session?.name ?? null,
  }
  const sb = createAdminClient()
  const { data, error } = await sb.from('roast_cuppings').insert(row).select('*').single()
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  return Response.json({ ok: true, cupping: data })
}
