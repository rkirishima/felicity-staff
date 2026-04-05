'use client'
export const dynamic = 'force-dynamic'
import React, { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getSession, saveSession } from '@/lib/session'
import Image from 'next/image'

type Staff = { id: string; name: string; role: string; hourly_rate: number }
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
  const [showCheckPrompt, setShowCheckPrompt] = useState<string | null>(null)
  const autoResetRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])


  useEffect(() => {
    const session = getSession()
    if (session) {
      const s = staffList.find(x => x.id === session.staffId)
      if (s) { setSelected(s); setStep('main') }
    }
  }, [staffList])

  useEffect(() => {
    getSb().from('staff').select('id, name, role, hourly_rate')
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
    const { data } = await getSb().from('staff').select('pin').eq('id', selected.id).single()
    if (inputPin !== (data?.pin || '1234')) {
      setPinError(true)
      setTimeout(() => setPin(''), 600)
      return
    }
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
    await loadStats(selected, 'week')
    saveSession(selected)
    setStep('main')
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
    // 打刻履歴
    const { data: hist } = await getSb().from('timeclock')
      .select('clock_in, clock_out')
      .eq('staff_id', staff.id)
      .order('clock_in', { ascending: false })
      .limit(7)
    setClockHistory(hist ?? [])
  }

  async function clockIn() {
    if (!selected) return
    setLoading(true)
    // GPS確認
    const nearby = await checkLocation()
    if (!nearby) {
      toast.error('店舗の近くにいる時のみ出勤できます📍')
      setLoading(false)
      return
    }
    // 二重出勤防止
    const today = todayJST()
    const { data: existing } = await getSb().from('timeclock')
      .select('id')
      .eq('staff_id', selected.id)
      .gte('clock_in', today + 'T00:00:00+09:00')
      .lte('clock_in', today + 'T23:59:59+09:00')
      .is('clock_out', null)
      .maybeSingle()
    if (existing) {
      setClockStatus('clocked_in')
      setLoading(false)
      return
    }
    const { error } = await getSb().from('timeclock').insert({
      staff_id: selected.id,
      clock_in: new Date().toISOString()
    })
    if (error) { toast.error('エラーが発生しました'); setLoading(false); return }
    setClockInTime(new Date())
    setClockStatus('clocked_in')
    toast.success(selected.name.split(' ')[0] + 'さん、おはようございます！')
    setLoading(false)
    // 最初の出勤者ならオープンチェックへ
    const { data: todayAll } = await getSb().from('timeclock')
      .select('id').gte('clock_in', today + 'T00:00:00+09:00')
    if (todayAll && todayAll.length <= 1) {
      setTimeout(() => setShowCheckPrompt('opening'), 1500)
    }
  }

  async function clockOut() {
    if (!selected) return
    setLoading(true)
    // GPS確認
    const nearby = await checkLocation()
    if (!nearby) {
      toast.error('店舗の近くにいる時のみ退勤できます📍')
      setLoading(false)
      return
    }
    const { error } = await getSb().from('timeclock')
      .update({ clock_out: new Date().toISOString() })
      .eq('staff_id', selected.id)
      .is('clock_out', null)
    if (error) { toast.error('エラーが発生しました'); setLoading(false); return }
    const outTime = new Date()
    setClockOutTime(outTime)
    setClockStatus('clocked_out')
    toast.success(selected.name.split(' ')[0] + 'さん、お疲れ様でした！')
    await loadStats(selected, statsPeriod)
    setLoading(false)
    // クローズチェックへ誘導
    setTimeout(() => setShowCheckPrompt('closing'), 1500)
    // 10秒後に自動でホームに戻る
    autoResetRef.current = setTimeout(() => reset(), 10000)
  }

  // GPS
  const CAFE_LAT = 35.267359
  const CAFE_LNG = 139.610321
  const CAFE_RADIUS = 500

  function calcDist(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  async function checkLocation(): Promise<boolean> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(false); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve(calcDist(pos.coords.latitude, pos.coords.longitude, CAFE_LAT, CAFE_LNG) <= CAFE_RADIUS),
        () => resolve(false),
        { timeout: 8000, maximumAge: 60000 }
      )
    })
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

        {/* 時計 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 text-center">
          <p className="text-xs text-stone-400 mb-1">{dateStr}</p>
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
              {clockHistory.map((r, i) => {
                const cin = new Date(r.clock_in)
                const cout = r.clock_out ? new Date(r.clock_out) : null
                const h = cout ? ((cout.getTime() - cin.getTime()) / 3600000).toFixed(1) : null
                return (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <div>
                      <p className="text-stone-600">{cin.toLocaleDateString('ja-JP', { month:'numeric', day:'numeric', weekday:'short' })}</p>
                      <p className="text-xs text-stone-400">
                        {cin.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}〜{cout ? cout.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' }) : '退勤未記録'}
                      </p>
                    </div>
                    <p className={h ? 'text-stone-700 font-medium' : 'text-amber-500 text-xs'}>{h ? h + 'h' : '勤務中'}</p>
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
        <div className="flex flex-col items-center mb-6"><Image src="https://felicity.cafe/felicity-logo.png" alt="Felicity" width={110} height={42} className="object-contain opacity-80" unoptimized /><span className="text-xs text-stone-300 tracking-widest mt-1">v1.3.1</span></div>
        <div className="text-center">
          <div className="flex items-end justify-center gap-1">
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize:'72px', lineHeight:1, fontFamily:'Georgia, serif' }}>{H}</span>
            <span className="font-light text-stone-300 mb-2" style={{ fontSize:'48px', fontFamily:'Georgia, serif' }}>:</span>
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize:'72px', lineHeight:1, fontFamily:'Georgia, serif' }}>{M}</span>
            <span className="font-light text-stone-300 mb-2 ml-1 tabular-nums" style={{ fontSize:'24px', fontFamily:'Georgia, serif' }}>{S}</span>
          </div>
          <p className="text-xs tracking-widest text-stone-400 mt-2">{dateStr}</p>
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
