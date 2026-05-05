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
      .select('id, name, hourly_rate, employment_type, skill, salary_start_date, payment_method')
      .eq('active', true).not('role', 'in', '("accountant","admin")').order('name')
    setStaff(data ?? [])
  }

  async function loadToday() {
    const todayJST = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,10)
    const { data } = await supabase.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate, salary_start_date, payment_method)')
      .gte('clock_in', todayJST + 'T00:00:00+09:00')
      .lte('clock_in', todayJST + 'T23:59:59+09:00')
    setTodayData(data ?? [])
  }

  // 打刻日（JST）が salary_start_date 以降なら正社員期間 → 時給対象外
  function isSalaryPeriod(clockInIso: string, salaryStart: string | null | undefined): boolean {
    if (!salaryStart) return false
    const clockInDateJST = new Date(new Date(clockInIso).getTime() + 9 * 60 * 60 * 1000)
      .toISOString().slice(0, 10)
    return clockInDateJST >= salaryStart
  }

  async function loadSummary() {
    const { data: records } = await supabase.from('timeclock')
      .select('staff_id, clock_in, clock_out, staff(name, hourly_rate, salary_start_date, payment_method)')
      .gte('clock_in', `${month}-01T00:00:00+09:00`)
      .lt('clock_in', `${nextMonthFirstDay(month)}T00:00:00+09:00`)
    const currentMonth = new Date().toISOString().slice(0, 7)
    const nowMs = Date.now()
    const map: Record<string, any> = {}
    const recMap: Record<string, any[]> = {}
    for (const r of (records ?? [])) {
      const sid = r.staff_id
      const sRow = (r.staff as any) ?? {}
      if (!map[sid]) map[sid] = {
        staffId: sid,
        name: sRow.name,
        hourly_rate: sRow.hourly_rate || 1300,
        hours: 0,
        days: 0,
        // 期間中に1件でも salary 期間があれば true
        hasSalaryPeriod: false,
        // 全件 salary 期間なら「正社員」表示で支払対象外
        allSalaryPeriod: true,
        paymentMethod: (sRow.payment_method as 'transfer' | 'cash') ?? 'transfer',
      }
      if (!recMap[sid]) recMap[sid] = []
      const salary = isSalaryPeriod(r.clock_in, sRow.salary_start_date ?? null)
      if (salary) map[sid].hasSalaryPeriod = true
      else map[sid].allSalaryPeriod = false

      const endMs = r.clock_out
        ? new Date(r.clock_out).getTime()
        : (month === currentMonth ? nowMs : null)
      if (endMs) {
        const h = (endMs - new Date(r.clock_in).getTime()) / 3600000
        if (!salary) {
          map[sid].hours += h
          if (r.clock_out) map[sid].days += 1
        }
        recMap[sid].push({ ...r, h, salary })
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
    const csv = '\uFEFF' + 'スタッフ,出勤日数,労働時間,時給,支払額,支払方法,区分\n' +
      summary.map(s => {
        const kind = s.allSalaryPeriod ? '正社員(月給)' : s.hasSalaryPeriod ? '混在' : '時給'
        const method = s.paymentMethod === 'cash' ? '現金' : '振込'
        return `${s.name},${s.days},${s.hours.toFixed(1)},${s.hourly_rate},${Math.round(s.hours * s.hourly_rate)},${method},${kind}`
      }).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `payroll_${month}.csv`; a.click()
  }

  // 振込合計: 現金 と allSalaryPeriod を除外（実際に振込で払う額）
  const transferTotal = summary
    .filter(s => s.paymentMethod !== 'cash' && !s.allSalaryPeriod)
    .reduce((sum, s) => sum + Math.round(s.hours * s.hourly_rate), 0)
  // 現金合計
  const cashTotal = summary
    .filter(s => s.paymentMethod === 'cash')
    .reduce((sum, s) => sum + Math.round(s.hours * s.hourly_rate), 0)

  // 今日のリアルタイム計算（正社員期間と現金は別扱い）
  const todayRows = todayData.map(r => {
    const cin = new Date(r.clock_in)
    const cout = r.clock_out ? new Date(r.clock_out) : now
    const h = (cout.getTime() - cin.getTime()) / 3600000
    const sRow = (r.staff as any) ?? {}
    const rate = sRow.hourly_rate || 1300
    const salary = isSalaryPeriod(r.clock_in, sRow.salary_start_date ?? null)
    const cash = sRow.payment_method === 'cash'
    return {
      name: sRow.name,
      hours: h,
      rate,
      pay: Math.round(h * rate),
      active: !r.clock_out,
      salary,
      cash,
    }
  })
  const todayTotal = todayRows
    .filter(r => !r.salary && !r.cash)
    .reduce((s, r) => s + r.pay, 0)
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
                  {r.salary && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-900 text-violet-200">正社員</span>}
                  {r.cash && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-900 text-amber-200">現金</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-500">{r.hours.toFixed(1)}h</span>
                  <span className={`text-sm ${r.salary ? 'text-stone-600 line-through' : 'text-stone-300'}`}>¥{r.pay.toLocaleString()}</span>
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
            <p className="text-xs text-teal-600 mb-1">{month} 振込支払額</p>
            <p className="text-3xl font-medium text-teal-700">¥{transferTotal.toLocaleString()}</p>
            {cashTotal > 0 && (
              <p className="text-xs text-amber-600 mt-2">＋ 現金 ¥{cashTotal.toLocaleString()}</p>
            )}
          </div>
          <div className="space-y-2">
            {summary.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-stone-400 text-sm shadow-sm">データがありません</div>
            ) : summary.map(s => {
              const isOpen = expandedStaff === s.staffId
              const recs = (staffRecords[s.staffId] ?? []).slice().sort((a: any, b: any) =>
                new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime()
              )
              const pay = Math.round(s.hours * s.hourly_rate)
              return (
                <div key={s.name} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button onClick={() => setExpandedStaff(isOpen ? null : s.staffId)}
                    className="w-full px-4 py-3 flex justify-between items-center text-left">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-stone-800">{s.name}</p>
                        {s.allSalaryPeriod && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">正社員</span>}
                        {s.hasSalaryPeriod && !s.allSalaryPeriod && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">混在</span>}
                        {s.paymentMethod === 'cash' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">現金</span>}
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">{s.days}日 / {s.hours.toFixed(1)}h / ¥{s.hourly_rate.toLocaleString()}/h</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`text-lg font-medium ${s.allSalaryPeriod ? 'text-stone-300 line-through' : s.paymentMethod === 'cash' ? 'text-amber-700' : 'text-stone-800'}`}>¥{pay.toLocaleString()}</p>
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
