'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { markWholesaleOrderPaid } from './actions'

function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function MarkPaidButton({ orderId, amount }: { orderId: string; amount: number }) {
  const [date, setDate] = useState(todayJST())
  const [pending, startTransition] = useTransition()

  function onClick() {
    if (!confirm(`${orderId}\n¥${amount.toLocaleString('ja-JP')} の入金を ${date} 付で確認済みにします。`)) return
    startTransition(async () => {
      const res = await markWholesaleOrderPaid(orderId, date)
      if (res.ok) toast.success('入金確認しました。取引先が領収書をダウンロードできます。')
      else toast.error(res.error ?? '更新できませんでした')
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="border border-stone-200 rounded px-2 py-1 text-xs text-stone-700 bg-white"
        aria-label="入金日"
      />
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded bg-stone-800 text-white text-xs px-3 py-1.5 disabled:opacity-50"
      >
        {pending ? '更新中…' : '入金確認'}
      </button>
    </div>
  )
}
