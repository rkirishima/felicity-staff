import { PERSIAN_DINNER as EV, cancelDeadline } from '@/lib/events/persian-dinner'
import { getBooking } from '@/lib/events/bookings'
import { canCancelNow, verifyCancelToken } from '@/lib/events/cancel'
import CancelButton from './CancelButton'

export const dynamic = 'force-dynamic'

export default async function CancelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const id = sp.b ?? ''
  const t = sp.t ?? ''
  const valid = /^[0-9a-f-]{36}$/.test(id) && verifyCancelToken(id, t)
  const b = valid ? await getBooking(id) : null
  const deadline = `${cancelDeadline().replaceAll('-', '/')} 23:59`

  let body: React.ReactNode
  if (!b) {
    body = <p className="text-sm text-stone-500">リンクが正しくないか、予約が見つかりません。</p>
  } else if (b.status === 'refunded' || b.status === 'cancelled') {
    body = <p className="text-sm">この予約はキャンセル済みです（返金済み）。</p>
  } else if (b.status !== 'paid') {
    body = <p className="text-sm text-stone-500">この予約はお支払いが完了していないため、キャンセルの必要はありません。</p>
  } else if (!canCancelNow()) {
    body = (
      <>
        <p className="text-sm">キャンセル期限（{deadline}）を過ぎているため、返金できません。</p>
        <p className="text-xs text-stone-500 mt-2">ご不明な点はお店までご連絡ください。</p>
      </>
    )
  } else {
    body = (
      <>
        <div className="text-sm space-y-1">
          <p>{b.name} 様　{b.qty}名</p>
          <p>お支払い額 ¥{b.amount_jpy.toLocaleString('ja-JP')}</p>
        </div>
        <p className="text-xs text-stone-500 mt-3">{deadline} までのキャンセルは全額返金されます。</p>
        <CancelButton b={b.id} t={t} amount={b.amount_jpy} />
      </>
    )
  }

  return (
    <div className="min-h-screen -mb-20 flex items-center justify-center px-4" style={{ backgroundColor: '#FAF7F2', color: '#292524' }}>
      <div className="max-w-md w-full rounded-3xl border bg-white p-6 text-center" style={{ borderColor: '#E8E0D4' }}>
        <h1 className="text-lg font-semibold">ご予約のキャンセル</h1>
        <p className="text-xs text-stone-500 mb-4">『{EV.title}』{EV.date.replaceAll('-', '/')} {EV.start_time}〜</p>
        {body}
      </div>
    </div>
  )
}
