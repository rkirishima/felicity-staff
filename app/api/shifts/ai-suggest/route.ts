import { aiSuggestShifts, type AiShiftInput } from '@/lib/shifts/aiSuggest'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }
  try {
    const body = (await request.json()) as Partial<AiShiftInput>
    const input: AiShiftInput = {
      month: body.month ?? '',
      pending: Array.isArray(body.pending) ? body.pending : [],
      approved: Array.isArray(body.approved) ? body.approved : [],
      staff: Array.isArray(body.staff) ? body.staff : [],
    }
    const result = await aiSuggestShifts(input)
    if (!result) {
      return Response.json({ ok: false, error: 'AI提案の生成に失敗しました' }, { status: 502 })
    }
    return Response.json({ ok: true, result })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
