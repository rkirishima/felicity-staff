// 予約確定時のメール通知（Resend）。店舗宛に予約リスト、お客様宛に確認メール。
import { Resend } from 'resend'
import { getCompanyInfo } from '@/lib/keiri/company'
import { PERSIAN_DINNER as EV, cancelDeadline } from './persian-dinner'
import type { Booking } from './bookings'
import { cancelUrl } from './cancel'
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

const dateLabel = `${EV.date.replaceAll('-', '/')} ${EV.start_time}`

async function summary(slug: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('event_bookings').select('*').eq('event_slug', slug).eq('status', 'paid').order('paid_at')
  const paid = (data ?? []) as Booking[]
  const totalQty = paid.reduce((s, r) => s + r.qty, 0)
  const totalAmt = paid.reduce((s, r) => s + r.amount_jpy, 0)
  const list = paid
    .map((r, i) => `${i + 1}. ${r.name}（${r.qty}名）${yen(r.amount_jpy)}  ${r.email ?? ''}  ${jst(r.paid_at)}`)
    .join('\n') || '（なし）'
  return { totalQty, totalAmt, list }
}

function resendClient(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')
  return new Resend(key)
}

export async function notifyNewBooking(b: Booking): Promise<void> {
  const resend = resendClient()
  const { totalQty, totalAmt, list } = await summary(b.event_slug)

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
キャンセルは下記リンクからお手続きいただけます（返金は自動で行われます）。
${cancelUrl(b.id)}

当日お会いできるのを楽しみにしております。

FELICITY
https://felicity.cafe`,
      replyTo: notifyTo()[0],
    })
  }
}

export async function notifyCancellation(b: Booking, by: 'guest' | 'admin'): Promise<void> {
  const resend = resendClient()
  const { totalQty, totalAmt, list } = await summary(b.event_slug)

  const to = notifyTo()
  if (to.length) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `【キャンセル】${EV.title} ${b.name}様 ${b.qty}名（計${totalQty}/${EV.capacity}名）`,
      text: `予約がキャンセルされ、${yen(b.amount_jpy)} を返金しました（${by === 'guest' ? 'お客様がリンクから手続き' : '管理画面から操作'}）。

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
      subject: `【FELICITY】『${EV.title}』キャンセルを承りました`,
      text: `${b.name} 様

『${EV.title}』（${dateLabel}〜、${b.qty}名）のキャンセルを承りました。
お支払いいただいた ${yen(b.amount_jpy)} を全額返金いたしました。
カード会社により、明細への反映まで数日〜1週間ほどかかる場合があります。

またのご来店をお待ちしております。

FELICITY
https://felicity.cafe`,
      replyTo: notifyTo()[0],
    })
  }
}
