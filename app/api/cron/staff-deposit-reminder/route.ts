import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'

export const runtime = 'nodejs'

// 毎月14日 09:00 JST (= 00:00 UTC) にスタッフへの振込を促す Telegram リマインダー。
// Vercel cron: 0 0 14 * *
// rkirishima の個人 Telegram に直接送る（chat_id ハードコード）。
const PERSONAL_CHAT_ID = '8385902885'

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 503 })
  }

  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const label = `${nowJst.getUTCFullYear()}年${nowJst.getUTCMonth() + 1}月`

  const text = [
    `💴 <b>スタッフ給与の振込日</b>（${label}）`,
    '',
    '今日は14日。カフェスタッフへの振込を忘れずに！',
  ].join('\n')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: PERSONAL_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) {
    return NextResponse.json(
      { ok: false, error: data.description ?? `http ${res.status}` },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, label, message_id: data.result?.message_id })
}
