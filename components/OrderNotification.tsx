'use client'
import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Order = {
  id: string
  customer_name: string
  items: { name: string; qty: number }[]
  amount: number
}

function playChime() {
  try {
    const ctx = new AudioContext()
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      const t = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.35, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.start(t)
      osc.stop(t + 0.5)
    })
  } catch {}
}

export default function OrderNotification() {
  const [alert, setAlert] = useState<Order | null>(null)

  useEffect(() => {
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const channel = sb
      .channel('orders-insert')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new as Order
          setAlert(order)
          playChime()
          // 30秒後に自動で消す
          setTimeout(() => setAlert(null), 30000)
        }
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [])

  if (!alert) return null

  const itemNames = alert.items?.map(i => `${i.name} ×${i.qty}`).join('、') ?? ''

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 p-4"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="max-w-sm mx-auto rounded-2xl shadow-xl p-4 flex items-start gap-3"
        style={{
          backgroundColor: '#1c1917',
          border: '1px solid #5eead4',
          pointerEvents: 'auto',
        }}
      >
        <div className="text-2xl">🛍️</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-teal-400 tracking-widest mb-0.5">NEW ORDER</p>
          <p className="font-semibold text-white truncate">{alert.customer_name}</p>
          <p className="text-xs text-stone-400 mt-0.5 truncate">{itemNames}</p>
          <p className="text-sm font-medium text-teal-300 mt-1">¥{alert.amount.toLocaleString()}</p>
        </div>
        <button
          onClick={() => setAlert(null)}
          className="text-stone-500 text-xl leading-none ml-1 mt-0.5"
        >
          ×
        </button>
      </div>
    </div>
  )
}
