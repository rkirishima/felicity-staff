import { NextResponse } from 'next/server'
import { getBooking, refundBooking } from '@/lib/events/bookings'
import { canCancelNow, verifyCancelToken } from '@/lib/events/cancel'

// お客様がメールのリンクからキャンセル（期限内なら全額自動返金）。
export async function POST(req: Request): Promise<Response> {
  let body: { b?: unknown; t?: unknown }
  try { body = await req.json() } catch { body = {} }
  const id = String(body.b ?? '')
  const token = String(body.t ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !verifyCancelToken(id, token)) {
    return NextResponse.json({ error: 'リンクが正しくありません' }, { status: 403 })
  }
  const b = await getBooking(id)
  if (!b) return NextResponse.json({ error: '予約が見つかりません' }, { status: 404 })
  if (b.status === 'refunded' || b.status === 'cancelled') return NextResponse.json({ ok: true, already: true })
  if (b.status !== 'paid') return NextResponse.json({ error: 'この予約はキャンセルできません' }, { status: 400 })
  if (!canCancelNow()) return NextResponse.json({ error: 'キャンセル期限を過ぎているため、返金できません' }, { status: 400 })
  try {
    await refundBooking(b, 'guest')
  } catch (e) {
    console.error('guest cancel failed', e)
    return NextResponse.json({ error: '返金処理に失敗しました。お手数ですがお店にご連絡ください。' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
