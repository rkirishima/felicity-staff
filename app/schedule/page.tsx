'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getHolidaysOf } from 'japanese-holidays'

type Template = { id: string; name: string; day_type: string; start_time: string; end_time: string }
type Shift = { id: string; staff_id: string; date: string; start_time: string; end_time: string; status: string; staff: { name: string } }

const DAYS = ['日', '月', '火', '水', '木', '金', '土']
const TIME_OPTIONS = Array.from({ length: 21 }, (_, i) => {
  const totalMins = 9 * 60 + i * 30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}) // 09:00 〜 19:00
function isWeekend(d: Date) { return d.getDay() === 0 || d.getDay() === 6 }
function isFoodTruck(d: Date) { return d.getDay() === 3 || d.getDay() === 4 }
function getDayType(d: Date, specialDays: string[]) {
  return (isWeekend(d) || specialDays.includes(d.toISOString().split('T')[0])) ? 'weekend' : 'weekday'
}

export default function SchedulePage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [viewMonth, setViewMonth] = useState(new Date())
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const [specialDays, setSpecialDays] = useState<string[]>([])
  const [editMode, setEditMode] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
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
    supabase.from('special_business_days').select('date, day_type')
      .then(({ data }) => setSpecialDays((data ?? []).filter((d: any) => d.day_type === 'weekend').map((d: any) => d.date)))
    supabase.from('shift_templates').select('*').order('day_type')
      .then(({ data }) => setTemplates(data ?? []))
    supabase.from('staff').select('id, name, role, skill').eq('active', true)
      .not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => {
        const s = data ?? []
        setStaffList(s)
        const y = viewMonth.getFullYear()
        const m = String(viewMonth.getMonth() + 1).padStart(2, '0')
        const lastDay = new Date(y, viewMonth.getMonth() + 1, 0).getDate()
        supabase.from('shifts').select('id, staff_id, date, start_time, end_time, status')
          .gte('date', `${y}-${m}-01`).lte('date', `${y}-${m}-${lastDay}`).neq('status', 'rejected')
          .then(({ data: sd }) => setShifts((sd ?? []).map((sh: any) => ({
            ...sh, staff: { name: s.find((st: any) => st.id === sh.staff_id)?.name ?? '' }
          }))))
      })
  }, [viewMonth])

  function loadShifts() {
    const y = viewMonth.getFullYear()
    const m = String(viewMonth.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(y, viewMonth.getMonth() + 1, 0).getDate()
    supabase.from('shifts').select('id, staff_id, date, start_time, end_time, status')
      .gte('date', `${y}-${m}-01`).lte('date', `${y}-${m}-${lastDay}`).neq('status', 'rejected')
      .then(({ data: sd }) => setShifts((sd ?? []).map((sh: any) => ({
        ...sh, staff: { name: staffList.find((st: any) => st.id === sh.staff_id)?.name ?? '' }
      }))))
  }

  async function deleteShift(shiftId: string) {
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
    if (error) { toast.error('削除失敗'); return }
    toast.success('削除しました')
    loadShifts()
  }

  async function submitShift() {
    if (!selectedDate || !selectedStaff) { toast.error('日付とスタッフを選んでください'); return }
    const tmpl = templates.find(t => t.id === selectedTemplate)
    if (!tmpl && !customStart) { toast.error('シフトを選んでください'); return }
    const startTime = customStart || tmpl?.start_time || ''
    const endTime = customEnd || tmpl?.end_time || ''
    setLoading(true)
    const dayShifts = shifts.filter(s => s.date === selectedDate)
    const isHoliday = !!holidays[selectedDate]
    const maxStaff = (getDayType(new Date(selectedDate + 'T12:00:00'), specialDays) === 'weekend' || isHoliday) ? 3 : 1
    const isAdmin = staffList.find(s => s.id === selectedStaff)?.role === 'admin'
    if (dayShifts.length >= maxStaff && !isAdmin) {
      toast.error('この日は満員です。桐島に確認してください。')
      setLoading(false); return
    }
    const { error } = await supabase.from('shifts').insert({
      staff_id: selectedStaff, date: selectedDate,
      start_time: startTime, end_time: endTime, status: 'approved',
    })
    if (error) { toast.error('エラー: ' + error.message); setLoading(false); return }
    toast.success('シフトを登録しました！')
    setSelectedDate(null); setSelectedTemplate(''); setSelectedStaff('')
    setCustomStart(''); setCustomEnd('')
    setLoading(false); loadShifts()
  }

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array.from({ length: firstDay }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const isAdmin = !!staffList.find(s => s.id === selectedStaff && s.role === 'admin')

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewMonth(new Date(year, month - 1))} className="text-stone-400 hover:text-stone-700 px-3 py-1">←</button>
        <h2 className="text-lg font-bold tracking-widest text-teal-600">{year}年{month + 1}月</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMonth(new Date(year, month + 1))} className="text-stone-400 hover:text-stone-700 px-3 py-1">→</button>
          <button onClick={() => setEditMode(!editMode)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all font-medium ${editMode ? 'bg-red-500 text-white' : 'bg-stone-200 text-stone-600'}`}>
            {editMode ? '✏️ 編集中' : '編集'}
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-3 text-xs text-stone-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white border border-teal-400 inline-block" />土日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-200 inline-block" />祝日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-200 inline-block" />キッチンカー</span>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-6">
        {DAYS.map((d, i) => (
          <div key={d} className={`text-center text-xs py-1 ${i === 0 || i === 6 ? 'text-teal-600' : i === 3 || i === 4 ? 'text-amber-500' : 'text-stone-400'}`}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const date = new Date(year, month, day)
          const weekend = isWeekend(date)
          const foodtruck = isFoodTruck(date)
          const holiday = holidays[dateStr]
          const dayShifts = shifts.filter(s => s.date === dateStr)
          const isSelected = selectedDate === dateStr
          return (
            <button key={i} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={`relative rounded-xl p-1 text-center transition-all min-h-[52px] ${
                isSelected ? 'ring-2 ring-teal-500 bg-teal-50' :
                holiday ? 'bg-rose-100 hover:bg-rose-200' :
                foodtruck ? 'bg-amber-100 hover:bg-amber-200' :
                weekend ? 'bg-white hover:bg-stone-50 border border-stone-200' :
                'bg-white/60 hover:bg-white'
              }`}>
              <div className={`text-xs font-medium ${
                holiday ? 'text-rose-500' : weekend ? 'text-teal-600' : foodtruck ? 'text-amber-500' : 'text-stone-600'
              }`}>{day}</div>
              {holiday && <div className="text-[7px] text-rose-400 leading-tight truncate">{holiday}</div>}
              {dayShifts.length > 0 && (
                <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                  {dayShifts.slice(0,3).map((s, j) => {
                    const n = (s.staff as any)?.name ?? ''
                    const isKitchen = ['荒波','竹内'].some(k => n.includes(k))
                    return (
                      <div key={j} className={`w-4 h-4 rounded-full flex items-center justify-center ${isKitchen ? 'bg-amber-400' : 'bg-teal-500'}`}
                        style={{ fontSize: '7px', color: 'white', fontWeight: 'bold' }}>
                        {n.slice(0,1)}
                      </div>
                    )
                  })}
                  {dayShifts.length > 3 && (
                    <div className="w-4 h-4 rounded-full bg-stone-400 flex items-center justify-center"
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
            <h3 className="font-bold text-teal-600">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
              {isFoodTruck(new Date(selectedDate + 'T12:00:00')) && <span className="ml-2 text-xs text-amber-400 font-normal">🚐 キッチンカー</span>}
            </h3>
            {holidays[selectedDate] && <p className="text-xs text-rose-400 mt-0.5">🎌 {holidays[selectedDate]}</p>}
          </div>

          {shifts.filter(s => s.date === selectedDate).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-stone-400">入ってるスタッフ</p>
              {shifts.filter(s => s.date === selectedDate).map(s => (
                <div key={s.id} className="flex justify-between items-center bg-stone-50 rounded-xl px-3 py-2 text-sm">
                  <span className="text-stone-700">{(s.staff as any)?.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400">{s.start_time.slice(0,5)}〜{s.end_time.slice(0,5)}</span>
                    {editMode && (
                      <button onClick={() => deleteShift(s.id)}
                        className="w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center font-bold transition-all">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <p className="text-xs text-stone-400 mb-2">スタッフ</p>
              <div className="grid grid-cols-3 gap-2">
                {staffList.filter(s => s.role !== 'accountant').map(s => (
                  <button key={s.id} onClick={() => setSelectedStaff(s.id)}
                    className={`py-2 rounded-xl text-sm transition-all ${
                      selectedStaff === s.id
                        ? 'bg-stone-800 text-white'
                        : s.role === 'admin'
                        ? 'bg-white border-2 border-teal-300 text-teal-700'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}>
                    {s.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-stone-400 mb-2">シフト</p>
              <div className="space-y-1">
                {templates.filter(t => {
                  const d = new Date(selectedDate + 'T12:00:00')
                  return t.day_type === (getDayType(d, specialDays) === 'weekend' || holidays[selectedDate] ? 'weekend' : 'weekday')
                }).map(t => (
                  <button key={t.id} onClick={() => { setSelectedTemplate(t.id); setCustomStart(''); setCustomEnd('') }}
                    className={`w-full flex justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                      selectedTemplate === t.id && !customStart ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}>
                    <span>{t.name}</span>
                    <span className="opacity-60">{t.start_time.slice(0,5)}〜{t.end_time.slice(0,5)}</span>
                  </button>
                ))}

                {selectedStaff && (
                  <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
                    <p className="text-xs text-teal-600 font-medium">⚙️ カスタム時間</p>
                    <div className="flex items-center gap-2">
                      <select value={customStart}
                        onChange={e => { setCustomStart(e.target.value); setSelectedTemplate('') }}
                        className="flex-1 border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                        <option value="">開始</option>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-stone-400 text-sm">〜</span>
                      <select value={customEnd}
                        onChange={e => { setCustomEnd(e.target.value); setSelectedTemplate('') }}
                        className="flex-1 border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                        <option value="">終了</option>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button onClick={submitShift} disabled={loading}
              className="w-full py-3 bg-stone-800 hover:bg-stone-700 text-white disabled:opacity-50 rounded-xl font-medium transition-all tracking-wider">
              {loading ? '登録中...' : 'シフト登録'}
            </button>
          </div>
        </div>
      )}
      <button onClick={() => window.history.back()} className="text-stone-400 text-xs hover:text-stone-600">← ホームに戻る</button>
    </main>
  )
}
