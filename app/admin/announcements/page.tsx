'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { togglePublished } from './actions'

function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

type Row = {
  id: string
  title: string
  banner_text: string
  type: string
  start_date: string
  end_date: string
  event_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  published: boolean
  priority: number
}

const TYPE_LABEL: Record<string, string> = {
  closure: '🏷 貸切・休業',
  event: '🎉 イベント',
  menu: '☕ メニュー',
  other: '📌 その他',
}

type Tab = 'active' | 'upcoming' | 'past' | 'all'

export default function AnnouncementsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('active')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('announcements')
        .select('id, title, banner_text, type, start_date, end_date, event_date, event_start_time, event_end_time, published, priority')
        .order('start_date', { ascending: false })
      if (cancelled) return
      setRows((data ?? []) as Row[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, reload])

  const today = todayJST()
  const filtered = rows.filter(r => {
    if (tab === 'all') return true
    if (tab === 'active') return r.start_date <= today && r.end_date >= today
    if (tab === 'upcoming') return r.start_date > today
    if (tab === 'past') return r.end_date < today
    return true
  })

  async function handleToggle(r: Row): Promise<void> {
    try {
      await togglePublished(r.id, !r.published)
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'failed')
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">告知</h1>
          <Link
            href="/admin/announcements/new"
            className="text-sm text-emerald-700 px-3 py-1.5 bg-white rounded-xl shadow-sm"
          >
            + 新規
          </Link>
        </div>

        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm">
          {([
            { k: 'active' as Tab, label: '公開中' },
            { k: 'upcoming' as Tab, label: '予約' },
            { k: 'past' as Tab, label: '終了' },
            { k: 'all' as Tab, label: '全て' },
          ]).map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 text-xs rounded-xl transition ${
                tab === k ? 'bg-stone-800 text-white font-medium' : 'text-stone-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-stone-500 text-sm mb-3">該当する告知はありません</p>
            <Link
              href="/admin/announcements/new"
              className="inline-block bg-stone-800 text-white py-2 px-4 rounded-xl text-sm"
            >
              新しい告知を作成
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(r => {
              const isActive = r.start_date <= today && r.end_date >= today
              return (
                <li
                  key={r.id}
                  className={`bg-white rounded-2xl shadow-sm p-4 ${
                    !r.published ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/admin/announcements/${r.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded">
                          {TYPE_LABEL[r.type] ?? r.type}
                        </span>
                        {isActive && r.published && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                            公開中
                          </span>
                        )}
                        {!r.published && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-500 rounded">
                            非公開
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-stone-800 truncate">{r.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5 truncate">{r.banner_text}</p>
                      <p className="text-[10px] text-stone-400 mt-1">
                        掲載 {r.start_date} 〜 {r.end_date}
                        {r.event_date && (
                          <>
                            {' '}・対象日 {r.event_date}
                            {r.event_start_time && r.event_end_time && (
                              <>
                                {' '}
                                {r.event_start_time.slice(0, 5)}〜{r.event_end_time.slice(0, 5)}
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </Link>
                    <button
                      onClick={() => handleToggle(r)}
                      className="text-xs text-stone-500 hover:text-stone-700 px-2"
                    >
                      {r.published ? '非公開' : '公開'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
          <p className="font-medium">公開API</p>
          <p>
            felicity-web から <code>GET /api/announcements/active</code> で公開中の告知を取得できます。掲載期間（start_date〜end_date）が今日を含み、公開ONの行のみ返ります。
          </p>
        </div>
      </div>
    </main>
  )
}
