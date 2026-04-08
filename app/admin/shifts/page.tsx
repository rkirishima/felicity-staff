'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getAdminSession } from '@/lib/session'

const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
const DAYS = ['日','月','火','水','木','金','土']

const TIME_OPTIONS: string[] = []
for (let i = 0; i <= 28; i++) {
  const total = 8 * 60 + i * 30
  const h = String(Math.floor(total / 60)).padStart(2,'0')
  const m = String(total % 60).padStart(2,'0')
  TIME_OPTIONS.push(`${h}:${m}`)
}

export default function AdminShiftsPage() {
  const [tab, setTab] = useState<'calendar' | 'requests'>('calendar')
  const [viewMonth, setViewMonth] = useState(new Date())
  const [shifts, setShifts] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [addStaff, setAddStaff] = useState('')
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (!getAdminSession()) { router.replace('/admin'); return }
    supabase.from('staff').select('id, name, role')
      .eq('active', true).not('role', 'in', '("accountant")')
      .order('name').then(({ data }) => setStaffList(data ?? []))
  }, [])

  useEffect(() => { loadShifts(); loadPending() }, [viewMonth])

  async function loadShifts() {
    const y = viewMonth.getFullYear()
    const m = String(viewMonth.getMonth() + 1).padStart(2,'0')
    const last = new Date(y, viewMonth.getMonth() + 1, 0).getDate()
    const { data, error } = await supabase.from('shifts')
      .select('id, staff_id, date, start_time, end_time, status')
      .gte('date', `${y}-${m}-01`)
      .lte('date', `${y}-${m}-${last}`)
      .order('date')
    if (error) { console.error(error); return }
    // staffの名前を取得
    const { data: staffData } = await supabase.from('staff').select('id, name')
    const staffMap: Record<string, string> = {}
    ;(staffData ?? []).forEach((s: any) => { staffMap[s.id] = s.name })
    setShifts((data ?? []).map((sh: any) => ({ ...sh, staffName: staffMap[sh.staff_id] ?? '' })))
  }

  async function loadPending() {
    const { data, error } = await supabase.from('shifts')
      .select('id, staff_id, date, start_time, end_time, status')
      .eq('status', 'pending').order('date')
    if (error) { console.error(error); return }
    const { data: staffData } = await supabase.from('staff').select('id, name')
    const staffMap: Record<string, string> = {}
    ;(staffData ?? []).forEach((s: any) => { staffMap[s.id] = s.name })
    setPending((data ?? []).map((sh: any) => ({ ...sh, staffName: staffMap[sh.staff_id] ?? '' })))
  }

  async function addShift() {
    if (!selectedDate || !addStaff || !addStart || !addEnd) {
      toast.error('スタッフ・時間を選んでください'); return
    }
    setLoading(true)
    const { error } = await supabase.from('shifts').insert({
      staff_id: addStaff,
      date: selectedDate,
      start_time: addStart,
      end_time: addEnd,
      status: 'approved',
    })
    if (error) { toast.error('追加失敗: ' + error.message); setLoading(false); return }
    toast.success('シフトを追加しました')
    setAddStaff(''); setAddStart(''); setAddEnd('')
    setLoading(false)
    loadShifts()
  }

  async function deleteShift(id: string) {
    if (!confirm('このシフトを削除しますか？')) return
    const { error } = await supabase.from('shifts').delete().eq('id', id)
    if (error) { toast.error('削除失敗'); return }
    toast.success('削除しました')
    loadShifts()
  }

  async function approveRequest(id: string) {
    await supabase.from('shifts').update({ status: 'approved' }).eq('id', id)
    toast.success('承認しました')
    loadPending(); loadShifts()
  }

  async function rejectRequest(id: string) {
    await supabase.from('shifts').update({ status: 'rejected' }).eq('id', id)
    toast.success('却下しました')
    loadPending()
  }

  const y = viewMonth.getFullYear()
  const m = viewMonth.getMonth()
  const firstDay = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)]

  const KITCHEN = ['荒波','竹内']

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400 text-lg">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">シフト管理</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('calendar')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium ${tab==='calendar'?'bg-stone-800 text-white':'bg-white text-stone-500 shadow-sm'}`}>
          📅 カレンダー
        </button>
        <button onClick={() => setTab('requests')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium relative ${tab==='requests'?'bg-stone-800 text-white':'bg-white text-stone-500 shadow-sm'}`}>
          📋 申請
          {pending.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {pending.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'calendar' && (
        <>
          {/* 月移動 */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setViewMonth(new Date(y, m-1))} className="text-stone-400 px-3 py-1">←</button>
            <span className="font-bold text-teal-600">{y}年{m+1}月</span>
            <button onClick={() => setViewMonth(new Date(y, m+1))} className="text-stone-400 px-3 py-1">→</button>
          </div>

          {/* カレンダー */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((d,i) => (
              <div key={d} className={`text-center text-xs py-1 ${i===0||i===6?'text-teal-600':'text-stone-400'}`}>{d}</div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const dayShifts = shifts.filter(s => s.date === dateStr && (s.status === 'approved' || s.status === 'absent'))
              const dow = new Date(y, m, day).getDay()
              const isWeekend = dow === 0 || dow === 6
              const isSelected = selectedDate === dateStr
              return (
                <button key={i} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  className={`rounded-xl p-1 text-center min-h-[52px] transition-all ${
                    isSelected ? 'ring-2 ring-teal-500 bg-teal-50' :
                    isWeekend ? 'bg-white border border-stone-200' : 'bg-white/60'
                  }`}>
                  <div className={`text-xs font-medium ${isWeekend?'text-teal-600':'text-stone-600'}`}>{day}</div>
                  <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                    {dayShifts.slice(0,4).map((s,j) => {
                      const isKit = KITCHEN.some(k => s.staffName.includes(k))
                      const isAbsent = s.status === 'absent'
                      return (
                        <div key={j} className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${isAbsent?'bg-red-400':isKit?'bg-orange-400':'bg-teal-500'}`}
                          style={{fontSize:'6px', color:'white', fontWeight:'bold'}}>
                          {s.staffName.slice(-1)}
                        </div>
                      )
                    })}
                    {dayShifts.length > 4 && <div className="w-3.5 h-3.5 rounded-full bg-stone-400 flex items-center justify-center" style={{fontSize:'6px',color:'white'}}>+{dayShifts.length-4}</div>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* 選択日の詳細 */}
          {selectedDate && (
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-4">
              <h3 className="font-bold text-teal-600">
                {new Date(selectedDate+'T12:00:00').toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'short'})}
              </h3>

              {/* 既存シフト */}
              {shifts.filter(s => s.date === selectedDate && (s.status === 'approved' || s.status === 'absent')).length > 0 && (
                <div className="space-y-1.5">
                  {shifts.filter(s => s.date === selectedDate && (s.status === 'approved' || s.status === 'absent')).map(s => {
                    const isKit = KITCHEN.some(k => s.staffName.includes(k))
                    const isAbsent = s.status === 'absent'
                    return (
                      <div key={s.id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${isAbsent?'bg-red-50':'bg-stone-50'}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isAbsent?'bg-red-400':isKit?'bg-orange-400':'bg-teal-500'}`} />
                          <span className={`text-sm ${isAbsent?'text-red-500 line-through':'text-stone-700'}`}>{s.staffName}</span>
                          {isAbsent && <span className="text-xs text-red-400">欠勤</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone-400">{s.start_time?.slice(0,5)}〜{s.end_time?.slice(0,5)}</span>
                          <button onClick={() => deleteShift(s.id)}
                            className="w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs font-bold hover:bg-red-500 hover:text-white transition-all">×</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 追加フォーム */}
              <div className="space-y-3 border-t border-stone-100 pt-3">
                <p className="text-xs text-stone-400 font-medium">＋ シフトを追加</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {staffList.filter(s => s.role !== 'accountant').map(s => (
                    <button key={s.id} onClick={() => setAddStaff(s.id)}
                      className={`py-2 rounded-xl text-xs font-medium transition-all ${
                        addStaff === s.id ? 'bg-stone-800 text-white' :
                        s.role === 'admin' ? 'bg-white border-2 border-teal-300 text-teal-700' :
                        'bg-stone-100 text-stone-700'
                      }`}>
                      {s.name.split(' ')[0] || s.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <select value={addStart} onChange={e => setAddStart(e.target.value)}
                    className="flex-1 border border-stone-200 rounded-xl px-2 py-2 text-sm bg-white text-stone-800">
                    <option value="">出勤</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="text-stone-400 self-center">〜</span>
                  <select value={addEnd} onChange={e => setAddEnd(e.target.value)}
                    className="flex-1 border border-stone-200 rounded-xl px-2 py-2 text-sm bg-white text-stone-800">
                    <option value="">退勤</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={addShift} disabled={loading}
                  className="w-full py-3 bg-stone-800 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                  {loading ? '追加中...' : 'シフトを追加'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 申請タブ */}
      {tab === 'requests' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-stone-400 shadow-sm">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-sm">承認待ちの申請はありません</p>
            </div>
          ) : pending.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4">
              <p className="font-medium text-stone-800">{s.staffName}</p>
              <p className="text-sm text-stone-500 mt-0.5">
                {new Date(s.date+'T12:00:00').toLocaleDateString('ja-JP',{month:'long',day:'numeric',weekday:'short'})}
                　{s.start_time?.slice(0,5)}〜{s.end_time?.slice(0,5)}
              </p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => approveRequest(s.id)}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium">✓ 承認</button>
                <button onClick={() => rejectRequest(s.id)}
                  className="flex-1 py-2.5 bg-red-50 text-red-500 rounded-xl text-sm font-medium">✕ 却下</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
