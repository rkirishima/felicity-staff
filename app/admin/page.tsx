'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSession, getAdminSession } from '@/lib/session'

const ADMIN_PIN = '4499'

export default function AdminPage() {
  const [pin, setPin] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState(false)
  const router = useRouter()

  function handlePin(n: string) {
    const next = pin + n
    setPin(next)
    setError(false)
    if (next.length === 4) {
      if (next === ADMIN_PIN) {
        saveSession({ id: 'admin', name: '桐島', role: 'admin', hourly_rate: 0 })
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
    { label: '👥 在籍状況', sub: 'リアルタイム', path: '/admin/live', color: 'bg-teal-50 border border-teal-200' },
    { label: '⏱ タイムカード', sub: '打刻修正・記録', path: '/admin/timeclock', color: 'bg-white' },
    { label: '💴 給与管理', sub: '月次・時給設定', path: '/admin/payroll', color: 'bg-white' },
    { label: '📋 シフト申請', sub: '承認・却下', path: '/admin/shifts', color: 'bg-white' },
    { label: '📅 シフト管理', sub: 'カレンダー', path: '/schedule', color: 'bg-white' },
  ]

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-stone-800">FELICITY</h1>
        <p className="text-stone-400 text-xs mt-1 tracking-widest">ADMIN</p>
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
