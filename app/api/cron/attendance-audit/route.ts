import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendLine(msg: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: process.env.LINE_STAFF_GROUP_ID,
      messages: [{ type: 'text', text: msg }],
    }),
  })
}

// 2時間超の乖離をアラート対象とする
const DIFF_THRESHOLD_H = 2
// 日給上限（イベント等の例外あり、あくまで目安）
const DAILY_PAY_LIMIT = 13000

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayJST = nowJST.toISOString().slice(0, 10)
  const tomorrowJST = new Date(nowJST.getTime() + 86400000).toISOString().slice(0, 10)

  const [{ data: shifts }, { data: clocks }] = await Promise.all([
    sb.from('shifts')
      .select('staff_id, start_time, end_time, staff(name)')
      .eq('date', todayJST)
      .eq('status', 'approved')
      .not('staff_id', 'is', null),
    sb.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate)')
      .gte('clock_in', `${todayJST}T00:00:00+09:00`)
      .lt('clock_in', `${tomorrowJST}T00:00:00+09:00`),
  ])

  const alerts: string[] = []

  // スタッフ別に打刻をグループ化
  const clocksByStaff: Record<string, any[]> = {}
  for (const c of (clocks ?? [])) {
    if (!clocksByStaff[c.staff_id]) clocksByStaff[c.staff_id] = []
    clocksByStaff[c.staff_id].push(c)
  }

  // シフトごとにチェック
  for (const shift of (shifts ?? [])) {
    const name = (shift.staff as any)?.name ?? '不明'
    const staffClocks = clocksByStaff[shift.staff_id] ?? []
    const shiftLabel = `${shift.start_time.slice(0, 5)}〜${shift.end_time.slice(0, 5)}`

    // 打刻が一件もない
    if (staffClocks.length === 0) {
      alerts.push(`📭 打刻なし: ${name}（シフト ${shiftLabel}）`)
      continue
    }

    // 重複打刻（同日2件以上）
    if (staffClocks.length > 1) {
      alerts.push(`⚠️ 重複打刻: ${name} — ${staffClocks.length}件（シフト ${shiftLabel}）`)
    }

    // 退勤済みレコードで実働時間と乖離チェック
    const completed = staffClocks.filter(c => c.clock_out)
    if (completed.length > 0) {
      const actualH = completed.reduce((sum: number, c: any) =>
        sum + (new Date(c.clock_out).getTime() - new Date(c.clock_in).getTime()) / 3600000, 0)

      const [sh, sm] = shift.start_time.split(':').map(Number)
      const [eh, em] = shift.end_time.split(':').map(Number)
      // 終業<始業は日跨ぎシフト。24h 足して負のscheduledHによる誤アラートを防ぐ
      let schedMin = eh * 60 + em - (sh * 60 + sm)
      if (schedMin < 0) schedMin += 24 * 60
      const scheduledH = schedMin / 60

      const diff = Math.abs(actualH - scheduledH)
      if (diff > DIFF_THRESHOLD_H) {
        const sign = actualH > scheduledH ? '超過' : '不足'
        alerts.push(`⏱ 乖離${diff.toFixed(1)}h ${sign}: ${name} — シフト${scheduledH.toFixed(1)}h / 実績${actualH.toFixed(1)}h`)
      }

      // 日給上限チェック
      const hourlyRate = (staffClocks[0].staff as any)?.hourly_rate ?? 1300
      const dailyPay = Math.round(actualH * hourlyRate)
      if (dailyPay > DAILY_PAY_LIMIT) {
        alerts.push(`💴 日給上限超過: ${name} — ¥${dailyPay.toLocaleString()}（${actualH.toFixed(1)}h × ¥${hourlyRate}）`)
      }
    }
  }

  // シフトなしで打刻しているスタッフ（幽霊打刻）
  const shiftStaffIds = new Set((shifts ?? []).map(s => s.staff_id))
  for (const [staffId, staffClocks] of Object.entries(clocksByStaff)) {
    if (!shiftStaffIds.has(staffId)) {
      const name = (staffClocks[0].staff as any)?.name ?? '不明'
      alerts.push(`❓ シフト外打刻: ${name}`)
    }
  }

  if (alerts.length > 0) {
    const msg = `📋 勤怠チェック ${todayJST}\n\n${alerts.join('\n')}\n\n管理画面で確認してください👇\nhttps://staff.felicity.cafe/admin/timeclock`
    await sendLine(msg)
  }

  return NextResponse.json({ date: todayJST, alerts, sent: alerts.length > 0 })
}
