'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function RecordsPage() {
  const [temps, setTemps] = useState<any[]>([])
  const [cleanings, setCleanings] = useState<any[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const [tab, setTab] = useState<'temp' | 'cleaning'>('temp')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.from('temperature_logs')
      .select('*').gte('date', `${month}-01`).lte('date', `${month}-31`)
      .order('date', { ascending: false })
      .then(({ data }) => setTemps(data ?? []))
    supabase.from('cleaning_logs')
      .select('*, staff(name)').gte('date', `${month}-01`).lte('date', `${month}-31`)
      .order('date', { ascending: false })
      .then(({ data }) => setCleanings(data ?? []))
  }, [month])

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <h1 className="text-lg font-bold tracking-widest text-stone-800 mb-4">記録</h1>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <button onClick={() => router.push('/timeclock')}
          className="bg-white rounded-2xl p-4 shadow-sm text-left">
          <div className="text-xl mb-1">🕐</div>
          <p className="text-sm font-medium text-stone-700">打刻修正リクエスト</p>
          <p className="text-xs text-stone-400 mt-0.5">押し忘れはこちら</p>
        </button>
        <button onClick={() => router.push('/admin/timeclock')}
          className="bg-white rounded-2xl p-4 shadow-sm text-left">
          <div className="text-xl mb-1">📊</div>
          <p className="text-sm font-medium text-stone-700">勤怠記録</p>
          <p className="text-xs text-stone-400 mt-0.5">月次・CSV出力</p>
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2">
          <button onClick={() => setTab('temp')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${tab === 'temp' ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
            🌡️ 温度
          </button>
          <button onClick={() => setTab('cleaning')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${tab === 'cleaning' ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
            🧹 清掃
          </button>
        </div>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border border-stone-200 rounded-lg px-2 py-1 text-xs bg-white" />
      </div>

      {tab === 'temp' && (
        <div className="space-y-2">
          {temps.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">記録がありません</div>
          ) : temps.map(t => (
            <div key={t.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
              <p className="text-xs text-stone-400 mb-2">{t.date}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-stone-400">冷蔵庫</p>
                  <p className="font-medium text-stone-800">{t.fridge_temp}°C</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400">コールドテーブル</p>
                  <p className="font-medium text-stone-800">{t.cold_table_temp}°C</p>
                </div>
                <div>
                  <p className="text-xs text-stone-400">冷凍庫</p>
                  <p className="font-medium text-stone-800">{t.freezer_temp}°C</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'cleaning' && (
        <div className="space-y-2">
          {cleanings.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">記録がありません</div>
          ) : cleanings.map(c => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-stone-700">
                  {c.type === 'grease_trap' ? '🪣 グリストラップ' : '✨ 天井清掃'}
                </p>
                <p className="text-xs text-stone-400 mt-0.5">{c.date}</p>
                {c.note && <p className="text-xs text-stone-400">{c.note}</p>}
              </div>
              <span className="text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded-full">完了</span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
