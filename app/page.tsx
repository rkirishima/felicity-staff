'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Staff = { id: string; name: string; role: string }

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export default function HomePage() {
  const [staffList, setStaffList] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())
  const [done, setDone] = useState(null)
  const [showCheckPrompt, setShowCheckPrompt] = useState(null)
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    getSupabase().from('staff').select('id, name, role')
      .eq('active', true).not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaffList(data ?? []))
  }, [])

  function handleSelect(s) {
    if (s.role === 'admin') { router.push('/admin'); return }
    setSelected(selected?.id === s.id ? null : s)
    setDone(null)
    setShowCheckPrompt(null)
  }

  async function handleClock(type) {
    if (!selected) return
    setLoading(true)
    const sb = getSupabase()
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

    if (type === 'in') {
      await sb.from('timeclock').insert({ staff_id: selected.id, clock_in: new Date().toISOString() })
      setDone({ type: 'in', time: timeStr, name: selected.name.split(' ')[0] })
      toast.success(selected.name.split(' ')[0] + 'さん、おはようございます')
      // 今日の最初の出勤者か確認
      const today = new Date().toISOString().slice(0, 10)
      const { data: todayRecords } = await sb.from('timeclock')
        .select('id').gte('clock_in', today + 'T00:00:00').lte('clock_in', today + 'T23:59:59')
      if (todayRecords && todayRecords.length <= 1) {
        setTimeout(() => setShowCheckPrompt('opening'), 1500)
      }
    } else {
      await sb.from('timeclock').update({ clock_out: new Date().toISOString() })
        .eq('staff_id', selected.id).is('clock_out', null)
      setDone({ type: 'out', time: timeStr, name: selected.name.split(' ')[0] })
      toast.success(selected.name.split(' ')[0] + 'さん、お疲れ様でした')
      setTimeout(() => setShowCheckPrompt('closing'), 1500)
    }
    setLoading(false)
  }

  const H = String(now.getHours()).padStart(2,'0')
  const M = String(now.getMinutes()).padStart(2,'0')
  const S = String(now.getSeconds()).padStart(2,'0')
  const dateStr = now.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'long' })

  // チェックリストに進むか確認
  if (showCheckPrompt) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-4xl">{showCheckPrompt === 'opening' ? '🌅' : '🌙'}</div>
        <div className="text-center">
          <p className="text-xl font-medium text-stone-800 mb-1">
            {showCheckPrompt === 'opening' ? 'オープン作業' : 'クローズ作業'}
          </p>
          <p className="text-stone-400 text-sm">チェックリストに進みますか？</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={() => router.push('/operations?type=' + showCheckPrompt)}
            className="w-full py-4 rounded-2xl text-lg font-medium tracking-widest text-white transition-all"
            style={{ backgroundColor: '#1c1917' }}>
            チェックリストへ
          </button>
          <button onClick={() => { setSelected(null); setDone(null); setShowCheckPrompt(null) }}
            className="w-full py-4 rounded-2xl text-sm border-2 border-stone-300 text-stone-500">
            あとで
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <Image src="https://felicity.cafe/felicity-logo.png" alt="Felicity"
          width={110} height={42} className="object-contain mb-6 opacity-80" unoptimized />
        <div className="text-center">
          <div className="flex items-end justify-center gap-1">
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize: '72px', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{H}</span>
            <span className="font-light text-stone-300 mb-2" style={{ fontSize: '48px', fontFamily: 'Georgia, serif' }}>:</span>
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize: '72px', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{M}</span>
            <span className="font-light text-stone-300 mb-2 ml-1 tabular-nums" style={{ fontSize: '24px', fontFamily: 'Georgia, serif' }}>{S}</span>
          </div>
          <p className="text-xs tracking-widest text-stone-400 mt-2">{dateStr}</p>
        </div>
      </div>

      <div className="mx-8 border-t border-stone-200 mb-6" />

      <div className="flex-1 flex flex-col px-6 pb-24">
        {!selected ? (
          <>
            <p className="text-xs tracking-widest text-stone-400 text-center mb-4 uppercase">Select Staff</p>
            <div className="grid grid-cols-3 gap-2">
              {staffList.map(s => (
                <button key={s.id} onClick={() => handleSelect(s)}
                  className={"py-3 px-2 rounded-2xl text-sm font-medium transition-all shadow-sm " + (s.role === 'admin' ? 'bg-white border-2 border-teal-300 text-teal-700' : 'bg-white text-stone-700 hover:shadow-md')}>
                  <div className="text-xs font-normal text-stone-400">{s.name.split(' ')[0]}</div>
                  <div>{s.name.split(' ')[1] || ''}</div>
                </button>
              ))}
            </div>
          </>
        ) : done ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div style={{ fontSize: '56px' }}>{done.type === 'in' ? '👋' : '✨'}</div>
            <div className="text-center">
              <p className="text-2xl font-medium text-stone-800">{done.name}</p>
              <p className="text-stone-400 text-sm mt-1">{done.type === 'in' ? '出勤' : '退勤'} {done.time}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <div className="text-center">
              <p className="text-xs tracking-widest text-stone-400 uppercase mb-1">打刻</p>
              <p className="text-2xl font-medium text-stone-800">{selected.name}</p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button onClick={() => handleClock('in')} disabled={loading}
                className="w-full py-5 rounded-2xl text-lg font-medium tracking-widest transition-all disabled:opacity-50"
                style={{ backgroundColor: '#1c1917', color: 'white' }}>
                出 勤
              </button>
              <button onClick={() => handleClock('out')} disabled={loading}
                className="w-full py-5 rounded-2xl text-lg font-medium tracking-widest border-2 border-stone-300 text-stone-600 hover:border-stone-500 transition-all disabled:opacity-50">
                退 勤
              </button>
              <button onClick={() => setSelected(null)} className="text-stone-400 text-xs text-center mt-1">
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
