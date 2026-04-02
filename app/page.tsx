'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Staff = { id: string; name: string; role: string; hourly_rate: number }

function getSb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function HomePage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selected, setSelected] = useState<Staff | null>(null)
  const [step, setStep] = useState<'select' | 'pin' | 'clock' | 'dashboard'>('select')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())
  const [clockInTime, setClockInTime] = useState<Date | null>(null)
  const [weekStats, setWeekStats] = useState<{ hours: number; pay: number } | null>(null)
  const [showCheckPrompt, setShowCheckPrompt] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    getSb().from('staff').select('id, name, role, hourly_rate')
      .eq('active', true).not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaffList((data ?? []) as Staff[]))
  }, [])

  function handleSelect(s: Staff) {
    if (s.role === 'admin') { router.push('/admin'); return }
    setSelected(s)
    setPin('')
    setPinError(false)
    setStep('pin')
  }

  function handlePinInput(n: string) {
    if (pinError) { setPinError(false) }
    const next = pin + n
    setPin(next)
    if (next.length === 4) {
      verifyPin(next)
    }
  }

  async function verifyPin(inputPin: string) {
    if (!selected) return
    const { data } = await getSb().from('staff').select('pin').eq('id', selected.id).single()
    const correctPin = data?.pin || '1234'
    if (inputPin === correctPin) {
      setStep('clock')
      loadWeekStats()
    } else {
      setPinError(true)
      setTimeout(() => setPin(''), 600)
    }
  }

  async function loadWeekStats() {
    if (!selected) return
    const monday = new Date()
    monday.setDate(monday.getDate() - monday.getDay() + 1)
    monday.setHours(0,0,0,0)
    const { data } = await getSb().from('timeclock')
      .select('clock_in, clock_out')
      .eq('staff_id', selected.id)
      .gte('clock_in', monday.toISOString())
    const hours = (data ?? []).reduce((sum, r) => {
      if (!r.clock_out) return sum
      return sum + (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
    }, 0)
    setWeekStats({ hours: Math.round(hours * 10) / 10, pay: Math.round(hours * (selected.hourly_rate || 1300)) })
  }

  async function handleClock(type: 'in' | 'out') {
    if (!selected) return
    setLoading(true)
    const sb = getSb()
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    if (type === 'in') {
      await sb.from('timeclock').insert({ staff_id: selected.id, clock_in: new Date().toISOString() })
      setClockInTime(new Date())
      toast.success(selected.name.split(' ')[0] + 'さん、おはようございます')
      setStep('dashboard')
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await sb.from('timeclock').select('id').gte('clock_in', today + 'T00:00:00')
      if (data && data.length <= 1) setTimeout(() => setShowCheckPrompt('opening'), 2000)
    } else {
      await sb.from('timeclock').update({ clock_out: new Date().toISOString() })
        .eq('staff_id', selected.id).is('clock_out', null)
      toast.success(selected.name.split(' ')[0] + 'さん、お疲れ様でした')
      await loadWeekStats()
      setStep('dashboard')
      setTimeout(() => setShowCheckPrompt('closing'), 2000)
    }
    setLoading(false)
  }

  function reset() {
    setSelected(null); setStep('select'); setPin('')
    setClockInTime(null); setWeekStats(null); setShowCheckPrompt(null)
  }

  const H = String(now.getHours()).padStart(2,'0')
  const M = String(now.getMinutes()).padStart(2,'0')
  const S = String(now.getSeconds()).padStart(2,'0')
  const dateStr = now.toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric', weekday:'long' })

  // チェックリスト促進
  if (showCheckPrompt) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-5xl">{showCheckPrompt === 'opening' ? '🌅' : '🌙'}</div>
      <div className="text-center">
        <p className="text-xl font-medium text-stone-800 mb-1">{showCheckPrompt === 'opening' ? 'オープン作業' : 'クローズ作業'}</p>
        <p className="text-stone-400 text-sm">チェックリストに進みますか？</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => router.push('/operations?type=' + showCheckPrompt)}
          className="w-full py-4 rounded-2xl text-lg font-medium text-white" style={{ backgroundColor: '#1c1917' }}>
          チェックリストへ
        </button>
        <button onClick={reset} className="w-full py-4 rounded-2xl text-sm border-2 border-stone-300 text-stone-500">
          あとで
        </button>
      </div>
    </main>
  )

  // マイダッシュボード
  if (step === 'dashboard' && selected) {
    const workedMins = clockInTime ? Math.floor((now.getTime() - clockInTime.getTime()) / 60000) : 0
    const workedH = Math.floor(workedMins / 60)
    const workedM = workedMins % 60
    return (
      <main className="min-h-screen p-6 pb-24" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs tracking-widest text-stone-400 uppercase">勤務中</p>
            <p className="text-xl font-medium text-stone-800">{selected.name}</p>
          </div>
          <button onClick={reset} className="text-stone-400 text-xs px-3 py-1 bg-white rounded-xl shadow-sm">戻る</button>
        </div>

        {clockInTime && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-4 text-center">
            <p className="text-xs text-stone-400 mb-1">本日の勤務時間</p>
            <p className="text-5xl font-light text-stone-800 tabular-nums" style={{ fontFamily: 'Georgia, serif' }}>
              {String(workedH).padStart(2,'0')}:{String(workedM).padStart(2,'0')}
            </p>
            <p className="text-xs text-stone-400 mt-2">
              {clockInTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 出勤
            </p>
          </div>
        )}

        {weekStats && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <p className="text-xs text-stone-400 mb-3">📊 今週の実績</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-medium text-stone-800">{weekStats.hours}h</p>
                <p className="text-xs text-stone-400 mt-1">勤務時間</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-medium text-teal-600">¥{weekStats.pay.toLocaleString()}</p>
                <p className="text-xs text-stone-400 mt-1">見積もり報酬</p>
              </div>
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
            ⚙️ 設定
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
          <div key={i} className={`w-4 h-4 rounded-full transition-all ${
            pin.length > i ? (pinError ? 'bg-red-400' : 'bg-stone-800') : 'bg-stone-300'
          }`} />
        ))}
      </div>
      {pinError && <p className="text-xs text-red-400 -mt-3">PINが違います</p>}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n, i) => (
          <button key={i} onClick={() => {
            if (n === '⌫') setPin(p => p.slice(0,-1))
            else if (n !== '') handlePinInput(n)
          }} className={`py-4 rounded-2xl text-xl font-medium transition-all ${
            n === '' ? '' : 'bg-white text-stone-700 shadow-sm hover:shadow-md active:scale-95'
          }`}>{n}</button>
        ))}
      </div>
      <button onClick={() => { setStep('select'); setSelected(null) }}
        className="text-stone-400 text-xs">キャンセル</button>
    </main>
  )

  // 出退勤ボタン画面
  if (step === 'clock' && selected) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <p className="text-xs tracking-widest text-stone-400 uppercase mb-1">打刻</p>
        <p className="text-2xl font-medium text-stone-800">{selected.name}</p>
        <p className="text-stone-400 text-sm mt-1">{H}:{M}</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => handleClock('in')} disabled={loading}
          className="w-full py-5 rounded-2xl text-lg font-medium tracking-widest text-white disabled:opacity-50"
          style={{ backgroundColor: '#1c1917' }}>
          出 勤
        </button>
        <button onClick={() => handleClock('out')} disabled={loading}
          className="w-full py-5 rounded-2xl text-lg font-medium tracking-widest border-2 border-stone-300 text-stone-600 disabled:opacity-50">
          退 勤
        </button>
        <button onClick={() => setStep('select')} className="text-stone-400 text-xs text-center mt-1">キャンセル</button>
      </div>
    </main>
  )

  // スタッフ選択画面
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <Image src="https://felicity.cafe/felicity-logo.png" alt="Felicity"
          width={110} height={42} className="object-contain mb-6 opacity-80" unoptimized />
        <div className="text-center">
          <div className="flex items-end justify-center gap-1">
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize: '72px', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{H}</span>
            <span className="font-light text-stone-300 mb-2" style={{ fontSize: '48px', fontFamily: 'Georgia, serif' }}>:</span>
            <span className="font-light text-stone-800 tabular-nums" style={{ fontSize: '72px', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{M}</span>
            <span className="font-light text-stone-300 mb-2 ml-1 tabular-nums" style={{ fontSize: '24px', fontFamily: 'Georgia, serif' }}>{S}</span>
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
              className={`py-3 px-2 rounded-2xl text-sm font-medium transition-all shadow-sm ${
                s.role === 'admin' ? 'bg-white border-2 border-teal-300 text-teal-700' : 'bg-white text-stone-700 hover:shadow-md'
              }`}>
              <div className="text-xs font-normal text-stone-400">{s.name.split(' ')[0]}</div>
              <div>{s.name.split(' ')[1] || ''}</div>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}
