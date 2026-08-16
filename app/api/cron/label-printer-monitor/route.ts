import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { createServiceClient } from '@/lib/keiri/serviceClient'

// ラベルプリンタ外形監視 (10分ごと)。Pi のハートビートが15分以上途絶えたら
// Telegram に一報 (alerted フラグで重複防止)、復帰したら回復通知。
// Pi 内蔵の watchdog は Pi ごと落ちると無力なので、この cron が外から見る。

const DOWN_THRESHOLD_MS = 15 * 60 * 1000

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ORDERS_CHAT_ID
  if (!token || !chatId) return false
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  return res.ok
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: status, error } = await supabase
    .from('label_printer_status').select('*').eq('id', 1).single()
  if (error || !status) {
    return NextResponse.json({ error: 'no heartbeat row' }, { status: 500 })
  }

  const ageMs = Date.now() - new Date(status.last_seen).getTime()
  const isDown = ageMs > DOWN_THRESHOLD_MS
  const ageMin = Math.round(ageMs / 60000)

  if (isDown && !status.alerted) {
    await sendTelegram(
      `🖨❌ ラベルプリンタサーバー(Pi)が停止しています\n最終応答: ${ageMin}分前\n` +
      `店頭のRaspberry Piの電源とネットワークを確認してください。\n` +
      `復旧までの印刷はキューに溜まり、30分以内なら復旧後に自動印刷されます。`
    )
    await supabase.from('label_printer_status').update({ alerted: true }).eq('id', 1)
    return NextResponse.json({ down: true, alerted: 'sent', age_min: ageMin })
  }

  if (!isDown && status.alerted) {
    await sendTelegram(`🖨✅ ラベルプリンタサーバー(Pi)が復旧しました`)
    await supabase.from('label_printer_status').update({ alerted: false }).eq('id', 1)
    return NextResponse.json({ down: false, alerted: 'recovered' })
  }

  return NextResponse.json({ down: isDown, age_min: ageMin })
}
