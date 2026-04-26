'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession } from '@/lib/session'
import { toast } from 'sonner'

type Order = {
  id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  shipping_address: string
  items: { name: string; qty: number }[]
  amount: number
  status: 'pending_bank_transfer' | 'paid' | 'shipped'
  payment_method?: string | null
  tracking_number: string | null
  shipped_at: string | null
  created_at: string
}

export default function ShippingPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<'pending' | 'unshipped' | 'shipped'>('pending')
  const supabase = createClient()
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)

  useEffect(() => {
    setIsStaff(!!getSession())
  }, [])

  const hasAccess = isAdmin || isStaff

  useEffect(() => {
    if (!hasAccess) return
    load()
  }, [hasAccess])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
    setLoading(false)
  }

  async function confirmPayment(order: Order) {
    if (!confirm(`${order.customer_name} 様の入金を確認しましたか？\n¥${order.amount.toLocaleString()}`)) return
    setConfirming(s => ({ ...s, [order.id]: true }))
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'paid' })
        .eq('id', order.id)
      if (error) throw error
      toast.success(`入金確認しました（${order.customer_name}）`)
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: 'paid' } : o
      ))
      setTab('unshipped')
    } catch (e: any) {
      toast.error(`更新失敗: ${e.message}`)
    } finally {
      setConfirming(s => ({ ...s, [order.id]: false }))
    }
  }

  async function sendNotification(order: Order) {
    const trackingNumber = trackingInputs[order.id]?.trim()
    if (!trackingNumber) {
      toast.error('追跡番号を入力してください')
      return
    }
    setSending(s => ({ ...s, [order.id]: true }))
    try {
      const res = await fetch('/api/shipping-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, trackingNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unknown error')
      toast.success(`発送通知を送信しました（${order.customer_name}）`)
      setOrders(prev => prev.map(o =>
        o.id === order.id
          ? { ...o, status: 'shipped', tracking_number: trackingNumber, shipped_at: new Date().toISOString() }
          : o
      ))
    } catch (e: any) {
      toast.error(`送信失敗: ${e.message}`)
    } finally {
      setSending(s => ({ ...s, [order.id]: false }))
    }
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <p className="text-stone-400 text-sm">スタッフとしてログインしてください</p>
      </main>
    )
  }

  const pending = orders.filter(o => o.status === 'pending_bank_transfer')
  const unshipped = orders.filter(o => o.status === 'paid')
  const shipped = orders.filter(o => o.status === 'shipped')
  const shown = tab === 'pending' ? pending : tab === 'unshipped' ? unshipped : shipped

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#1c1917' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={() => router.push(isAdmin ? '/admin' : '/')} className="text-stone-400 text-sm">←</button>
          <div>
            <h1 className="text-lg font-semibold tracking-wider text-white">発送管理</h1>
            <p className="text-xs text-stone-500">追跡番号の入力・発送通知の送信</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4 max-w-lg mx-auto">
          <button
            onClick={() => setTab('pending')}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: tab === 'pending' ? '#fbbf24' : '#292524',
              color: tab === 'pending' ? '#1c1917' : '#a8a29e',
            }}
          >
            入金待ち
            {pending.length > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: tab === 'pending' ? '#1c1917' : '#44403c', color: tab === 'pending' ? '#fbbf24' : '#d6d3d1' }}>
                {pending.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('unshipped')}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: tab === 'unshipped' ? '#5eead4' : '#292524',
              color: tab === 'unshipped' ? '#1c1917' : '#a8a29e',
            }}
          >
            未発送
            {unshipped.length > 0 && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: tab === 'unshipped' ? '#1c1917' : '#44403c', color: tab === 'unshipped' ? '#5eead4' : '#d6d3d1' }}>
                {unshipped.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('shipped')}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: tab === 'shipped' ? '#5eead4' : '#292524',
              color: tab === 'shipped' ? '#1c1917' : '#a8a29e',
            }}
          >
            発送済み
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">
        {loading ? (
          <p className="text-center text-stone-500 text-sm py-12">読み込み中...</p>
        ) : shown.length === 0 ? (
          <p className="text-center text-stone-500 text-sm py-12">
            {tab === 'pending' ? '入金待ちの注文はありません' : tab === 'unshipped' ? '未発送の注文はありません' : '発送済みの注文はありません'}
          </p>
        ) : (
          shown.map(order => (
            <div key={order.id} className="rounded-2xl p-4 space-y-3"
              style={{ backgroundColor: '#292524' }}>

              {/* Order header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-white">{order.customer_name}</p>
                  <p className="text-xs text-stone-400 mt-0.5 truncate">{order.customer_email}</p>
                  {order.customer_phone && (
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="inline-flex items-center gap-1 text-xs mt-1 font-mono"
                      style={{ color: '#5eead4' }}
                    >
                      📞 {order.customer_phone}
                    </a>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-white">¥{order.amount.toLocaleString()}</p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {new Date(order.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Items */}
              {order.items?.length > 0 && (
                <div className="text-xs text-stone-400 leading-relaxed">
                  {order.items.map((item, i) => (
                    <span key={i}>{item.name} ×{item.qty}{i < order.items.length - 1 ? '、' : ''}</span>
                  ))}
                </div>
              )}

              {/* Shipping address */}
              {order.shipping_address && (
                <p className="text-xs text-stone-500 leading-relaxed">{order.shipping_address}</p>
              )}

              {/* Status-specific actions */}
              {order.status === 'shipped' ? (
                <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: '#44403c' }}>
                  <div>
                    <p className="text-xs text-stone-500">追跡番号</p>
                    <p className="text-sm font-mono text-stone-300 mt-0.5">{order.tracking_number}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#14532d', color: '#86efac' }}>
                    発送済み
                  </span>
                </div>
              ) : order.status === 'pending_bank_transfer' ? (
                /* 入金待ち — 入金確認 button */
                <div className="flex items-center justify-between gap-2 pt-1 border-t" style={{ borderColor: '#44403c' }}>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#78350f', color: '#fbbf24' }}>
                    🏦 銀行振込・入金待ち
                  </span>
                  <button
                    onClick={() => confirmPayment(order)}
                    disabled={confirming[order.id]}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                    style={{ backgroundColor: '#fbbf24', color: '#1c1917' }}
                  >
                    {confirming[order.id] ? '確認中...' : '入金確認'}
                  </button>
                </div>
              ) : (
                /* Unshipped — tracking input */
                <div className="flex gap-2 pt-1 border-t" style={{ borderColor: '#44403c' }}>
                  <input
                    type="text"
                    placeholder="追跡番号"
                    value={trackingInputs[order.id] ?? ''}
                    onChange={e => setTrackingInputs(t => ({ ...t, [order.id]: e.target.value }))}
                    className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: '#1c1917', color: '#e7e5e4', border: '1px solid #44403c' }}
                    onKeyDown={e => e.key === 'Enter' && sendNotification(order)}
                  />
                  <button
                    onClick={() => sendNotification(order)}
                    disabled={sending[order.id] || !trackingInputs[order.id]?.trim()}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
                    style={{ backgroundColor: '#5eead4', color: '#1c1917' }}
                  >
                    {sending[order.id] ? '送信中...' : '通知'}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  )
}
