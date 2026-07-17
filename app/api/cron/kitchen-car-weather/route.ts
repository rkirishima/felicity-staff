import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { createClient } from '@supabase/supabase-js'
import { checkRain } from '@/lib/weather'
import { signDecision, kcDateLabel } from '@/lib/kitchenCar'

export const runtime = 'nodejs'

// キッチンカーの雨天中止判断。毎日 08:00 JST (= 23:00 UTC) に「2日後」を点検し、
// その日にキッチンカー枠があり 11〜16時に雨予報なら、オーナーのTelegramへ
// 「中止する / 開催する」ボタン付きで通知する。
// Vercel cron: 0 23 * * *

// カフェの座標（felicity-stack の GPS と同じ）
const LAT = 35.267359
const LON = 139.610321
const BASE = 'https://staff.felicity.cafe'
const OWNER_CHAT_ID = '8385902885' // rkirishima 個人Telegram（keiri-csv-reminder と同じ）

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: Request): Promise<Response> {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // JST での「今日の2日後」の日付
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const target = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() + 2))
  const dateStr = target.toISOString().slice(0, 10)

  // その日にキッチンカー枠（承認済み）があるか
  const { data: kc } = await sb
    .from('shifts')
    .select('id, note')
    .eq('date', dateStr)
    .eq('location', 'kitchen_car')
    .eq('status', 'approved')

  if (!kc || kc.length === 0) {
    return NextResponse.json({ date: dateStr, kitchenCar: false })
  }
  // 既に中止連絡済みなら何もしない（二重送信防止）
  if (kc.some(s => (s.note ?? '').includes('雨天中止'))) {
    return NextResponse.json({ date: dateStr, alreadyCancelled: true })
  }

  const rain = await checkRain({ latitude: LAT, longitude: LON, date: dateStr })
  if (!rain) return NextResponse.json({ date: dateStr, weather: 'unavailable' })
  if (!rain.willRain) {
    return NextResponse.json({ date: dateStr, willRain: false, maxPop: rain.maxPop, totalMm: rain.totalMm })
  }

  // 雨予報 → オーナーへ Telegram（中止/開催ボタン）
  const token = process.env.TELEGRAM_BOT_TOKEN
  const label = kcDateLabel(dateStr)
  const cancelUrl = `${BASE}/api/kitchen-car/decision?d=${dateStr}&a=cancel&sig=${signDecision(dateStr, 'cancel')}`
  const keepUrl = `${BASE}/api/kitchen-car/decision?d=${dateStr}&a=keep&sig=${signDecision(dateStr, 'keep')}`

  const text = [
    '🚐☔️ <b>キッチンカー 雨予報</b>',
    '',
    `<b>${label}</b> のキッチンカー、11〜16時に雨の可能性があります。`,
    '',
    `・最大降水確率: <b>${rain.maxPop}%</b>`,
    `・予想降水量(11-16時): <b>${rain.totalMm}mm</b>`,
    '',
    '中止しますか？',
  ].join('\n')

  let notified = false
  if (token) {
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
    notified = res.ok
  }

  return NextResponse.json({ date: dateStr, willRain: true, maxPop: rain.maxPop, totalMm: rain.totalMm, notified })
}
