// 予約確定時のメール通知（Resend）。店舗宛に予約リスト、お客様宛に確認メール。
import { Resend } from 'resend'
import { getCompanyInfo } from '@/lib/keiri/company'
import { PERSIAN_DINNER as EV, cancelDeadline } from './persian-dinner'
import type { Booking } from './bookings'
import { createAdminClient } from '@/lib/supabase/admin'

const FROM = 'FELICITY <orders@felicity.cafe>'
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

function notifyTo(): string[] {
  const env = process.env.EVENT_NOTIFY_EMAIL
  if (env) return env.split(',').map(s => s.trim()).filter(Boolean)
  if (EV.notify_emails.length) return [...EV.notify_emails]
  return [getCompanyInfo().email].filter(Boolean)
}

function jst(iso: string | null): string {
  if (!iso) return ''
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
}

export async function notifyNewBooking(b: Booking): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')
  const resend = new Resend(key)

  const sb = createAdminClient()
  const { data } = await sb
    .from('event_bookings').select('*').eq('event_slug', b.event_slug).eq('status', 'paid').order('paid_at')
  const paid = (data ?? []) as Booking[]
  const totalQty = paid.reduce((s, r) => s + r.qty, 0)
  const totalAmt = paid.reduce((s, r) => s + r.amount_jpy, 0)
  const dateLabel = `${EV.date.replaceAll('-', '/')} ${EV.start_time}`

  const list = paid
    .map((r, i) => `${i + 1}. ${r.name}（${r.qty}名）${yen(r.amount_jpy)}  ${r.email ?? ''}  ${jst(r.paid_at)}`)
    .join('\n')

  const to = notifyTo()
  if (to.length) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `【予約】${EV.title} ${b.name}様 ${b.qty}名（計${totalQty}/${EV.capacity}名）`,
      text: `新しい予約が入りました。

${b.name}様  ${b.qty}名  ${yen(b.amount_jpy)}
メール: ${b.email ?? '—'}

■ ${EV.title}（${dateLabel}〜）
予約 ${totalQty} / ${EV.capacity} 名　残り ${Math.max(0, EV.capacity - totalQty)} 名
売上合計 ${yen(totalAmt)}

■ 予約リスト
${list}

管理画面: https://staff.felicity.cafe/admin/events/persian-dinner`,
    })
  }

  if (b.email) {
    await resend.emails.send({
      from: FROM,
      to: b.email,
      subject: `【FELICITY】『${EV.title}』ご予約ありがとうございます`,
      text: `${b.name} 様

ご予約ありがとうございます。以下の内容で承りました。

『${EV.title}』
日時: ${dateLabel}〜
人数: ${b.qty}名
お支払い: ${yen(b.amount_jpy)}（税込・お支払い済み）
※ドリンクは当日別会計です。

キャンセルについて
${cancelDeadline().replaceAll('-', '/')} 23:59 までのキャンセルは全額返金いたします。それ以降のキャンセル・無断欠席は返金できません。
キャンセルの際はこのメールにご返信ください。

当日お会いできるのを楽しみにしております。

FELICITY
https://felicity.cafe`,
      replyTo: notifyTo()[0],
    })
  }
}
