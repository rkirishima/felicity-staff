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
  name_kana: string | null
  email: string | null
  phone: string | null
  active: boolean
}

export default function ClientsListPage() {
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
        .from('keiri_clients')
        .select('id, name, name_kana, email, phone, active')
        .order('name')
      if (!showAll) qb = qb.eq('active', true)
      const { data } = await qb
      setRows((data ?? []) as Row[])
      setLoading(false)
    })()
  }, [router, supabase, showAll])

  const filtered = q
    ? rows.filter(r =>
        (r.name + (r.name_kana ?? '')).toLowerCase().includes(q.toLowerCase()),
      )
    : rows

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">取引先</h1>
          <Link href="/admin/keiri/clients/new" className="text-sm text-stone-700">+ 追加</Link>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="名前・カナで検索"
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
          <p className="text-center text-stone-400 text-sm py-12">取引先がありません</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map(r => (
              <li key={r.id}>
                <Link
                  href={`/admin/keiri/clients/${r.id}`}
                  className={`block bg-white rounded-2xl shadow-sm p-4 ${r.active ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-800">{r.name}</p>
                    {!r.active && <span className="text-[10px] text-stone-400">アーカイブ済</span>}
                  </div>
                  {r.name_kana && <p className="text-xs text-stone-500 mt-0.5">{r.name_kana}</p>}
                  {(r.email || r.phone) && (
                    <p className="text-xs text-stone-400 mt-1">
                      {[r.email, r.phone].filter(Boolean).join(' ・ ')}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
