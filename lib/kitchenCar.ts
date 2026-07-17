import crypto from 'crypto'

const DOW = ['日', '月', '火', '水', '木', '金', '土']

// 'YYYY-MM-DD' → 'M/D(曜)'。正午UTCで生成して曜日ズレを防ぐ。
export function kcDateLabel(date: string): string {
  const d = new Date(date + 'T12:00:00Z')
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`
}

// Telegramのリンクボタン用に、日付+操作をCRON_SECRETで署名する。
// CRON_SECRET 未設定だと空鍵で誰でも署名を偽造できるため、未設定は明確にエラーにする。
export function signDecision(date: string, action: string): string {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET not set — cannot sign kitchen-car decision link')
  return crypto.createHmac('sha256', secret).update(`${date}:${action}`).digest('hex')
}

export function verifyDecision(date: string, action: string, sig: string): boolean {
  if (!sig) return false
  try {
    const expected = signDecision(date, action) // 未設定なら throw → 検証失敗扱い
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

// LINEスタッフグループへ送信（shift-alert と同じ仕組みを流用）。
export async function sendStaffLine(message: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const to = process.env.LINE_STAFF_GROUP_ID
  if (!token || !to) {
    console.warn('[kitchenCar] LINE_CHANNEL_ACCESS_TOKEN/LINE_STAFF_GROUP_ID 未設定。送信スキップ')
    return false
  }
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: 'text', text: message }] }),
    })
    return res.ok
  } catch {
    return false
  }
}
