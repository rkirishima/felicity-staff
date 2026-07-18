import { renderAndSendInvoice } from '@/lib/keiri/sendInvoice'
import { requireKeiri } from '@/lib/auth/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const _denied = await requireKeiri(); if (_denied) return _denied
  const { id } = await ctx.params
  let body: { to?: string; subject?: string; body?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  try {
    await renderAndSendInvoice(id, body)
    return Response.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg === 'RESEND_API_KEY not set' ? 503 : 500
    return Response.json({ ok: false, error: msg }, { status })
  }
}
