import Link from 'next/link'
import { PERSIAN_DINNER as EV, cancelDeadline } from '@/lib/events/persian-dinner'

export default async function SuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const qty = parseInt(sp.qty ?? '0', 10) || 0
  const total = parseInt(sp.total ?? '0', 10) || 0
  return (
    <div className="min-h-screen -mb-20 flex items-center justify-center px-4" style={{ backgroundColor: '#FAF7F2', color: '#292524' }}>
      <div className="max-w-md w-full rounded-3xl border bg-white p-6 text-center" style={{ borderColor: '#E8E0D4' }}>
        <p className="text-4xl">🎉</p>
        <h1 className="text-lg font-semibold mt-2">ご予約ありがとうございます</h1>
        <p className="text-sm text-stone-500">Thank you for your reservation</p>
        <div className="mt-4 text-sm space-y-1">
          <p>{EV.title}</p>
          <p>{EV.date.replaceAll('-', '/')} {EV.start_time}〜</p>
          <p className="text-xs text-stone-500">キャンセルは {cancelDeadline().replaceAll('-', '/')} 23:59 まで全額返金</p>
          {qty > 0 && <p>{qty}名 / ¥{total.toLocaleString('ja-JP')}</p>}
        </div>
        {sp.demo && <p className="mt-4 text-[11px] rounded-lg py-1.5" style={{ backgroundColor: '#fde68a', color: '#78350f' }}>デモ: 決済は行われていません</p>}
        <Link href={`/events/${EV.slug}`} className="inline-block mt-5 text-xs text-teal-600 underline">イベントページに戻る</Link>
      </div>
    </div>
  )
}
