'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'

type Row = {
  id: string
  name: string
  unit_price: number
  tax_rate: number
  unit: string | null
  active: boolean
  category: { name: string } | null
}

export default function ItemsListPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      setLoading(true)
      let qb = supabase
        .from('keiri_items')
        .select('id, name, unit_price, tax_rate, unit, active, category:keiri_categories(name)')
        .order('name')
      if (!showAll) qb = qb.eq('active', true)
      const { data } = await qb
      setRows((data ?? []) as unknown as Row[])
      setLoading(false)
    })()
  }, [router, supabase, showAll])

  const filtered = q ? rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase())) : rows

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">商品マスタ</h1>
          <Link href="/admin/keiri/items/new" className="text-sm text-stone-700">+ 追加</Link>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="商品名で検索"
            className="flex-1 bg-white rounded-xl px-3 py-2 text-sm border border-stone-200 outline-none focus:border-stone-400"
          />
          <label className="text-xs text-stone-600 flex items-center gap-1">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            全件
          </label>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-stone-400 text-sm py-12">商品がありません</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map(r => (
              <li key={r.id}>
                <Link
                  href={`/admin/keiri/items/${r.id}`}
                  className={`block bg-white rounded-2xl shadow-sm p-4 ${r.active ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-800">{r.name}</p>
                    <p className="text-sm text-stone-700">
                      ¥{r.unit_price.toLocaleString()} <span className="text-xs text-stone-400">/{r.unit ?? '個'} ({r.tax_rate}%)</span>
                    </p>
                  </div>
                  {r.category?.name && (
                    <p className="text-xs text-stone-500 mt-0.5">{r.category.name}</p>
                  )}
                  {!r.active && <p className="text-[10px] text-stone-400 mt-1">アーカイブ済</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
