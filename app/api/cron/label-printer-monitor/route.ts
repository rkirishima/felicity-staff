import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { createServiceClient } from '@/lib/keiri/serviceClient'

// ラベルプリンタ外形監視 (10分ごと)。2段構えで見る:
//
//  1. Pi のハートビートが15分以上途絶えたら「Piが停止」で通知
//  2. Pi は生きているのにプリンタ本体(ブラザー)に届かない状態が10分以上
//     続いたら「本体が応答しない」で通知
//
// 2 を足したのは、2026-09-30 に Pi もキューも正常なのに本体が固まっていて
// ラベルが1枚も出ず、しかも監視が何も鳴らなかったため。本体の電源を入れ直したら
// printer_reachable が false → true に戻って復旧した。
//
// 印刷中はポート9100が埋まって health が一時的に false を返すことがあるので、
// 本体側は「継続時間」で判定する (瞬間値では鳴らさない)。
// Pi 内蔵の watchdog は Pi ごと落ちると無力なので、この cron が外から見る。

const DOWN_THRESHOLD_MS = 15 * 60 * 1000
const PRINTER_DOWN_THRESHOLD_MS = 10 * 60 * 1000

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

  const now = Date.now()
  const ageMs = now - new Date(status.last_seen).getTime()
  const isDown = ageMs > DOWN_THRESHOLD_MS
  const ageMin = Math.round(ageMs / 60000)

  // ── 1. Pi 自体の生死 ──────────────────────────────────────────────
  if (isDown) {
    if (status.alerted) {
      return NextResponse.json({ down: true, alerted: 'already', age_min: ageMin })
    }
    await sendTelegram(
      `🖨❌ ラベルプリンタサーバー(Pi)が停止しています\n最終応答: ${ageMin}分前\n` +
      `店頭のRaspberry Piの電源とネットワークを確認してください。\n` +
      `復旧までの印刷はキューに溜まり、30分以内なら復旧後に自動印刷されます。`
    )
    await supabase.from('label_printer_status').update({ alerted: true }).eq('id', 1)
    return NextResponse.json({ down: true, alerted: 'sent', age_min: ageMin })
  }

  if (status.alerted) {
    await sendTelegram(`🖨✅ ラベルプリンタサーバー(Pi)が復旧しました`)
    await supabase.from('label_printer_status').update({ alerted: false }).eq('id', 1)
  }

  // ── 2. プリンタ本体への到達性 ─────────────────────────────────────
  // Pi が生きているときだけ見る。Pi が落ちていれば本体の状態は分からない。
  if (status.printer_reachable) {
    if (status.printer_alerted) {
      await sendTelegram(`🖨✅ ラベルプリンタ本体が復旧しました。印刷できる状態です。`)
    }
    if (status.printer_alerted || status.printer_unreachable_since) {
      await supabase.from('label_printer_status')
        .update({ printer_alerted: false, printer_unreachable_since: null }).eq('id', 1)
    }
    return NextResponse.json({ down: false, printer: 'ok', age_min: ageMin })
  }

  // ここから先は printer_reachable = false
  if (!status.printer_unreachable_since) {
    // 不達の始まりを記録するだけ。印刷中の一時的な false と区別するため、
    // この時点では通知しない。
    await supabase.from('label_printer_status')
      .update({ printer_unreachable_since: new Date(now).toISOString() }).eq('id', 1)
    return NextResponse.json({ down: false, printer: 'unreachable', alerted: 'pending', unreachable_min: 0 })
  }

  const unreachableMs = now - new Date(status.printer_unreachable_since).getTime()
  const unreachableMin = Math.round(unreachableMs / 60000)

  if (unreachableMs > PRINTER_DOWN_THRESHOLD_MS && !status.printer_alerted) {
    await sendTelegram(
      `🖨❌ ラベルプリンタ本体が応答しません\n不達: ${unreachableMin}分継続\n` +
      `Pi・印刷キューは正常なので、本体(ブラザー QL-820NWB)側の問題です。\n` +
      `この状態では印刷を実行してもラベルは出ません。\n` +
      `本体の電源を入れ直してください（前回はこれで復旧しました）。`
    )
    await supabase.from('label_printer_status').update({ printer_alerted: true }).eq('id', 1)
    return NextResponse.json({ down: false, printer: 'unreachable', alerted: 'sent', unreachable_min: unreachableMin })
  }

  return NextResponse.json({
    down: false,
    printer: 'unreachable',
    alerted: status.printer_alerted ? 'already' : 'pending',
    unreachable_min: unreachableMin,
  })
}
