'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LivePage() {
  const [records, setRecords] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    loadRecords()
    const channel = supabase.channel('timeclock-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timeclock' }, loadRecords)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadRecords() {
    const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const today = nowJst.toISOString().slice(0, 10)
    const { data } = await supabase.from('timeclock')
      .select('*, staff(name, skill)')
      .gte('clock_in', `${today}T00:00:00+09:00`)
      .lte('clock_in', `${today}T23:59:59+09:00`)
      .order('clock_in')
    setRecords(data ?? [])
  }

  function calcHours(clockIn: string, clockOut: string | null) {
    const diff = ((clockOut ? new Date(clockOut) : now).getTime() - new Date(clockIn).getTime()) / 3600000
    return diff.toFixed(1)
  }

  const active = records.filter(r => !r.clock_out)
  const done = records.filter(r => r.clock_out)
  const totalHours = records.reduce((sum, r) => sum + parseFloat(calcHours(r.clock_in, r.clock_out)), 0)

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="text-stone-400">←</button>
          <div>
            <h1 className="text-lg font-bold tracking-widest text-stone-800">在籍状況</h1>
            <p className="text-xs text-stone-400">{now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
          </div>
        </div>
        <p className="text-2xl font-light text-stone-800" style={{ fontFamily: 'Georgia, serif' }}>
          {String(now.getHours()).padStart(2,'0')}:{String(now.getMinutes()).padStart(2,'0')}
        </p>
      </div>

      {/* 現在在籍中 */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <p className="text-sm font-medium text-stone-700">現在在籍中 {active.length}名</p>
        </div>
        {active.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center text-stone-400 text-sm shadow-sm">
            現在在籍中のスタッフはいません
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(r => (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const n = (r.staff as any)?.name ?? ''
                    const isKitchen = ['荒波','竹内'].some(k => n.includes(k))
                    return <div className={'w-2.5 h-2.5 rounded-full flex-shrink-0 ' + (isKitchen ? 'bg-orange-400' : 'bg-teal-500')} />
                  })()}
                  <div>
                  <p className="font-medium text-stone-800">{(r.staff as any)?.name}</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {new Date(r.clock_in).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 出勤
                  </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-medium ${parseFloat(calcHours(r.clock_in, null)) >= 7 ? 'text-amber-500' : 'text-teal-600'}`}>
                    {calcHours(r.clock_in, null)}h
                  </p>
                  <p className="text-xs text-stone-400">勤務中</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 退勤済み */}
      {done.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium text-stone-400 mb-3">退勤済み {done.length}名</p>
          <div className="space-y-2">
            {done.map(r => (
              <div key={r.id} className="bg-white/70 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-stone-500">{(r.staff as any)?.name}</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {new Date(r.clock_in).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜{new Date(r.clock_out).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <p className="text-stone-500 font-medium">{calcHours(r.clock_in, r.clock_out)}h</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm flex justify-between items-center">
          <span className="text-sm text-stone-500">本日合計</span>
          <span className="font-bold text-stone-800">{totalHours.toFixed(1)}h</span>
        </div>
      )}

      <button onClick={loadRecords}
        className="mt-4 w-full py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-500 shadow-sm">
        🔄 更新
      </button>
    </main>
  )
}
