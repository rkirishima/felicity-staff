'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function PayrollPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [summary, setSummary] = useState<any[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const [editId, setEditId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [tab, setTab] = useState<'summary' | 'rates'>('summary')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { loadStaff() }, [])
  useEffect(() => { loadSummary() }, [month])

  async function loadStaff() {
    const { data } = await supabase.from('staff')
      .select('id, name, hourly_rate, employment_type, skill')
      .eq('active', true).not('role', 'in', '("accountant","admin")').order('name')
    setStaff(data ?? [])
  }

  async function loadSummary() {
    const { data: records } = await supabase.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate)')
      .gte('clock_in', `${month}-01T00:00:00`)
      .lte('clock_in', `${month}-31T23:59:59`)
    
    const map: Record<string, any> = {}
    for (const r of (records ?? [])) {
      const sid = r.staff_id
      if (!map[sid]) map[sid] = { name: (r.staff as any)?.name, hourly_rate: (r.staff as any)?.hourly_rate || 1300, hours: 0, days: 0 }
      if (r.clock_out) {
        const h = (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
        map[sid].hours += h
        map[sid].days += 1
      }
    }
    setSummary(Object.values(map).sort((a,b) => a.name.localeCompare(b.name, 'ja')))
  }

  async function saveRate(id: string) {
    await supabase.from('staff').update({ hourly_rate: parseInt(editRate) }).eq('id', id)
    toast.success('時給を更新しました')
    setEditId(null); loadStaff(); loadSummary()
  }

  async function exportCSV() {
    const csv = '\uFEFF' + 'スタッフ,出勤日数,労働時間,時給,支払額\n' +
      summary.map(s => `${s.name},${s.days},${s.hours.toFixed(1)},${s.hourly_rate},${Math.round(s.hours * s.hourly_rate)}`).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `payroll_${month}.csv`; a.click()
  }

  const total = summary.reduce((sum, s) => sum + Math.round(s.hours * s.hourly_rate), 0)

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">給与管理</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('summary')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab === 'summary' ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
          月次サマリー
        </button>
        <button onClick={() => setTab('rates')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab === 'rates' ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'}`}>
          時給設定
        </button>
      </div>

      {tab === 'summary' && (
        <>
          <div className="flex gap-2 mb-3">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white" />
            <button onClick={exportCSV}
              className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-600 shadow-sm">
              CSV
            </button>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 mb-4 text-center">
            <p className="text-xs text-teal-600 mb-1">{month} 支払総額</p>
            <p className="text-3xl font-medium text-teal-700">¥{total.toLocaleString()}</p>
          </div>

          <div className="space-y-2">
            {summary.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">
                データがありません
              </div>
            ) : summary.map(s => (
              <div key={s.name} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-stone-800">{s.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {s.days}日 / {s.hours.toFixed(1)}h / ¥{s.hourly_rate.toLocaleString()}/h
                    </p>
                  </div>
                  <p className="text-lg font-medium text-stone-800">
                    ¥{Math.round(s.hours * s.hourly_rate).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'rates' && (
        <div className="space-y-2">
          {staff.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
              {editId === s.id ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-medium text-stone-700">{s.name}</p>
                  <span className="text-stone-400 text-sm">¥</span>
                  <input type="number" value={editRate} onChange={e => setEditRate(e.target.value)}
                    className="w-24 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-right text-stone-800 bg-white" />
                  <button onClick={() => saveRate(s.id)}
                    className="px-3 py-1.5 bg-stone-800 text-white rounded-lg text-xs">保存</button>
                  <button onClick={() => setEditId(null)}
                    className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs">✕</button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-stone-700">{s.name}</p>
                    <p className="text-xs text-stone-400">{s.skill || 'barista'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-stone-800 font-medium">¥{(s.hourly_rate || 1300).toLocaleString()}/h</p>
                    <button onClick={() => { setEditId(s.id); setEditRate(String(s.hourly_rate || 1300)) }}
                      className="text-xs text-stone-400 hover:text-stone-600 px-2 py-1 bg-stone-100 rounded-lg">
                      編集
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
