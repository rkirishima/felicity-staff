import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'

export const runtime = 'nodejs'

// 毎月3日 09:00 JST (= 00:00 UTC) に前月分の経理CSVダウンロードを促す Telegram リマインダー。
// Vercel cron: 0 0 3 * *
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
  const prev = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() - 1, 1))
  const label = `${prev.getUTCFullYear()}年${prev.getUTCMonth() + 1}月`

  const text = [
    `📥 <b>経理CSVダウンロード</b>（${label}分）`,
    '',
    '先月分が締まりました。3点まとめて落として keiri に取り込み。',
    '',
    '1️⃣ 住信SBI 入出金明細CSV',
    '   https://www.netbk.co.jp/',
    '2️⃣ Amazonビジネス 注文レポートCSV',
    '   https://business.amazon.co.jp/',
    '3️⃣ ETC利用照会 CSV',
    '   https://www.etc-meisai.jp/',
    '',
    '<a href="https://staff.felicity.cafe/admin/keiri/bank">▶ /admin/keiri/bank からインポート</a>',
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
