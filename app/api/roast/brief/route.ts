import { requireAuth } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadBeanHistory } from '@/lib/roast/data'
import { briefRoast } from '@/lib/roast/ai'
import { pickProfile, type RecommendedProfile, type UseCase } from '@/lib/roast/profile'

export const runtime = 'nodejs'
export const maxDuration = 60

// 焼く前の「今日のポイント」。body: { beanId, greenKg, useCase }
export async function POST(request: Request) {
  const denied = await requireAuth(); if (denied) return denied
  const body = (await request.json().catch(() => ({}))) as { beanId?: string; greenKg?: number; useCase?: UseCase }
  if (!body.beanId || !body.greenKg) return Response.json({ ok: false, error: 'beanId/greenKg required' }, { status: 400 })

  const sb = createAdminClient()
  const [{ data: bean }, { data: profiles }, history] = await Promise.all([
    sb.from('roast_beans').select('display_name').eq('id', body.beanId).maybeSingle(),
    sb.from('roast_profile_recommended').select('*').eq('bean_id', body.beanId),
    loadBeanHistory(sb, body.beanId, Number(body.greenKg), { limit: 5 }),
  ])
  const profile = pickProfile((profiles as RecommendedProfile[]) ?? [], Number(body.greenKg), body.useCase ?? 'drip')

  const brief = await briefRoast({
    bean_name: (bean as { display_name?: string } | null)?.display_name ?? body.beanId,
    green_kg: Number(body.greenKg),
    use_case: body.useCase ?? 'drip',
    profile,
    history,
  })
  return Response.json({ ok: true, brief, history })
}
