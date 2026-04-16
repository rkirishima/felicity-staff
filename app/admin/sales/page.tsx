'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useIsAdmin } from '@/lib/admin-context'

type Order = {
  id: string
  customer_name: string
  customer_email: string
  items: { name: string; qty: number }[]
  amount: number
  status: string
  created_at: string
}

type MonthData = { month: string; count: number; total: number }

export default function SalesPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const supabase = createClient()

  useEffect(() => {
    if (!isAdmin) return
    load()
  }, [isAdmin])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('id, customer_name, customer_email, items, amount, status, created_at')
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
    setLoading(false)
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <p className="text-stone-400 text-sm">管理者権限が必要です</p>
      </main>
    )
  }

  // --- Calculations (JST) ---
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const todayStr = nowJST.toISOString().slice(0, 10)
  const monthStr = nowJST.toISOString().slice(0, 7)

  const todayOrders = orders.filter(o => o.created_at?.slice(0, 10) === todayStr)
  const todayTotal = todayOrders.reduce((s, o) => s + o.amount, 0)

  const monthOrders = orders.filter(o => o.created_at?.slice(0, 7) === monthStr)
  const monthTotal = monthOrders.reduce((s, o) => s + o.amount, 0)

  // Past 6 months aggregation
  const monthlyData: MonthData[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(nowJST)
    d.setMonth(d.getMonth() - i)
    const key = d.toISOString().slice(0, 7)
    const mo = orders.filter(o => o.created_at?.slice(0, 7) === key)
    monthlyData.push({ month: key, count: mo.length, total: mo.reduce((s, o) => s + o.amount, 0) })
  }
  const maxMonthTotal = Math.max(...monthlyData.map(m => m.total), 1)

  const statusLabel: Record<string, { text: string; bg: string; fg: string }> = {
    paid: { text: '入金済', bg: '#14532d', fg: '#86efac' },
    shipped: { text: '発送済', bg: '#1e3a5f', fg: '#93c5fd' },
    pending_bank_transfer: { text: '振込待', bg: '#78350f', fg: '#fcd34d' },
    completed: { text: '完了', bg: '#14532d', fg: '#86efac' },
  }

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#1c1917' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button onClick={() => router.push('/admin')} className="text-stone-400 text-sm">←</button>
          <div>
            <h1 className="text-lg font-semibold tracking-wider text-white">EC売上</h1>
            <p className="text-xs text-stone-500">売上集計・注文一覧</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">
        {loading ? (
          <p className="text-center text-stone-500 text-sm py-12">読み込み中...</p>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#292524' }}>
                <p className="text-xs text-stone-500 tracking-wider mb-1">TODAY</p>
                <p className="text-2xl font-light text-white">¥{todayTotal.toLocaleString()}</p>
                <p className="text-xs text-stone-500 mt-1">{todayOrders.length}件</p>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#292524' }}>
                <p className="text-xs text-stone-500 tracking-wider mb-1">{monthStr.slice(5)}月</p>
                <p className="text-2xl font-light text-white">¥{monthTotal.toLocaleString()}</p>
                <p className="text-xs text-stone-500 mt-1">{monthOrders.length}件</p>
              </div>
            </div>

            {/* Monthly Bar Chart */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#292524' }}>
              <p className="text-xs text-stone-500 tracking-wider mb-3">月別推移</p>
              <div className="flex items-end gap-2 h-24">
                {monthlyData.map(m => {
                  const pct = maxMonthTotal > 0 ? (m.total / maxMonthTotal) * 100 : 0
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full rounded-t-md transition-all" style={{
                        height: `${Math.max(pct, 2)}%`,
                        backgroundColor: m.month === monthStr ? '#5eead4' : '#44403c',
                      }} />
                      <p className="text-[10px] text-stone-500">{m.month.slice(5)}月</p>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between mt-2">
                {monthlyData.map(m => (
                  <p key={m.month} className="flex-1 text-center text-[10px] text-stone-600">
                    {m.total > 0 ? `¥${(m.total / 1000).toFixed(0)}k` : '-'}
                  </p>
                ))}
              </div>
            </div>

            {/* Order List */}
            <div className="space-y-2">
              <p className="text-xs text-stone-500 tracking-wider px-1">注文一覧</p>
              {orders.length === 0 ? (
                <p className="text-center text-stone-500 text-sm py-8">注文はまだありません</p>
              ) : (
                orders.map(order => {
                  const st = statusLabel[order.status] || { text: order.status, bg: '#44403c', fg: '#d6d3d1' }
                  return (
                    <div key={order.id} className="rounded-2xl p-4 space-y-2" style={{ backgroundColor: '#292524' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{order.customer_name}</p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            {new Date(order.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
                          </p>
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                          <p className="text-sm font-medium text-white">¥{order.amount.toLocaleString()}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: st.bg, color: st.fg }}>
                            {st.text}
                          </span>
                        </div>
                      </div>
                      {order.items?.length > 0 && (
                        <p className="text-xs text-stone-500">
                          {order.items.map((item, i) => (
                            <span key={i}>{item.name} ×{item.qty}{i < order.items.length - 1 ? '、' : ''}</span>
                          ))}
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
