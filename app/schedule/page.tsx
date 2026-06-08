'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { getHolidaysOf } from 'japanese-holidays'
import { getSession, getAdminSession } from '@/lib/session'
import { verifyStaffPin } from '@/app/admin/actions'
import { LOCATION_META, SHIFT_LOCATION_OPTIONS, locationOf, type ShiftLocation } from '@/lib/shift-locations'

type Template = { id: string; name: string; day_type: string; start_time: string; end_time: string }
type Shift = { id: string; staff_id: string | null; date: string; start_time: string; end_time: string; status: string; location: string | null; note: string | null; staff: { name: string } }
type Staff = { id: string; name: string; role: string }

const DAYS = ['日', '月', '火', '水', '木', '金', '土']
const TIME_OPTIONS: string[] = []
for (let h = 7; h <= 19; h++) {
  TIME_OPTIONS.push(String(h).padStart(2,'0') + ':00')
  if (h < 19) TIME_OPTIONS.push(String(h).padStart(2,'0') + ':30')
}

function isWeekend(d: Date) { return d.getDay() === 0 || d.getDay() === 6 }
function isFoodTruck(d: Date) { return d.getDay() === 3 || d.getDay() === 4 }
// 曜日別テンプレート用：祝日・特別日・土日は 'weekend'、平日は曜日コード
function getTemplateDayType(d: Date, specialDays: string[], holidays: Record<string, string>): string {
  const dateStr = d.toISOString().split('T')[0]
  const dow = d.getDay()
  if (dow === 0 || dow === 6 || holidays[dateStr] || specialDays.includes(dateStr)) {
    return 'weekend'
  }
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow]
}

export default function SchedulePage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [shiftLocation, setShiftLocation] = useState<ShiftLocation>('cafe')
  const [loading, setLoading] = useState(false)
  const [viewMonth, setViewMonth] = useState(new Date())
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const [specialDays, setSpecialDays] = useState<string[]>([])
  // PIN認証
  const [authStaff, setAuthStaff] = useState<Staff | null>(null)
  const [authStep, setAuthStep] = useState<'select' | 'pin' | 'done'>('select')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const supabase = createClient()
  const isAdmin = authStaff?.role === 'admin'

  useEffect(() => {
    // adminセッション優先
    const adminSession = getAdminSession()
    if (adminSession) {
      setAuthStaff({ id: adminSession.staffId, name: adminSession.staffName, role: 'admin' })
      setSelectedStaff('')
      setAuthStep('done')
      return
    }
    const session = getSession()
    if (session) {
      setAuthStaff({ id: session.staffId, name: session.staffName, role: session.staffRole })
      setSelectedStaff(session.staffRole === 'admin' ? '' : session.staffId)
      setAuthStep('done')
    }
  }, [])

  // 日付を切り替えたら選択状態をリセット
  useEffect(() => {
    setSelectedTemplate('')
    setCustomStart('')
    setCustomEnd('')
  }, [selectedDate])

  useEffect(() => {
    const year = viewMonth.getFullYear()
    const hs = getHolidaysOf(year)
    const map: Record<string, string> = {}
    hs.forEach((h: any) => {
      const key = year + '-' + String(h.month).padStart(2,'0') + '-' + String(h.date).padStart(2,'0')
      map[key] = h.name
    })
    setHolidays(map)
    supabase.from('special_business_days').select('date, day_type')
      .then(({ data }) => setSpecialDays((data ?? []).filter((d: any) => d.day_type === 'weekend').map((d: any) => d.date)))
    supabase.from('shift_templates').select('*').order('day_type')
      .then(({ data }) => setTemplates(data ?? []))
    supabase.from('staff').select('id, name, role').eq('active', true)
      .not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaffList((data ?? []) as Staff[]))
    loadShifts()
  }, [viewMonth])

  function loadShifts() {
    const y = viewMonth.getFullYear()
    const m = String(viewMonth.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(y, viewMonth.getMonth() + 1, 0).getDate()
    supabase.from('shifts').select('id, staff_id, date, start_time, end_time, status, location, note, staff!shifts_staff_id_fkey(name)')
      .gte('date', y + '-' + m + '-01')
      .lte('date', y + '-' + m + '-' + lastDay)
      .in('status', ['approved', 'pending'])
      .then(({ data: sd }) => {
        supabase.from('staff').select('id, name').then(({ data: st }) => {
          const staffMap: Record<string, string> = {}
          ;(st ?? []).forEach((s: any) => { staffMap[s.id] = s.name })
          setShifts((sd ?? []).map((sh: any) => ({
            ...sh, staff: { name: staffMap[sh.staff_id] ?? '' }
          })))
        })
      })
  }

  async function handlePinInput(n: string) {
    setPinError(false)
    const next = pinInput + n
    setPinInput(next)
    if (next.length === 4) {
      if (!authStaff) return
      const ok = await verifyStaffPin(authStaff.id, next)
      if (ok) {
        setAuthStep('done')
        setSelectedStaff(authStaff.id)
      } else {
        setPinError(true)
        setTimeout(() => setPinInput(''), 600)
      }
    }
  }

  async function deleteShift(shiftId: string) {
    const shift = shifts.find(s => s.id === shiftId)
    if (!isAdmin) {
      // スタッフは自分の「申請中」シフトのみ取消可能。承認済み・既存シフトは削除不可
      if (shift?.staff_id !== authStaff?.id) {
        toast.error('自分のシフトのみ取消できます')
        return
      }
      if (shift?.status !== 'pending') {
        toast.error('承認済みのシフトは取消できません。変更は桐島に連絡してください 🙏')
        return
      }
    }
    const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
    if (error) { toast.error('削除失敗'); return }
    toast.success('削除しました')
    loadShifts()
  }

  async function submitShift() {
    if (!selectedDate || !selectedStaff) { toast.error('日付とスタッフを選んでください'); return }
    const tmpl = templates.find(t => t.id === selectedTemplate)
    const startTime = customStart || tmpl?.start_time || ''
    const endTime = customEnd || tmpl?.end_time || ''
    if (!startTime || !endTime) { toast.error('シフトを選んでください'); return }
    setLoading(true)
    const status = isAdmin ? 'approved' : 'pending'
    const { error } = await supabase.from('shifts').insert({
      staff_id: selectedStaff,
      date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      status,
      location: shiftLocation,
      template_id: tmpl?.id ?? null,
    })
    if (error) {
      // 23505 = PostgreSQL unique violation
      if (error.code === '23505') {
        toast.error('このシフトは既に申請済みです')
      } else {
        toast.error('エラー: ' + error.message)
      }
      setLoading(false); return
    }
    if (isAdmin) {
      toast.success('シフトを登録しました！')
    } else {
      toast.success('申請しました！桐島に確認してもらいます 📩')
    }
    setSelectedDate(null); setSelectedTemplate(''); setSelectedStaff(isAdmin ? '' : authStaff?.id || '')
    setCustomStart(''); setCustomEnd(''); setShiftLocation('cafe')
    setLoading(false); loadShifts()
  }

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  const _today = new Date()
  const todayStr = _today.getFullYear() + '-' + String(_today.getMonth()+1).padStart(2,'0') + '-' + String(_today.getDate()).padStart(2,'0')

  // PIN認証画面
  if (authStep === 'select') return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-5" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <p className="text-lg font-bold tracking-widest text-stone-800">シフト確認</p>
        <p className="text-xs text-stone-400 mt-1">名前を選んでください</p>
      </div>
      <div className="grid grid-cols-3 gap-2 w-full max-w-sm">
        {staffList.map(s => (
          <button key={s.id} onClick={() => { setAuthStaff(s); setAuthStep('pin'); setPinInput('') }}
            className={'py-3 px-2 rounded-2xl text-sm font-medium shadow-sm transition-all ' + (
              s.role === 'admin' ? 'bg-white border-2 border-teal-300 text-teal-700' : 'bg-white text-stone-700'
            )}>
            <div className="text-xs font-normal text-stone-400">{s.name.split(' ')[0]}</div>
            <div>{s.name.split(' ')[1] || ''}</div>
          </button>
        ))}
      </div>
      <button onClick={() => window.history.back()} className="text-stone-400 text-xs">← 戻る</button>
    </main>
  )

  if (authStep === 'pin') return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <p className="text-xl font-medium text-stone-800">{authStaff?.name.split(' ')[0]}</p>
        <p className="text-xs tracking-widest text-stone-400 mt-1">PINを入力してください</p>
      </div>
      <div className="flex gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className={'w-4 h-4 rounded-full transition-all ' + (
            pinInput.length > i ? (pinError ? 'bg-red-400' : 'bg-stone-800') : 'bg-stone-300'
          )} />
        ))}
      </div>
      {pinError && <p className="text-xs text-red-400 -mt-3">PINが違います</p>}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n, i) => (
          <button key={i} onClick={() => {
            if (n === '⌫') setPinInput(p => p.slice(0,-1))
            else if (n !== '') handlePinInput(n)
          }} className={'py-4 rounded-2xl text-xl font-medium ' + (n === '' ? '' : 'bg-white text-stone-700 shadow-sm active:scale-95')}>
            {n}
          </button>
        ))}
      </div>
      <button onClick={() => { setAuthStep('select'); setAuthStaff(null) }}
        className="text-stone-400 text-sm px-4 py-2 bg-white rounded-xl shadow-sm">
        ← 戻る
      </button>
    </main>
  )

  // カレンダー本体
  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setViewMonth(new Date(year, month - 1))} className="text-stone-400 px-3 py-1">←</button>
        <div className="text-center">
          <h2 className="text-lg font-bold tracking-widest text-teal-600">{year}年{month + 1}月</h2>
          <p className="text-xs text-stone-400">{authStaff?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMonth(new Date(year, month + 1))} className="text-stone-400 px-3 py-1">→</button>
          {!isAdmin && (
            <button onClick={() => { setAuthStep('select'); setAuthStaff(null) }}
              className="text-xs px-2 py-1 bg-white rounded-lg shadow-sm text-stone-500">
              変更
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-3 text-xs text-stone-400 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-white border-2 border-stone-800 inline-block" />今日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white border border-teal-400 inline-block" />土日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-200 inline-block" />祝日</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-200 inline-block" />キッチンカー</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 border border-amber-600 inline-block" />募集中</span>
        {!isAdmin && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-200 border border-yellow-400 inline-block" />申請中</span>}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {DAYS.map((d, i) => (
          <div key={d} className={'text-center text-xs py-1 ' + (i===0||i===6?'text-teal-600':i===3||i===4?'text-amber-500':'text-stone-400')}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0')
          const date = new Date(year, month, day)
          const weekend = isWeekend(date)
          const foodtruck = isFoodTruck(date)
          const holiday = holidays[dateStr]
          const dayShifts = shifts.filter(s => s.date === dateStr)
          const approvedShifts = dayShifts.filter(s => s.status === 'approved')
          const pendingShifts = dayShifts.filter(s => s.status === 'pending')
          const isSelected = selectedDate === dateStr
          const isToday = dateStr === todayStr
          return (
            <button key={i} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={'relative rounded-xl p-1 text-center transition-all min-h-[52px] ' + (
                isSelected ? 'ring-2 ring-teal-500 bg-teal-100' :
                isToday ? 'ring-2 ring-stone-800 ring-offset-1 bg-white' :
                holiday ? 'bg-rose-100' :
                foodtruck ? 'bg-amber-100' :
                weekend ? 'bg-white border border-stone-200' :
                'bg-white/60'
              )}>
              {isToday ? (
                <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-stone-800 text-white text-xs font-bold">{day}</div>
              ) : (
                <div className={'text-xs font-medium ' + (holiday?'text-rose-500':weekend?'text-teal-600':foodtruck?'text-amber-500':'text-stone-600')}>{day}</div>
              )}
              {holiday && <div className="text-[7px] text-rose-400 leading-tight truncate">{holiday}</div>}
              <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                {approvedShifts.slice(0,3).map((s, j) => {
                  const n = (s.staff as any)?.name ?? ''
                  const isOpen = !s.staff_id
                  const meta = LOCATION_META[locationOf(s)]
                  return (
                    <div key={j} className={'w-4 h-4 rounded-full flex items-center justify-center ' + (isOpen ? 'bg-amber-400 border border-amber-600' : meta.dot)}
                      style={{ fontSize:'7px', color:'white', fontWeight:'bold' }}>
                      {isOpen ? '?' : n.slice(-1)}
                    </div>
                  )
                })}
                {pendingShifts.length > 0 && (
                  <div className="w-4 h-4 rounded-full bg-yellow-300 flex items-center justify-center"
                    style={{ fontSize:'7px', color:'#92400e', fontWeight:'bold' }}>
                    {pendingShifts.length}
                  </div>
                )}
                {approvedShifts.length > 3 && (
                  <div className="w-4 h-4 rounded-full bg-stone-400 flex items-center justify-center"
                    style={{ fontSize:'7px', color:'white' }}>
                    +{approvedShifts.length-3}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-4">
          <div>
            <h3 className="font-bold text-teal-600">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('ja-JP', { month:'long', day:'numeric', weekday:'short' })}
              {isFoodTruck(new Date(selectedDate + 'T12:00:00')) && <span className="ml-2 text-xs text-amber-400 font-normal">🚐 キッチンカー</span>}
            </h3>
            {holidays[selectedDate] && <p className="text-xs text-rose-400 mt-0.5">🎌 {holidays[selectedDate]}</p>}
          </div>

          {shifts.filter(s => s.date === selectedDate).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-stone-400">スタッフ</p>
              {shifts.filter(s => s.date === selectedDate).map(s => {
                const loc = locationOf(s)
                const meta = LOCATION_META[loc]
                const isOpen = !s.staff_id
                return (
                <div key={s.id} className={'flex justify-between items-center rounded-xl px-3 py-2 text-sm ' + (isOpen ? 'bg-amber-50 border border-amber-200' : s.status === 'pending' ? 'bg-yellow-50 border border-yellow-200' : loc === 'cafe' ? 'bg-stone-50' : meta.cell)}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOpen ? 'bg-amber-400' : meta.dot}`} />
                    <span className={isOpen ? 'text-amber-700 font-medium' : 'text-stone-700'}>
                      {isOpen ? '🔔 募集中' : (s.staff as any)?.name}
                    </span>
                    {s.note && <span className="text-[10px] text-stone-500 truncate">{s.note}</span>}
                    {loc !== 'cafe' && !isOpen && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${meta.badge}`}>{meta.emoji} {meta.label}</span>
                    )}
                    {s.status === 'pending' && <span className="ml-1 text-xs text-yellow-600">申請中</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400">{s.start_time.slice(0,5)}〜{s.end_time.slice(0,5)}</span>
                    {(isAdmin || (s.staff_id === authStaff?.id && s.status === 'pending')) && (
                      <button onClick={() => deleteShift(s.id)}
                        title={isAdmin ? '削除' : '申請を取消'}
                        className="w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center font-bold transition-all">×</button>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}

          <div className="space-y-3">
            {isAdmin && (
              <div>
                <p className="text-xs text-stone-400 mb-2">スタッフ選択（admin）</p>
                <div className="grid grid-cols-3 gap-2">
                  {staffList.filter(s => s.role !== 'accountant').map(s => (
                    <button key={s.id} onClick={() => setSelectedStaff(s.id)}
                      className={'py-2 rounded-xl text-sm transition-all ' + (
                        selectedStaff === s.id ? 'bg-stone-800 text-white' :
                        s.role === 'admin' ? 'bg-white border-2 border-teal-300 text-teal-700' :
                        'bg-stone-100 text-stone-700'
                      )}>
                      {s.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs text-stone-400 mb-2">勤務場所</p>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {SHIFT_LOCATION_OPTIONS.map(loc => {
                  const meta = LOCATION_META[loc]
                  const active = shiftLocation === loc
                  return (
                    <button key={loc} onClick={() => setShiftLocation(loc)}
                      className={'py-2 rounded-xl text-xs font-medium transition-all border-2 ' + (
                        active
                          ? `${meta.cell} ${meta.border} text-stone-800`
                          : 'bg-white border-transparent text-stone-500'
                      )}>
                      {meta.emoji} {meta.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-stone-400 mb-2">
                {isAdmin ? 'シフト' : '希望シフト'}
              </p>
              <div className="space-y-1">
                {(() => {
                  const dayType = getTemplateDayType(new Date(selectedDate + 'T12:00:00'), specialDays, holidays)
                  const dayTemplates = templates.filter(t => t.day_type === dayType)
                  if (dayTemplates.length === 0) {
                    return (
                      <p className="text-xs text-stone-400 text-center py-2">
                        {isAdmin
                          ? 'この曜日のテンプレートはありません（下のカスタム時間で入力）'
                          : 'この日は申請できるシフト枠がありません'}
                      </p>
                    )
                  }
                  return dayTemplates.map(t => (
                    <button key={t.id} onClick={() => { setSelectedTemplate(t.id); setCustomStart(''); setCustomEnd('') }}
                      className={'w-full flex justify-between px-3 py-2 rounded-xl text-sm transition-all ' + (
                        selectedTemplate === t.id && !customStart ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700'
                      )}>
                      <span>{t.name}</span>
                      <span className="opacity-60">{t.start_time.slice(0,5)}〜{t.end_time.slice(0,5)}</span>
                    </button>
                  ))
                })()}
                {isAdmin && (
                  <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
                    <p className="text-xs text-teal-600 font-medium">⚙️ カスタム時間（admin専用）</p>
                    <div className="flex items-center gap-2">
                      <select className="flex-1 border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white text-stone-700"
                        onChange={e => { setCustomStart(e.target.value); setSelectedTemplate('') }}>
                        <option value="">開始</option>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-stone-400 text-sm">〜</span>
                      <select className="flex-1 border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white text-stone-700"
                        onChange={e => { setCustomEnd(e.target.value); setSelectedTemplate('') }}>
                        <option value="">終了</option>
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {customStart && customEnd && (
                      <p className="text-xs text-teal-600 text-center font-medium">{customStart}〜{customEnd} ✓</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button onClick={submitShift} disabled={loading || (!isAdmin && !selectedTemplate)}
              className={'w-full py-3 rounded-xl font-medium transition-all tracking-wider ' + (
                isAdmin ? 'bg-stone-800 text-white disabled:opacity-50' :
                'bg-teal-600 text-white disabled:opacity-50'
              )}>
              {loading
                ? '処理中...'
                : isAdmin
                  ? 'シフト登録'
                  : selectedTemplate
                    ? 'シフトを申請する'
                    : 'シフト枠を選んでください'}
            </button>
          </div>
        </div>
      )}
      <button onClick={() => window.history.back()} className="text-stone-400 text-xs hover:text-stone-600">← ホームに戻る</button>
    </main>
  )
}
