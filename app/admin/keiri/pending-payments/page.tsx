'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { markInvoicePaid } from '@/app/admin/keiri/invoices/actions'
import { markOrderPaid } from './actions'
import { LoadError } from '@/components/keiri/LoadError'

type InvoiceRow = {
  id: string
  invoice_number: string | null
  issue_date: string
  due_date: string | null
  total: number
  client: { name: string } | null
}

type OrderRow = {
  id: string
  customer_name: string | null
  amount: number
  created_at: string
}

function daysSince(date: string): number {
  const t = new Date(date).getTime()
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
}

function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function PendingPaymentsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [resyncing, setResyncing] = useState(false)

  const load = async () => {
    setLoading(true)
    setLoadErr(null)
    const [invRes, ordRes] = await Promise.all([
      supabase
        .from('keiri_invoices')
        .select('id, invoice_number, issue_date, due_date, total, client:keiri_clients(name)')
        .eq('status', 'sent')
        .order('issue_date', { ascending: false }),
      supabase
        .from('orders')
        .select('id, customer_name, amount, created_at')
        .eq('status', 'pending_bank_transfer')
        .order('created_at', { ascending: false }),
    ])
    const firstErr = [invRes, ordRes].map(r => r?.error).find(Boolean)
    setLoadErr(firstErr ? firstErr.message : null)
    setInvoices((invRes.data ?? []) as unknown as InvoiceRow[])
    setOrders((ordRes.data ?? []) as OrderRow[])
    setLoading(false)
  }

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    load()
  }, [router])

  async function confirmInvoice(inv: InvoiceRow) {
    if (!confirm(`${inv.invoice_number ?? '請求書'} (¥${inv.total.toLocaleString('ja-JP')}) を入金済みにします。よろしいですか？`)) return
    setWorking(inv.id)
    try {
      await markInvoicePaid(inv.id, todayJST())
      toast.success('入金済みにしました')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗')
    } finally {
      setWorking(null)
    }
  }

  async function squareResync() {
    const month = todayJST().slice(0, 7)
    setResyncing(true)
    try {
      const res = await fetch(`/api/keiri/square-sync-history?from=${month}&to=${month}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `status ${res.status}`)
      }
      toast.success('Square を再同期しました')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Square再同期失敗')
    } finally {
      setResyncing(false)
    }
  }

  async function confirmOrder(order: OrderRow) {
    if (!confirm(`注文 ${order.customer_name ?? ''} (¥${order.amount.toLocaleString('ja-JP')}) を入金済みにします。よろしいですか？`)) return
    setWorking(order.id)
    try {
      await markOrderPaid(order.id)
      toast.success('入金済みにしました')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '失敗')
    } finally {
      setWorking(null)
    }
  }

  const today = todayJST()
  const totalInvoices = invoices.reduce((s, i) => s + i.total, 0)
  const totalOrders = orders.reduce((s, o) => s + o.amount, 0)
  const total = totalInvoices + totalOrders
  const count = invoices.length + orders.length

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between h-12">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">未収金</h1>
          <button
            onClick={squareResync}
            disabled={resyncing}
            className="text-xs text-stone-600 px-3 py-1.5 bg-white rounded-xl shadow-sm disabled:opacity-50"
          >
            {resyncing ? '同期中…' : '🔄 Square再同期'}
          </button>
        </div>

        <LoadError message={loadErr} />

        <div className="bg-amber-50 border border-amber-200 rounded-2xl shadow-sm p-5">
          <p className="text-xs text-amber-700 tracking-wider">🔶 合計</p>
          <p className="text-3xl font-light text-amber-900 mt-1">¥{total.toLocaleString('ja-JP')}</p>
          <p className="text-xs text-amber-600 mt-1">
            請求書 {invoices.length}件 ¥{totalInvoices.toLocaleString('ja-JP')} / EC 銀行振込 {orders.length}件 ¥{totalOrders.toLocaleString('ja-JP')}
          </p>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : count === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-400 text-sm">未収金はありません 🎉</p>
          </div>
        ) : (
          <>
            {invoices.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 text-xs text-stone-500 tracking-wider">
                  📨 請求書（未入金）
                </div>
                {invoices.map(inv => {
                  const overdue = inv.due_date && inv.due_date < today
                  const elapsedDays = daysSince(inv.issue_date)
                  return (
                    <div
                      key={inv.id}
                      className="px-4 py-3 border-b border-stone-100 last:border-b-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-stone-800 truncate">
                            {inv.client?.name ?? '取引先不明'}
                          </p>
                          {overdue && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                              期限超過
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {inv.invoice_number ?? '-'}・発行 {elapsedDays}日経過
                          {inv.due_date ? `（期限 ${inv.due_date}）` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-stone-800 tabular-nums">
                          ¥{inv.total.toLocaleString('ja-JP')}
                        </p>
                        <button
                          onClick={() => confirmInvoice(inv)}
                          disabled={working === inv.id}
                          className="mt-1 text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                        >
                          {working === inv.id ? '作業中…' : '✅ 入金確認'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {orders.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 text-xs text-stone-500 tracking-wider">
                  🛍 EC 銀行振込（入金待ち）
                </div>
                {orders.map(order => {
                  const elapsedDays = daysSince(order.created_at)
                  const stale = elapsedDays >= 3
                  return (
                    <div
                      key={order.id}
                      className="px-4 py-3 border-b border-stone-100 last:border-b-0 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-stone-800 truncate">
                            {order.customer_name ?? '顧客不明'}
                          </p>
                          {stale && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              {elapsedDays}日経過
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5">{order.id}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-stone-800 tabular-nums">
                          ¥{order.amount.toLocaleString('ja-JP')}
                        </p>
                        <button
                          onClick={() => confirmOrder(order)}
                          disabled={working === order.id}
                          className="mt-1 text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                        >
                          {working === order.id ? '作業中…' : '✅ 入金確認'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
