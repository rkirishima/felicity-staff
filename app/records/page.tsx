'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function RecordsPage() {
  const [temps, setTemps] = useState<any[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.from('temperature_logs')
      .select('*')
      .gte('date', `${month}-01`)
      .lte('date', `${month}-31`)
      .order('date', { ascending: false })
      .then(({ data }) => setTemps(data ?? []))
  }, [month])

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <h1 className="text-lg font-bold tracking-widest text-stone-800 mb-4">記録</h1>

      <div className="grid grid-cols-2 gap-3 mb-6">
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

      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-stone-700">🌡️ 温度記録</p>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border border-stone-200 rounded-lg px-2 py-1 text-xs bg-white" />
        </div>
        {temps.length === 0 ? (
          <p className="text-xs text-stone-400 text-center py-4">記録がありません</p>
        ) : (
          <div className="space-y-2">
            {temps.map(t => (
              <div key={t.id} className="bg-stone-50 rounded-xl px-3 py-3">
                <p className="text-xs text-stone-400 mb-2">{t.date}</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  <div>
                    <p className="text-stone-400">冷蔵庫</p>
                    <p className="font-medium text-stone-700 text-sm">{t.fridge_temp}°C</p>
                  </div>
                  <div>
                    <p className="text-stone-400">コールドテーブル</p>
                    <p className="font-medium text-stone-700 text-sm">{t.cold_table_temp}°C</p>
                  </div>
                  <div>
                    <p className="text-stone-400">冷凍庫</p>
                    <p className="font-medium text-stone-700 text-sm">{t.freezer_temp}°C</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
