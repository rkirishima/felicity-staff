import { requireAuth } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBeanHistory, loadRecipeProfile } from '@/lib/roast/data'
import { briefRoast } from '@/lib/roast/ai'

export const runtime = 'nodejs'
export const maxDuration = 60

// 焼く前の「今日のポイント」。body: { beanId, greenKg, level }
export async function POST(request: Request) {
  const denied = await requireAuth(); if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as { beanId?: string; greenKg?: number; level?: string }
  if (!body.beanId || !body.greenKg) return Response.json({ ok: false, error: 'beanId/greenKg required' }, { status: 400 })

  const sb = createAdminClient()
  const [{ data: bean }, profile, history] = await Promise.all([
    sb.from('roast_beans').select('display_name').eq('id', body.beanId).maybeSingle(),
    loadRecipeProfile(sb, body.beanId, Number(body.greenKg), body.level ?? null),
    loadBeanHistory(sb, body.beanId, Number(body.greenKg), { limit: 5 }),
  ])

  const brief = await briefRoast({
    bean_name: (bean as { display_name?: string } | null)?.display_name ?? body.beanId,
    green_kg: Number(body.greenKg),
    use_case: body.level ?? '-',
    profile,
    history,
  })
  return Response.json({ ok: true, brief, history })
}
