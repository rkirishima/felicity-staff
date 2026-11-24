'use client'
import { useState } from 'react'

export default function CancelButton({ b, t, amount }: { b: string; t: string; amount: number }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [err, setErr] = useState('')

  async function cancel() {
    if (!confirm(`キャンセルして ¥${amount.toLocaleString('ja-JP')} を返金します。よろしいですか？`)) return
    setState('busy'); setErr('')
    try {
      const r = await fetch('/api/events/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b, t }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'error')
      setState('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'キャンセルに失敗しました'); setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-5 text-sm">
        <p className="font-semibold">キャンセルを承りました</p>
        <p className="text-xs text-stone-500 mt-1">全額返金しました。カード明細への反映まで数日かかる場合があります。確認メールをお送りしました。</p>
      </div>
    )
  }
  return (
    <>
      {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
      <button onClick={cancel} disabled={state === 'busy'}
        className="w-full mt-5 py-3 rounded-xl text-white font-medium disabled:opacity-60" style={{ backgroundColor: '#ef4444' }}>
        {state === 'busy' ? '処理中…' : 'キャンセルして返金する'}
      </button>
    </>
  )
}
