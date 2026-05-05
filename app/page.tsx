'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getSession, saveSession } from '@/lib/session'
import Image from 'next/image'
import { verifyStaffPin, reportAbsence } from '@/app/admin/actions'
import { LOCATION_META, locationOf } from '@/lib/shift-locations'

type Staff = { id: string; name: string; role: string; hourly_rate?: number }
type ClockStatus = 'not_clocked' | 'clocked_in' | 'clocked_out'

function getSb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// JST今日の日付を返す
function todayJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function HomePage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selected, setSelected] = useState<Staff | null>(null)
  const [step, setStep] = useState<'select' | 'pin' | 'main'>('select')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())
  const [clockStatus, setClockStatus] = useState<ClockStatus>('not_clocked')
  const [clockInTime, setClockInTime] = useState<Date | null>(null)
  const [clockOutTime, setClockOutTime] = useState<Date | null>(null)
  const [weekStats, setWeekStats] = useState<{ hours: number; pay: number } | null>(null)
  const [statsPeriod, setStatsPeriod] = useState<'week' | 'month'>('week')
  const [clockHistory, setClockHistory] = useState<any[]>([])
  const [upcomingShifts, setUpcomingShifts] = useState<any[]>([])
  const [absenceConfirm, setAbsenceConfirm] = useState<string | null>(null)
  const [showCheckPrompt, setShowCheckPrompt] = useState<string | null>(null)
  const [prepAlerts, setPrepAlerts] = useState<{ eventTitle: string; date: string; startTime?: string; tasks: { task: string }[] }[]>([])
  const [todayEvents, setTodayEvents] = useState<{ title: string; startTime?: string; endTime?: string; floor?: string }[]>([])
  const autoResetRef = useRef<NodeJS.Timeout | null>(null)
  const clockingRef = useRef(false) // 二重タップ防止ロック
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])


  useEffect(() => {
    const session = getSession()
    if (session) {
      const s = staffList.find(x => x.id === session.staffId)
      if (s) {
        getSb().from('staff').select('hourly_rate').eq('id', s.id).single().then(({ data: rd }) => {
          const staffWithRate: Staff = { ...s, hourly_rate: rd?.hourly_rate ?? 1300 }
          setSelected(staffWithRate)
          setStep('main')
          loadStats(staffWithRate, 'week')
          loadUpcomingShifts(s.id)
        })
      }
    }
  }, [staffList])

  useEffect(() => {
    getSb().from('staff').select('id, name, role')
      .eq('active', true).not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaffList((data ?? []) as Staff[]))
  }, [])

  function cancelAutoReset() {
    if (autoResetRef.current) {
      clearTimeout(autoResetRef.current)
      autoResetRef.current = null
    }
  }

  function reset() {
    cancelAutoReset()
    setSelected(null)
    setStep('select')
    setPin('')
    setPinError(false)
    setClockStatus('not_clocked')
    setClockInTime(null)
    setClockOutTime(null)
    setWeekStats(null)
    setClockHistory([])
    setShowCheckPrompt(null)
    setStatsPeriod('week')
  }

  function handleSelect(s: Staff) {
    cancelAutoReset()
    if (s.role === 'admin') { router.push('/admin'); return }
    setSelected(s)
    setPin('')
    setPinError(false)
    setClockStatus('not_clocked')
    setClockInTime(null)
    setClockOutTime(null)
    setStep('pin')
  }

  function handlePinInput(n: string) {
    setPinError(false)
    const next = pin + n
    setPin(next)
    if (next.length === 4) verifyPin(next)
  }

  async function verifyPin(inputPin: string) {
    if (!selected) return
    const ok = await verifyStaffPin(selected.id, inputPin)
    if (!ok) {
      setPinError(true)
      setTimeout(() => setPin(''), 600)
      return
    }
    // PINが正しければ hourly_rate を取得
    const { data: rateData } = await getSb().from('staff').select('hourly_rate').eq('id', selected.id).single()
    const staffWithRate: Staff = { ...selected, hourly_rate: rateData?.hourly_rate ?? 1300 }
    setSelected(staffWithRate)
    // 今日(JST)の打刻状況を確認
    const today = todayJST()
    const { data: records } = await getSb().from('timeclock')
      .select('id, clock_in, clock_out')
      .eq('staff_id', selected.id)
      .gte('clock_in', today + 'T00:00:00+09:00')
      .lte('clock_in', today + 'T23:59:59+09:00')
      .order('clock_in', { ascending: false })
      .limit(1)
    const latest = records?.[0]
    if (!latest) {
      setClockStatus('not_clocked')
    } else if (!latest.clock_out) {
      setClockStatus('clocked_in')
      setClockInTime(new Date(latest.clock_in))
    } else {
      setClockStatus('clocked_out')
      setClockInTime(new Date(latest.clock_in))
      setClockOutTime(new Date(latest.clock_out))
    }
    await loadStats(staffWithRate, 'week')
    loadUpcomingShifts(staffWithRate.id)
    loadPrepAlerts()
    saveSession(staffWithRate)
    setStep('main')
  }

  async function loadPrepAlerts() {
    try {
      const res = await fetch('/api/events/prep-alert')
      if (res.ok) {
        const data = await res.json()
        setPrepAlerts(data.prepAlerts || [])
        setTodayEvents(data.todayEvents || [])
      }
    } catch {}
  }

  async function loadUpcomingShifts(staffId: string) {
    const today = todayJST()
    const in7days = new Date(Date.now() + 9*60*60*1000 + 7*24*60*60*1000).toISOString().slice(0,10)
    const { data } = await getSb().from('shifts')
      .select('id, date, start_time, end_time, status, location')
      .eq('staff_id', staffId)
      .eq('status', 'approved')
      .gte('date', today)
      .lte('date', in7days)
      .order('date')
    setUpcomingShifts(data ?? [])
  }

  async function handleAbsence(shift: any) {
    if (!selected) return
    setAbsenceConfirm(null)
    await reportAbsence(shift.id, selected.name, shift.date, shift.start_time, shift.end_time)
    toast.success('LINEグループに通知しました')
    if (selected) loadUpcomingShifts(selected.id)
  }

  async function loadStats(staff: Staff, period: 'week' | 'month') {
    const from = new Date()
    if (period === 'week') {
      from.setDate(from.getDate() - from.getDay() + 1)
    } else {
      from.setDate(1)
    }
    from.setHours(0, 0, 0, 0)
    
    const { data } = await getSb().from('timeclock')
      .select('clock_in, clock_out')
      .eq('staff_id', staff.id)
      .gte('clock_in', from.toISOString())
    
    const hours = (data ?? []).reduce((sum, r) => {
      if (!r.clock_out) return sum
      return sum + (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
    }, 0)
    setWeekStats({ hours: Math.round(hours * 10) / 10, pay: Math.round(hours * (staff.hourly_rate || 1300)) })
    
    // 打刻履歴（shifts との JOIN）
    const { data: hist } = await getSb().from('timeclock')
      .select(`
        id,
        clock_in,
        clock_out,
        shift_id,
        shifts(id, start_time, end_time, date, location)
      `)
      .eq('staff_id', staff.id)
      .order('clock_in', { ascending: false })
      .limit(7)
    setClockHistory(hist ?? [])
  }

  async function clockIn() {
    if (!selected || clockingRef.current) return
    clockingRef.current = true
    setLoading(true)
    try {
      // 二重出勤防止（連打吸収）— 今日の未退勤レコードがあればそれを採用
      const today = todayJST()
      const { data: existing } = await getSb().from('timeclock')
        .select('id, clock_in')
        .eq('staff_id', selected.id)
        .gte('clock_in', today + 'T00:00:00+09:00')
        .lte('clock_in', today + 'T23:59:59+09:00')
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing) {
        setClockInTime(new Date(existing.clock_in))
        setClockStatus('clocked_in')
        return
      }

      const now = new Date()
      const { error } = await getSb().from('timeclock').insert({
        staff_id: selected.id,
        clock_in: now.toISOString()
      })
      if (error) { toast.error('エラーが発生しました'); return }
      setClockInTime(now)
      setClockStatus('clocked_in')
      toast.success(selected.name.split(' ')[0] + 'さん、おはようございます！')

      // 最初の出勤者ならオープンチェックへ
      const { data: todayAll } = await getSb().from('timeclock')
        .select('id').gte('clock_in', today + 'T00:00:00+09:00').lte('clock_in', today + 'T23:59:59+09:00')
      if (todayAll && todayAll.length <= 1) {
        setTimeout(() => setShowCheckPrompt('opening'), 1500)
      }
    } finally {
      setLoading(false)
      clockingRef.current = false
    }
  }

  async function clockOut() {
    if (!selected || clockingRef.current) return
    clockingRef.current = true
    setLoading(true)
    try {
      // 退勤対象は「最新の未退勤レコード」1件のみ（昨日以前の取り残しを巻き込まない）
      const today = todayJST()
      let { data: open } = await getSb().from('timeclock')
        .select('id, clock_in')
        .eq('staff_id', selected.id)
        .gte('clock_in', today + 'T00:00:00+09:00')
        .lte('clock_in', today + 'T23:59:59+09:00')
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 今日の未退勤がない場合は、深夜跨ぎ等の救済として直近24時間以内の未退勤を退勤対象にする
      if (!open) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: recent } = await getSb().from('timeclock')
          .select('id, clock_in')
          .eq('staff_id', selected.id)
          .gte('clock_in', cutoff)
          .is('clock_out', null)
          .order('clock_in', { ascending: false })
          .limit(1)
          .maybeSingle()
        open = recent
      }

      if (!open) {
        toast.error('出勤記録が見つかりません')
        return
      }

      const outTime = new Date()
      const { error } = await getSb().from('timeclock')
        .update({ clock_out: outTime.toISOString() })
        .eq('id', open.id)
      if (error) { toast.error('エラーが発生しました'); return }
      setClockInTime(new Date(open.clock_in))
      setClockOutTime(outTime)
      setClockStatus('clocked_out')
      toast.success(selected.name.split(' ')[0] + 'さん、お疲れ様でした！')
      await loadStats(selected, statsPeriod)
      // クローズチェックへ誘導
      setTimeout(() => setShowCheckPrompt('closing'), 1500)
      // 10秒後に自動でホームに戻る
      autoResetRef.current = setTimeout(() => reset(), 10000)
    } finally {
      setLoading(false)
      clockingRef.current = false
    }
  }

  const H = String(now.getHours()).padStart(2,'0')
  const M = String(now.getMinutes()).padStart(2,'0')
  const S = String(now.getSeconds()).padStart(2,'0')
  const dateStr = now.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'long' })

  // チェックリスト促進画面
  if (showCheckPrompt) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-5xl">{showCheckPrompt === 'opening' ? '🌅' : '🌙'}</div>
      <div className="text-center">
        <p className="text-xl font-medium text-stone-800 mb-1">{showCheckPrompt === 'opening' ? 'オープン作業' : 'クローズ作業'}</p>
        <p className="text-stone-400 text-sm">チェックリストに進みますか？</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => { cancelAutoReset(); router.push('/operations?type=' + showCheckPrompt) }}
          className="w-full py-4 rounded-2xl text-lg font-medium text-white" style={{ backgroundColor: '#1c1917' }}>
          チェックリストへ
        </button>
        <button onClick={reset} className="w-full py-4 rounded-2xl text-sm border-2 border-stone-300 text-stone-500">
          あとで
        </button>
      </div>
    </main>
  )

  // メイン打刻画面（PIN認証後）
  if (step === 'main' && selected) {
    const workedMins = clockInTime && clockStatus === 'clocked_in'
      ? Math.floor((now.getTime() - clockInTime.getTime()) / 60000) : 0
    const workedH = Math.floor(workedMins / 60)
    const workedM = workedMins % 60

    return (
      <main className="min-h-screen p-5 pb-24" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xl font-medium text-stone-800">{selected.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={'w-2 h-2 rounded-full ' + (
                clockStatus === 'clocked_in' ? 'bg-teal-500 animate-pulse' :
                clockStatus === 'clocked_out' ? 'bg-stone-400' : 'bg-amber-400'
              )} />
              <p className="text-xs text-stone-400">
                {clockStatus === 'clocked_in' ? '勤務中' : clockStatus === 'clocked_out' ? '退勤済み' : '未出勤'}
              </p>
            </div>
          </div>
          <button onClick={reset} className="text-xs text-stone-400 px-3 py-1.5 bg-white rounded-xl shadow-sm">
            戻る
          </button>
        </div>

        {/* 明日の準備アラート */}
        {prepAlerts.length > 0 && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 mb-4">
            <p className="text-xs font-bold text-amber-700 mb-2">🧹 明日の準備</p>
            {prepAlerts.map((alert, idx) => (
              <div key={idx} className="mb-2 last:mb-0">
                <p className="text-sm font-medium text-stone-700">
                  {alert.eventTitle}
                  {alert.startTime && <span className="text-stone-400 font-normal ml-1">{alert.startTime.slice(0, 5)}〜</span>}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {alert.tasks.map((t, i) => (
                    <li key={i} className="text-sm text-amber-800 flex items-start gap-1.5">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      {t.task}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* 本日のイベント */}
        {todayEvents.length > 0 && (
          <div className="rounded-2xl border-2 border-teal-200 bg-teal-50 p-4 mb-4">
            <p className="text-xs font-bold text-teal-700 mb-2">🎉 本日のイベント</p>
            {todayEvents.map((ev, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-stone-700 font-medium">{ev.title}</span>
                <span className="text-stone-400 text-xs">
                  {ev.startTime && `${ev.startTime.slice(0, 5)}`}
                  {ev.endTime && `〜${ev.endTime.slice(0, 5)}`}
                  {ev.floor && ` ${ev.floor}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 時計 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 text-center">
          <p className="text-xs text-stone-400 mb-1" suppressHydrationWarning>{dateStr}</p>
          <div className="flex items-end justify-center gap-1">
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize:'56px', lineHeight:1, fontFamily:'Georgia, serif' }}>{H}</span>
            <span className="font-light text-stone-300 mb-1" style={{ fontSize:'36px', fontFamily:'Georgia, serif' }}>:</span>
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize:'56px', lineHeight:1, fontFamily:'Georgia, serif' }}>{M}</span>
            <span className="font-light text-stone-300 mb-1 ml-1" style={{ fontSize:'20px', fontFamily:'Georgia, serif' }}>{S}</span>
          </div>
          {clockInTime && (
            <div className="flex justify-center gap-6 mt-3 text-xs text-stone-400">
              <span>出勤 {clockInTime.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}</span>
              {clockOutTime && <span>退勤 {clockOutTime.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}</span>}
            </div>
          )}
          {clockStatus === 'clocked_in' && (
            <div className="mt-3">
              <p className="text-xs text-stone-400 mb-0.5">勤務時間</p>
              <p className="text-2xl font-light text-teal-600 tabular-nums" style={{ fontFamily:'Georgia, serif' }}>
                {String(workedH).padStart(2,'0')}:{String(workedM).padStart(2,'0')}
              </p>
            </div>
          )}
        </div>

        {/* 打刻ボタン */}
        {clockStatus === 'not_clocked' && (
          <button onClick={clockIn} disabled={loading}
            className="w-full py-5 rounded-2xl text-lg font-medium tracking-widest text-white mb-4 disabled:opacity-50"
            style={{ backgroundColor: '#1c1917' }}>
            {loading ? '確認中...' : '出 勤'}
          </button>
        )}
        {clockStatus === 'clocked_in' && (
          <button onClick={clockOut} disabled={loading}
            className="w-full py-5 rounded-2xl text-lg font-medium tracking-widest border-2 border-stone-300 text-stone-600 mb-4 disabled:opacity-50 hover:border-stone-500">
            {loading ? '処理中...' : '退 勤'}
          </button>
        )}
        {clockStatus === 'clocked_out' && clockInTime && clockOutTime && (
          <div className="w-full rounded-2xl bg-teal-50 border-2 border-teal-300 text-center mb-4 p-5">
            <p className="text-4xl mb-2">✅</p>
            <p className="text-teal-700 font-bold text-xl">退勤完了！</p>
            <p className="text-teal-600 text-sm mt-1">
              {clockInTime.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}〜{clockOutTime.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}
            </p>
            <p className="text-xs text-teal-500 mt-1 mb-4">お疲れ様でした 🙌</p>
            <button onClick={reset}
              className="w-full py-3 bg-stone-800 text-white rounded-xl font-medium text-sm tracking-wider">
              ← ホームに戻る
            </button>
          </div>
        )}

        {/* 今週/今月実績 */}
        {weekStats && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone-400">📊 実績</p>
              <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
                {(['week', 'month'] as const).map(p => (
                  <button key={p} onClick={() => { setStatsPeriod(p); loadStats(selected, p) }}
                    className={'px-3 py-1 rounded-md text-xs font-medium transition-all ' + (statsPeriod === p ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400')}>
                    {p === 'week' ? '今週' : '今月'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-medium text-stone-800">{weekStats.hours}h</p>
                <p className="text-xs text-stone-400 mt-1">勤務時間</p>
              </div>
              <div>
                <p className="text-2xl font-medium text-teal-600">¥{weekStats.pay.toLocaleString()}</p>
                <p className="text-xs text-stone-400 mt-1">見積もり報酬</p>
              </div>
            </div>
          </div>
        )}

        {/* 打刻履歴 */}
        {clockHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <p className="text-xs text-stone-400 mb-3">🕐 打刻履歴</p>
            <div className="space-y-2">
              {clockHistory.map((r: any, i) => {
                const cin = new Date(r.clock_in)
                const cout = r.clock_out ? new Date(r.clock_out) : null
                const h = cout ? ((cout.getTime() - cin.getTime()) / 3600000).toFixed(1) : null
                const shiftStart = r.shifts?.start_time ? new Date('2000-01-01T' + r.shifts.start_time).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) : null
                const shiftEnd = r.shifts?.end_time ? new Date('2000-01-01T' + r.shifts.end_time).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) : null
                const shiftDate = r.shifts?.date ? new Date(r.shifts.date).toLocaleDateString('ja-JP', { month:'numeric', day:'numeric' }) : null
                const loc = locationOf(r.shifts)
                const meta = LOCATION_META[loc]
                return (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                        <p className="text-stone-600">{cin.toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', weekday:'short' })}</p>
                        {loc !== 'cafe' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${meta.badge}`}>{meta.emoji}</span>
                        )}
                      </div>
                      <p className="text-xs text-stone-400">
                        🕐 {cin.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}〜{cout ? cout.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) : '退勤未記録'}
                      </p>
                      {shiftStart && shiftEnd && (
                        <p className="text-xs text-stone-300">
                          📅 {shiftDate || ''} {shiftStart}〜{shiftEnd}
                        </p>
                      )}
                    </div>
                    <p className={h ? 'text-stone-700 font-medium text-right' : 'text-amber-500 text-xs text-right'}>{h ? h + 'h' : '勤務中'}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 今後のシフト */}
        {upcomingShifts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
            <p className="text-xs text-stone-400 mb-3">📅 今後のシフト</p>
            <div className="space-y-2">
              {upcomingShifts.map(s => {
                const d = new Date(s.date + 'T12:00:00')
                const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
                const label = `${d.getMonth()+1}/${d.getDate()}(${weekday}) ${s.start_time.slice(0,5)}〜${s.end_time.slice(0,5)}`
                const loc = locationOf(s)
                const meta = LOCATION_META[loc]
                return (
                  <div key={s.id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-stone-700">
                      <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      {label}
                      {loc !== 'cafe' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${meta.badge}`}>{meta.emoji} {meta.label}</span>
                      )}
                    </span>
                    {absenceConfirm === s.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleAbsence(s)}
                          className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-bold">送信</button>
                        <button onClick={() => setAbsenceConfirm(null)}
                          className="px-3 py-1 bg-stone-100 text-stone-500 rounded-lg text-xs">戻る</button>
                      </div>
                    ) : (
                      <button onClick={() => setAbsenceConfirm(s.id)}
                        className="px-3 py-1 bg-red-50 text-red-500 border border-red-200 rounded-lg text-xs font-medium">
                        入れません
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => router.push('/schedule')}
            className="flex-1 py-3 bg-white rounded-2xl shadow-sm text-sm text-stone-600 font-medium">
            📅 シフト確認
          </button>
          <button onClick={() => router.push('/staff/settings')}
            className="flex-1 py-3 bg-white rounded-2xl shadow-sm text-sm text-stone-600 font-medium">
            🔐 PIN変更
          </button>
        </div>

        <button onClick={() => router.push('/admin/shipping')}
          className="w-full py-3 bg-white rounded-2xl shadow-sm text-sm text-stone-600 font-medium">
          📦 発注・発送管理
        </button>
      </main>
    )
  }

  // PIN入力画面
  if (step === 'pin' && selected) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <p className="text-xl font-medium text-stone-800">{selected.name.split(' ')[0]}</p>
        <p className="text-xs tracking-widest text-stone-400 mt-1">PINを入力してください</p>
      </div>
      <div className="flex gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className={'w-4 h-4 rounded-full transition-all ' + (
            pin.length > i ? (pinError ? 'bg-red-400' : 'bg-stone-800') : 'bg-stone-300'
          )} />
        ))}
      </div>
      {pinError && <p className="text-xs text-red-400 -mt-3">PINが違います</p>}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n, i) => (
          <button key={i} onClick={() => {
            if (n === '⌫') setPin(p => p.slice(0,-1))
            else if (n !== '') handlePinInput(n)
          }} className={'py-4 rounded-2xl text-xl font-medium transition-all ' + (n === '' ? '' : 'bg-white text-stone-700 shadow-sm active:scale-95')}>
            {n}
          </button>
        ))}
      </div>
      <button onClick={() => { setStep('select'); setSelected(null); setPin('') }}
        className="flex items-center gap-1 text-stone-400 text-sm px-4 py-2 bg-white rounded-xl shadow-sm">
        ← ホームに戻る
      </button>
    </main>
  )

  // スタッフ選択画面
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <div className="flex flex-col items-center mb-6"><Image src="https://felicity.cafe/felicity-logo.png" alt="Felicity" width={110} height={42} className="object-contain opacity-80" unoptimized /><span className="text-xs text-stone-300 tracking-widest mt-1">v1.7</span></div>
        <div className="text-center">
          <div className="flex items-end justify-center gap-1">
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize:'72px', lineHeight:1, fontFamily:'Georgia, serif' }}>{H}</span>
            <span className="font-light text-stone-300 mb-2" style={{ fontSize:'48px', fontFamily:'Georgia, serif' }}>:</span>
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize:'72px', lineHeight:1, fontFamily:'Georgia, serif' }}>{M}</span>
            <span className="font-light text-stone-300 mb-2 ml-1 tabular-nums" style={{ fontSize:'24px', fontFamily:'Georgia, serif' }}>{S}</span>
          </div>
          <p className="text-xs tracking-widest text-stone-400 mt-2" suppressHydrationWarning>{dateStr}</p>
        </div>
      </div>
      <div className="mx-8 border-t border-stone-200 mb-6" />
      <div className="flex-1 flex flex-col px-6 pb-24">
        <p className="text-xs tracking-widest text-stone-400 text-center mb-4 uppercase">Select Staff</p>
        <div className="grid grid-cols-3 gap-2">
          {staffList.map(s => (
            <button key={s.id} onClick={() => handleSelect(s)}
              className={'py-3 px-2 rounded-2xl text-sm font-medium transition-all shadow-sm ' + (
                s.role === 'admin' ? 'bg-white border-2 border-teal-300 text-teal-700' : 'bg-white text-stone-700 hover:shadow-md'
              )}>
              <div className="text-xs font-normal text-stone-400">{s.name.split(' ')[0]}</div>
              <div>{s.name.split(' ')[1] || ''}</div>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
