import Link from 'next/link'
import { PERSIAN_DINNER as EV, cancelDeadline } from '@/lib/events/persian-dinner'
import { getBooking, syncBooking, type Booking } from '@/lib/events/bookings'

export const dynamic = 'force-dynamic'

export default async function SuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const id = sp.b ?? ''
  let b: Booking | null = null
  if (/^[0-9a-f-]{36}$/.test(id)) {
    b = await getBooking(id)
    if (b && b.status === 'pending') {
      try { b = await syncBooking(b) } catch { /* 表示は pending のまま */ }
    }
  }
  const paid = b?.status === 'paid'

  return (
    <div className="min-h-screen -mb-20 flex items-center justify-center px-4" style={{ backgroundColor: '#FAF7F2', color: '#292524' }}>
      <div className="max-w-md w-full rounded-3xl border bg-white p-6 text-center" style={{ borderColor: '#E8E0D4' }}>
        {paid && b ? (
          <>
            <p className="text-4xl">🎉</p>
            <h1 className="text-lg font-semibold mt-2">ご予約ありがとうございます</h1>
            <p className="text-sm text-stone-500">Thank you for your reservation</p>
            <div className="mt-4 text-sm space-y-1">
              <p>『{EV.title}』</p>
              <p>{EV.date.replaceAll('-', '/')} {EV.start_time}〜</p>
              <p>{b.name} 様　{b.qty}名 / ¥{b.amount_jpy.toLocaleString('ja-JP')}（お支払い済み）</p>
              <p className="text-xs text-stone-500 pt-2">キャンセルは {cancelDeadline().replaceAll('-', '/')} 23:59 まで全額返金</p>
              {b.email && <p className="text-xs text-stone-500">確認メール（キャンセル用リンク付き）を {b.email} にお送りしました</p>}
            </div>
          </>
        ) : b?.status === 'pending' ? (
          <>
            <h1 className="text-lg font-semibold">お支払いを確認中です</h1>
            <p className="text-sm text-stone-500 mt-2">少し時間をおいてこのページを再読み込みしてください。</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">ご予約は完了していません</h1>
            <p className="text-sm text-stone-500 mt-2">お支払いが確認できませんでした。お手数ですが、もう一度お申し込みください。</p>
          </>
        )}
        <Link href={`/events/${EV.slug}`} className="inline-block mt-5 text-xs text-teal-600 underline">イベントページに戻る</Link>
      </div>
    </div>
  )
}
