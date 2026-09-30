import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MarkPaidButton } from './MarkPaidButton'

// 業販（felicity.cafe/wholesale）の注文一覧と入金確認。
// wholesale_orders は RLS で anon から読めないため、サーバーで service role を使って読む。
export const dynamic = 'force-dynamic'

type Order = {
  id: string
  company: string
  created_at: string
  paid_at: string | null
  status: string
  payment_method: string
  total_kg: number
  amount: number
  items: { name: string; nameJa?: string; kg: number }[]
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_bank_transfer: { label: '入金待ち', cls: 'bg-amber-50 text-amber-700' },
  paid: { label: '入金済み', cls: 'bg-emerald-50 text-emerald-700' },
  pending_payment: { label: 'カード未完了', cls: 'bg-stone-100 text-stone-500' },
}

const jst = (iso: string) =>
  new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })
const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`

export default async function WholesaleOrdersAdminPage() {
  const session = await getSession()
  if (!session || (session.role !== 'admin' && session.role !== 'accountant')) redirect('/admin')

  const sb = createAdminClient()
  const { data } = await sb
    .from('wholesale_orders')
    .select('id, company, created_at, paid_at, status, payment_method, total_kg, amount, items')
    .order('created_at', { ascending: false })
    .limit(200)
  const orders = (data ?? []) as Order[]
  const waiting = orders.filter((o) => o.status === 'pending_bank_transfer')
  const waitingTotal = waiting.reduce((s, o) => s + o.amount, 0)

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-3xl mx-auto px-4 pt-12">
        <Link href="/admin/keiri" className="text-xs text-stone-400">← 経理</Link>
        <h1 className="mt-2 text-lg font-bold tracking-wider text-stone-800">業販注文</h1>
        <p className="mt-1 text-xs text-stone-500">
          銀行振込の注文は、入金を確認したら「入金確認」を押してください。取引先の注文履歴に領収書が出ます。
        </p>

        <div className="mt-5 rounded-lg bg-white border border-stone-100 p-4 flex justify-between text-sm">
          <span className="text-stone-500">入金待ち</span>
          <span className="font-semibold text-stone-800">{waiting.length}件　{yen(waitingTotal)}</span>
        </div>

        {orders.length === 0 ? (
          <p className="mt-8 text-sm text-stone-400">まだ業販の注文はありません。</p>
        ) : (
          <ul className="mt-5 space-y-2">
            {orders.map((o) => {
              const st = STATUS[o.status] ?? { label: o.status, cls: 'bg-stone-100 text-stone-500' }
              return (
                <li key={o.id} className="rounded-lg bg-white border border-stone-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{o.company}</p>
                      <p className="text-[11px] text-stone-400 font-mono">{o.id}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-stone-800">{yen(o.amount)}</p>
                      <span className={`inline-block mt-1 rounded px-2 py-0.5 text-[11px] ${st.cls}`}>
                        {st.label}
                        {o.status === 'paid' && o.paid_at ? ` ${jst(o.paid_at)}` : ''}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    {jst(o.created_at)} 注文・{o.payment_method === 'card' ? 'カード' : '振込'}・
                    {o.items.map((it) => `${it.nameJa ?? it.name} ${it.kg}kg`).join('、')}
                  </p>
                  {o.status === 'pending_bank_transfer' && (
                    <div className="mt-3 pt-3 border-t border-stone-100 flex justify-end">
                      <MarkPaidButton orderId={o.id} amount={o.amount} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
