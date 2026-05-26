'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { saveSession, getAdminSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/client'
import { verifyAdminPin } from './actions'

export default function AdminPage() {
  const [pin, setPin] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState(false)
  const [todayCost, setTodayCost] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [now, setNow] = useState(new Date())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (getAdminSession()) setUnlocked(true)
  }, [])

  useEffect(() => {
    if (!unlocked) return
    loadTodayCost()
    timerRef.current = setInterval(() => {
      setNow(new Date())
      loadTodayCost()
    }, 60000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [unlocked])

  async function loadTodayCost() {
    const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data } = await supabase.from('timeclock')
      .select('clock_in, clock_out, staff(hourly_rate)')
      .gte('clock_in', todayJST + 'T00:00:00+09:00')
      .lte('clock_in', todayJST + 'T23:59:59+09:00')
    const nowMs = Date.now()
    let cost = 0
    let active = 0
    for (const r of (data ?? [])) {
      const rate = (r.staff as any)?.hourly_rate || 1300
      const cout = r.clock_out ? new Date(r.clock_out).getTime() : nowMs
      const h = (cout - new Date(r.clock_in).getTime()) / 3600000
      cost += h * rate
      if (!r.clock_out) active++
    }
    setTodayCost(Math.round(cost))
    setActiveCount(active)
  }

  async function handlePin(n: string) {
    const next = pin + n
    setPin(next)
    setError(false)
    if (next.length === 4) {
      const ok = await verifyAdminPin(next)
      if (ok) {
        saveSession({ id: 'admin', name: '桐島', role: 'admin', hourly_rate: 0 })
        window.dispatchEvent(new Event('admin-session-changed'))
        setUnlocked(true)
      } else {
        setError(true)
        setTimeout(() => setPin(''), 500)
      }
    }
  }

  if (!unlocked) return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-[0.3em] text-stone-800">ADMIN</h1>
        <p className="text-stone-400 text-xs mt-1 tracking-widest">PINを入力してください</p>
      </div>
      <div className="flex gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full transition-all ${pin.length > i ? (error ? 'bg-red-400' : 'bg-stone-800') : 'bg-stone-300'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n, i) => (
          <button key={i} onClick={() => {
            if (n === '⌫') setPin(p => p.slice(0,-1))
            else if (n !== '') handlePin(n)
          }} className={`py-4 rounded-2xl text-xl font-medium transition-all ${n === '' ? '' : 'bg-white text-stone-700 shadow-sm active:scale-95'}`}>
            {n}
          </button>
        ))}
      </div>
      <button onClick={() => router.push('/')} className="text-stone-400 text-xs">← 戻る</button>
    </main>
  )

  const sections = [
    { label: '👥 在籍状況', sub: 'リアルタイム', path: '/admin/live', color: 'bg-white border border-stone-100' },
    { label: '⏱ タイムカード', sub: '打刻修正・記録', path: '/admin/timeclock', color: 'bg-white border border-stone-100' },
    { label: '📅 シフト管理', sub: 'カレンダー', path: '/schedule', color: 'bg-white border border-stone-100' },
    { label: '💰 EC売上', sub: '売上集計・注文一覧', path: '/admin/sales', color: 'bg-white border border-stone-100' },
    { label: '📊 経理', sub: 'レシートOCR・請求書・月次', path: '/admin/keiri', color: 'bg-white border border-stone-100' },
    { label: '🔥 焙煎ログ', sub: 'Probat記録・FCR在庫', path: '/admin/roast', color: 'bg-white border border-stone-100' },
    { label: '📦 在庫管理', sub: 'アパレル・グッズ・SKU', path: '/admin/inventory', color: 'bg-white border border-stone-100' },
    { label: '💴 給与管理', sub: '月次・時給設定', path: '/admin/payroll', color: 'bg-white border border-stone-100' },
    { label: '📦 発送管理', sub: '追跡番号・発送通知', path: '/admin/shipping', color: 'bg-white border border-stone-100' },
    { label: '🏷 ラベル印刷', sub: 'ドリップ・業販ラベル', path: '/label', color: 'bg-white border border-stone-100' },
    { label: '🎉 イベント管理', sub: '準備タスク・GCal連携', path: '/admin/events', color: 'bg-white border border-stone-100' },
    { label: '📢 告知', sub: '貸切・イベント告知（Web/SNS連携）', path: '/admin/announcements', color: 'bg-white border border-stone-100' },
  ]

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-stone-800">FELICITY</h1>
        <p className="text-stone-400 text-xs mt-1 tracking-widest">ADMIN</p>
        <p className="text-stone-300 text-xs mt-0.5 tracking-widest">v1.8</p>
      </div>

      {/* 今日のリアルタイムコスト */}
      <div className="w-full max-w-sm bg-stone-800 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-stone-400 tracking-wider">TODAY — LIVE</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            <p className="text-xs text-stone-400">{activeCount}名勤務中</p>
          </div>
        </div>
        <p className="text-3xl font-light text-white">¥{todayCost.toLocaleString()}</p>
        <p className="text-xs text-stone-500 mt-1">{now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} 現在</p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        {sections.map(s => (
          <button key={s.path} onClick={() => router.push(s.path)}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all shadow-sm ${s.color}`}>
            <div className="text-left">
              <p className="font-medium text-stone-700">{s.label}</p>
              <p className="text-xs text-stone-400">{s.sub}</p>
            </div>
            <span className="text-stone-300">→</span>
          </button>
        ))}
      </div>
      <button onClick={() => router.push('/')} className="text-stone-400 text-xs hover:text-stone-600">← ホームに戻る</button>
    </main>
  )
}
