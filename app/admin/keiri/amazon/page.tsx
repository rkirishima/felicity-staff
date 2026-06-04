'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { updateAmazonItemCategory, deleteAmazonOrder } from './actions'
import { toast } from 'sonner'

function thisMonthJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

function monthOptions(count = 24): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`
    list.push({ value, label })
  }
  return list
}

type Order = {
  id: string
  order_id: string
  order_date: string
  total_amount: number
  tax_amount: number | null
  payment_instrument: string | null
}

type OrderItem = {
  id: string
  order_id: string
  item_name: string
  quantity: number
  total_amount: number
  tax_rate: number | null
  expense_category_id: string | null
  classification_source: string
}

type Category = {
  id: string
  name: string
  type: string
}

export default function AmazonPage() {
  const router = useRouter()
  const supabase = createClient()
  const [month, setMonth] = useState(thisMonthJST())
  const months = monthOptions(24)
  const [orders, setOrders] = useState<Order[]>([])
  const [items, setItems] = useState<OrderItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    const start = `${month}-01`
    const [y, m] = month.split('-').map(s => parseInt(s, 10))
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [oRes, cRes] = await Promise.all([
        supabase
          .from('keiri_amazon_orders')
          .select('id, order_id, order_date, total_amount, tax_amount, payment_instrument')
          .gte('order_date', start)
          .lt('order_date', next)
          .order('order_date', { ascending: false }),
        supabase
          .from('keiri_categories')
          .select('id, name, type')
          .eq('type', 'expense')
          .eq('active', true)
          .order('sort_order'),
      ])
      if (cancelled) return
      const os = (oRes.data ?? []) as Order[]
      setOrders(os)
      setCategories((cRes.data ?? []) as Category[])
      const ids = os.map(o => o.order_id)
      if (ids.length > 0) {
        const { data: itRes } = await supabase
          .from('keiri_amazon_order_items')
          .select('id, order_id, item_name, quantity, total_amount, tax_rate, expense_category_id, classification_source')
          .in('order_id', ids)
        if (!cancelled) setItems((itRes ?? []) as OrderItem[])
      } else {
        setItems([])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [month, router, supabase, reload])

  const monthTotal = orders.reduce((s, o) => s + o.total_amount, 0)
  const monthTax = orders.reduce((s, o) => s + (o.tax_amount ?? 0), 0)
  const unclassifiedCount = items.filter(i => !i.expense_category_id).length

  const itemsByOrder = new Map<string, OrderItem[]>()
  for (const it of items) {
    const arr = itemsByOrder.get(it.order_id) ?? []
    arr.push(it)
    itemsByOrder.set(it.order_id, arr)
  }

  async function changeCategory(itemId: string, categoryId: string) {
    try {
      await updateAmazonItemCategory(itemId, categoryId || null)
      toast.success('分類を更新しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失敗')
    }
  }

  async function removeOrder(id: string, orderId: string) {
    if (!confirm(`注文 ${orderId} を削除しますか？\n紐づく経費も削除されます。`)) return
    try {
      await deleteAmazonOrder(id)
      toast.success('削除しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '削除失敗')
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between h-12">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">Amazon Business</h1>
          <Link
            href="/admin/keiri/amazon/import"
            className="text-sm text-orange-700 px-3 py-1.5 bg-white rounded-xl shadow-sm"
          >
            + CSV取込
          </Link>
        </div>

        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        >
          {months.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
          <p className="text-xs text-orange-700 tracking-wider">📦 月合計</p>
          <p className="text-3xl font-light text-orange-900 mt-1 tabular-nums">¥{monthTotal.toLocaleString()}</p>
          <p className="text-xs text-orange-600 mt-1">
            {orders.length}注文 ／ 消費税 ¥{monthTax.toLocaleString()}
            {unclassifiedCount > 0 && (
              <span className="ml-2 text-amber-700 font-medium">／ 未分類 {unclassifiedCount}件</span>
            )}
          </p>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-500 text-sm mb-2">この月のAmazon注文はありません</p>
            <p className="text-stone-400 text-xs">「+ CSV取込」で取り込めます</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map(o => {
              const lineItems = itemsByOrder.get(o.order_id) ?? []
              return (
                <li key={o.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex justify-between items-baseline">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-700">
                        {new Date(o.order_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                      </p>
                      <p className="text-[10px] text-stone-400 truncate">{o.order_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-medium text-orange-700 tabular-nums">¥{o.total_amount.toLocaleString()}</p>
                      {o.payment_instrument && (
                        <p className="text-[10px] text-stone-400">{o.payment_instrument}</p>
                      )}
                    </div>
                  </div>
                  <ul className="divide-y divide-stone-100">
                    {lineItems.map(it => (
                      <li key={it.id} className="px-4 py-2 space-y-1">
                        <div className="flex justify-between items-baseline text-sm gap-2">
                          <span className="text-stone-800 flex-1">
                            {it.item_name}
                            {it.quantity > 1 && <span className="text-stone-500"> ×{it.quantity}</span>}
                          </span>
                          <span className="tabular-nums text-stone-700 whitespace-nowrap">
                            ¥{it.total_amount.toLocaleString()}
                            {it.tax_rate !== null && <span className="text-stone-400 ml-1 text-[10px]">[{it.tax_rate}%]</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={it.expense_category_id ?? ''}
                            onChange={e => changeCategory(it.id, e.target.value)}
                            className={`text-xs border rounded px-2 py-1 flex-1 ${
                              it.expense_category_id
                                ? it.classification_source === 'manual'
                                  ? 'border-emerald-300 bg-emerald-50'
                                  : it.classification_source === 'learned'
                                    ? 'border-blue-200 bg-blue-50'
                                    : 'border-stone-200 bg-white'
                                : 'border-amber-300 bg-amber-50'
                            }`}
                          >
                            <option value="">未分類</option>
                            {categories.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          {it.classification_source === 'manual' && (
                            <span className="text-[10px] text-emerald-600">手動</span>
                          )}
                          {it.classification_source === 'learned' && (
                            <span className="text-[10px] text-blue-600">学習</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="px-4 py-2 border-t border-stone-100 flex justify-end">
                    <button onClick={() => removeOrder(o.id, o.order_id)} className="text-[10px] text-rose-500">
                      削除
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
