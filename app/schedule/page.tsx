'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getHolidaysOf } from 'japanese-holidays'

type Template = { id: string; name: string; day_type: string; start_time: string; end_time: string }
type Shift = { id: string; staff_id: string; date: string; start_time: string; end_time: string; status: string; staff: { name: string } | { name: string }[] }

const DAYS = ['日', '月', '火', '水', '木', '金', '土']
function isWeekend(d: Date) { return d.getDay() === 0 || d.getDay() === 6 }
function isFoodTruck(d: Date) { return d.getDay() === 3 || d.getDay() === 4 }
function getDayType(d: Date, specialDays: string[]) { return (isWeekend(d) || specialDays.includes(d.toISOString().split('T')[0])) ? 'weekend' : 'weekday' }

export default function SchedulePage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [overrideMode, setOverrideMode] = useState(false)
  const [viewMonth, setViewMonth] = useState(new Date())
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const [specialDays, setSpecialDays] = useState<string[]>([])
  const supabase = createClient()

  useEffect(() => {
    const year = viewMonth.getFullYear()
    const hs = getHolidaysOf(year)
    const map: Record<string, string> = {}
    hs.forEach((h: any) => {
      const key = `${year}-${String(h.month).padStart(2,'0')}-${String(h.date).padStart(2,'0')}`
      map[key] = h.name
    })
    setHolidays(map)
    supabase.from('special_business_days').select('date, day_type').then(({ data }) => setSpecialDays((data ?? []).filter((d: any) => d.day_type === 'weekend').map((d: any) => d.date)))
    supabase.from('shift_templates').select('*').order('day_type').then(({ data }) => setTemplates(data ?? []))
    supabase.from('staff').select('id, name, role, skill').eq('active', true).not('role', 'eq', 'accountant').order('name').then(({ data }) => {
      const s = data ?? []
      setStaffList(s)
      const y = viewMonth.getFullYear()
      const m = String(viewMonth.getMonth() + 1).padStart(2, '0')
      supabase.from('shifts').select('id, staff_id, date, start_time, end_time, status')
        .gte('date', `${y}-${m}-01`).lte('date', `${y}-${m}-30`).neq('status', 'rejected')
        .then(({ data: sd }) => setShifts((sd ?? []).map((sh: any) => ({
          ...sh, staff: { name: s.find((st: any) => st.id === sh.staff_id)?.name ?? '' }
        }))))
    })
  }, [viewMonth])

  async function loadShifts() {
    const y = viewMonth.getFullYear()
    const m = String(viewMonth.getMonth() + 1).padStart(2, '0')
    const { data: sd } = await supabase.from('shifts').select('id, staff_id, date, start_time, end_time, status')
      .gte('date', `${y}-${m}-01`).lte('date', `${y}-${m}-30`).neq('status', 'rejected')
    setShifts((sd ?? []).map((sh: any) => ({
      ...sh, staff: { name: staffList.find((st: any) => st.id === sh.staff_id)?.name ?? '' }
    })))
  }

  async function submitShift() {
    if (!selectedDate || !selectedTemplate || !selectedStaff) { toast.error('日付・シフト・スタッフを選んでください'); return }
    const tmpl = templates.find(t => t.id === selectedTemplate)
    if (!tmpl) return
    setLoading(true)
    const dayShifts = shifts.filter(s => s.date === selectedDate && s.status !== 'rejected')
    const date = new Date(selectedDate + 'T12:00:00')
    const isHoliday = !!holidays[selectedDate]
    const maxStaff = (getDayType(date, specialDays) === 'weekend' || isHoliday) ? 3 : 1
    if (dayShifts.length >= maxStaff) { toast.error('この日は満員です。桐島に確認してください。'); setLoading(false); return }
    const { error } = await supabase.from('shifts').insert({
      staff_id: selectedStaff, date: selectedDate,
      start_time: tmpl.start_time, end_time: tmpl.end_time, status: 'approved',
    })
    if (error) { toast.error('エラー: ' + error.message); setLoading(false); return }
    toast.success('シフトを登録しました！')
    setSelectedDate(null); setSelectedTemplate(null); setSelectedStaff(null)
    setLoading(false); setOverrideMode(false); loadShifts()
  }

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array.from({ length: firstDay }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto" style={{ backgroundColor: '#F5F0E8', color: '#1c1917' }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewMonth(new Date(year, month - 1))} className="text-zinc-400 hover:text-white px-3 py-1">←</button>
        <h2 className="text-lg font-bold tracking-widest text-teal-400">{year}年{month + 1}月</h2>
        <button onClick={() => setViewMonth(new Date(year, month + 1))} className="text-zinc-400 hover:text-white px-3 py-1">→</button>
      </div>

      <div className="flex gap-3 mb-3 text-xs text-zinc-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-800 inline-block border border-teal-400" />土日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-950 inline-block" />祝日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-950 inline-block" />キッチンカー</span>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-6">
        {DAYS.map((d, i) => (
          <div key={d} className={`text-center text-xs py-1 ${i === 0 || i === 6 ? 'text-teal-400' : i === 3 || i === 4 ? 'text-amber-400' : 'text-stone-400'}`}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const date = new Date(year, month, day)
          const weekend = isWeekend(date)
          const foodtruck = isFoodTruck(date)
          const holiday = holidays[dateStr]
          const dayShifts = shifts.filter(s => s.date === dateStr && s.status !== 'rejected')
          const isSelected = selectedDate === dateStr

          return (
            <button key={i} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={`relative rounded-lg p-1 text-center transition-all min-h-[48px] ${
                isSelected ? 'ring-2 ring-teal-500 bg-teal-100' :
                holiday ? 'bg-rose-950 hover:bg-rose-900' :
                foodtruck ? 'bg-amber-950 hover:bg-amber-900' :
                weekend ? 'bg-white hover:bg-stone-50' :
                'bg-white/60 hover:bg-white'
              }`}>
              <div className={`text-xs font-medium ${
                holiday ? 'text-rose-400' :
                weekend ? 'text-teal-400' :
                foodtruck ? 'text-amber-400' :
                'text-zinc-300'
              }`}>{day}</div>
              {holiday && <div className="text-[8px] text-rose-400 leading-tight truncate px-0.5">{holiday}</div>}
              {dayShifts.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                  {dayShifts.slice(0,3).map((s, j) => {
                    const n = (s.staff as any)?.name ?? ''
                    const isKitchen = ['荒波','竹内'].some(k => n.includes(k))
                    return (
                      <div key={j} className={`w-4 h-4 rounded-full flex items-center justify-center ${isKitchen ? 'bg-amber-500' : 'bg-teal-600'}`}
                        style={{ fontSize: '7px', color: 'white', fontWeight: 'bold' }}>
                        {n.slice(0,1)}
                      </div>
                    )
                  })}
                  {dayShifts.length > 3 && (
                    <div className="w-4 h-4 rounded-full bg-zinc-600 flex items-center justify-center"
                      style={{ fontSize: '7px', color: 'white' }}>+{dayShifts.length - 3}</div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-4">
          <div>
            <h3 className="font-bold text-teal-400">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
              {isFoodTruck(new Date(selectedDate + 'T12:00:00')) && <span className="ml-2 text-xs text-amber-400 font-normal">🚐 キッチンカー</span>}
            </h3>
            {holidays[selectedDate] && <p className="text-xs text-rose-400 mt-0.5">🎌 {holidays[selectedDate]}</p>}
          </div>
          {shifts.filter(s => s.date === selectedDate && s.status !== 'rejected').length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">入ってるスタッフ</p>
              {shifts.filter(s => s.date === selectedDate && s.status !== 'rejected').map(s => (
                <div key={s.id} className="flex justify-between bg-stone-100 rounded-lg px-3 py-2 text-sm">
                  <span>{(s.staff as any)?.name}</span>
                  <span className="text-zinc-500">{s.start_time.slice(0,5)}〜{s.end_time.slice(0,5)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <p className="text-xs text-zinc-500 mb-1">スタッフ</p>
              <div className="grid grid-cols-3 gap-2">
                {staffList.filter(s => s.role !== 'admin').map(s => (
                  <button key={s.id} onClick={() => setSelectedStaff(s.id)}
                    className={`py-2 rounded-lg text-sm transition-all ${selectedStaff === s.id ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">シフト</p>
              <div className="space-y-1">
                {templates.filter(t => {
                  const d = new Date(selectedDate + 'T12:00:00')
                  return t.day_type === (getDayType(d, specialDays) === 'weekend' || holidays[selectedDate] ? 'weekend' : 'weekday')
                }).map(t => (
                  <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                    className={`w-full flex justify-between px-3 py-2 rounded-lg text-sm transition-all ${selectedTemplate === t.id ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                    <span>{t.name}</span>
                    <span className="text-zinc-500">{t.start_time.slice(0,5)}〜{t.end_time.slice(0,5)}</span>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={submitShift} disabled={loading}
              className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 rounded-xl font-medium transition-all">
              {loading ? '登録中...' : 'シフト登録'}
            </button>
          </div>
        </div>
      )}
      <button onClick={() => window.history.back()} className="text-zinc-600 text-xs hover:text-zinc-400">← ホームに戻る</button>
    </main>
  )
}
