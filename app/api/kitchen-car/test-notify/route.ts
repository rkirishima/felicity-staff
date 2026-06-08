import { signDecision, kcDateLabel } from '@/lib/kitchenCar'

export const runtime = 'nodejs'

// 一時的なテスト用エンドポイント。オーナーのTelegramにだけ、本番と同じ見た目の
// 中止/開催ボタン付きメッセージを送る。ダミー日付(実シフト無し)を使うため、
// 「🚫中止」を押しても decision 側で「対象なし」となり LINE は送信されない。
// CRON_SECRET で保護。動作確認後に削除する。
// 叩き方:
//   curl -H "Authorization: Bearer <CRON_SECRET>" https://staff.felicity.cafe/api/kitchen-car/test-notify
//   または  https://staff.felicity.cafe/api/kitchen-car/test-notify?secret=<CRON_SECRET>

const OWNER_CHAT_ID = '8385902885'
const BASE = 'https://staff.felicity.cafe'
const TEST_DATE = '2099-01-01' // 実シフトが存在しないセンチネル日付

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const url = new URL(req.url)
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    url.searchParams.get('secret') ??
    ''
  if (!secret || provided !== secret) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return Response.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 503 })
  }

  const label = kcDateLabel(TEST_DATE)
  const cancelUrl = `${BASE}/api/kitchen-car/decision?d=${TEST_DATE}&a=cancel&sig=${signDecision(TEST_DATE, 'cancel')}`
  const keepUrl = `${BASE}/api/kitchen-car/decision?d=${TEST_DATE}&a=keep&sig=${signDecision(TEST_DATE, 'keep')}`

  const text = [
    '🧪 <b>[テスト] キッチンカー 雨予報</b>',
    '',
    'これはテスト通知です。本番と同じ見た目ですが、',
    '「🚫中止する」を押してもスタッフLINEには送られません。',
    '',
    `（例）<b>${label}</b> のキッチンカー、11〜16時に雨の可能性`,
    '・最大降水確率: <b>70%</b>',
    '・予想降水量(11-16時): <b>3.2mm</b>',
    '',
    '下の2つのボタンの動作を確認してください👇',
  ].join('\n')

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: OWNER_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: '🚫 中止する', url: cancelUrl },
          { text: '✅ 開催する', url: keepUrl },
        ]],
      },
    }),
  })
  const j = await res.json()
  return Response.json({ ok: !!j.ok, detail: j.ok ? 'sent' : j.description })
}
