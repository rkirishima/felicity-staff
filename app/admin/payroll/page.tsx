'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { nextMonthFirstDay } from '@/lib/utils'
import { getAdminSession } from '@/lib/session'

export default function PayrollPage() {
  const [staff, setStaff] = useState<any[]>([])
  const [summary, setSummary] = useState<any[]>([])
  const [todayData, setTodayData] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const [editId, setEditId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [tab, setTab] = useState<'summary' | 'rates'>('summary')
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null)
  const [staffRecords, setStaffRecords] = useState<Record<string, any[]>>({})
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (!getAdminSession()) { router.replace('/admin'); return }
    loadStaff()
  }, [])
  useEffect(() => { loadSummary() }, [month])
  useEffect(() => {
    loadToday()
    const t = setInterval(() => { setNow(new Date()); loadToday() }, 60000)
    return () => clearInterval(t)
  }, [])

  async function loadStaff() {
    const { data } = await supabase.from('staff')
      .select('id, name, hourly_rate, employment_type, skill')
      .eq('active', true).not('role', 'in', '("accountant","admin")').order('name')
    setStaff(data ?? [])
  }

  async function loadToday() {
    const todayJST = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)
    const { data } = await supabase.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate)')
      .gte('clock_in', todayJST + 'T00:00:00+09:00')
      .lte('clock_in', todayJST + 'T23:59:59+09:00')
    setTodayData(data ?? [])
  }

  async function loadSummary() {
    const { data: records } = await supabase.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate)')
      .gte('clock_in', `${month}-01T00:00:00+09:00`)
      .lt('clock_in', `${nextMonthFirstDay(month)}T00:00:00+09:00`)
    const currentMonth = new Date().toISOString().slice(0, 7)
    const nowMs = Date.now()
    const map: Record<string, any> = {}
    const recMap: Record<string, any[]> = {}
    for (const r of (records ?? [])) {
      const sid = r.staff_id
      if (!map[sid]) map[sid] = { staffId: sid, name: (r.staff as any)?.name, hourly_rate: (r.staff as any)?.hourly_rate || 1300, hours: 0, days: 0 }
      if (!recMap[sid]) recMap[sid] = []
      const endMs = r.clock_out
        ? new Date(r.clock_out).getTime()
        : (month === currentMonth ? nowMs : null)
      if (endMs) {
        const h = (endMs - new Date(r.clock_in).getTime()) / 3600000
        map[sid].hours += h
        if (r.clock_out) map[sid].days += 1
        recMap[sid].push({ ...r, h })
      }
    }
    setSummary(Object.values(map).sort((a,b) => a.name.localeCompare(b.name, 'ja')))
    setStaffRecords(recMap)
    setExpandedStaff(null)
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

  // 今日のリアルタイム計算
  const todayRows = todayData.map(r => {
    const cin = new Date(r.clock_in)
    const cout = r.clock_out ? new Date(r.clock_out) : now
    const h = (cout.getTime() - cin.getTime()) / 3600000
    const rate = (r.staff as any)?.hourly_rate || 1300
    return {
      name: (r.staff as any)?.name,
      hours: h,
      rate,
      pay: Math.round(h * rate),
      active: !r.clock_out,
    }
  })
  const todayTotal = todayRows.reduce((s, r) => s + r.pay, 0)
  const activeCount = todayRows.filter(r => r.active).length

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">給与管理</h1>
      </div>

      {/* 今日のリアルタイム */}
      <div className="bg-stone-800 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-stone-400 tracking-wider">TODAY — LIVE</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <p className="text-xs text-stone-400">{activeCount}名勤務中</p>
          </div>
        </div>
        <p className="text-3xl font-light text-white mb-3">¥{todayTotal.toLocaleString()}</p>
        {todayRows.length > 0 && (
          <div className="space-y-1.5 border-t border-stone-700 pt-3">
            {todayRows.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {r.active && <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                  {!r.active && <div className="w-1.5 h-1.5 rounded-full bg-stone-600" />}
                  <span className="text-sm text-stone-300">{r.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-500">{r.hours.toFixed(1)}h</span>
                  <span className="text-sm text-stone-300">¥{r.pay.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {todayRows.length === 0 && (
          <p className="text-sm text-stone-500">本日の出勤記録なし</p>
        )}
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
              <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">データがありません</div>
            ) : summary.map(s => {
              const isOpen = expandedStaff === s.staffId
              const recs = (staffRecords[s.staffId] ?? []).slice().sort((a: any, b: any) =>
                new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime()
              )
              return (
                <div key={s.name} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedStaff(isOpen ? null : s.staffId)}
                    className="w-full px-4 py-3 flex justify-between items-center text-left">
                    <div>
                      <p className="font-medium text-stone-800">{s.name}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{s.days}日 / {s.hours.toFixed(1)}h / ¥{s.hourly_rate.toLocaleString()}/h</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-medium text-stone-800">¥{Math.round(s.hours * s.hourly_rate).toLocaleString()}</p>
                      <span className="text-stone-300 text-sm">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-stone-100 px-4 pb-3 pt-2 space-y-1.5">
                      {recs.map((r: any, i: number) => {
                        const cin = new Date(r.clock_in)
                        const cout = r.clock_out ? new Date(r.clock_out) : null
                        return (
                          <div key={i} className="flex justify-between text-xs text-stone-500">
                            <span>{cin.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' })}</span>
                            <span>
                              {cin.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
                              〜{cout ? cout.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : '勤務中'}
                            </span>
                            <span className="text-teal-600 font-medium w-20 text-right">
                              {r.h.toFixed(1)}h / ¥{Math.round(r.h * s.hourly_rate).toLocaleString()}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
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
