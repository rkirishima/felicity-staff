'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
          <div key={i} className={`w-4 h-4 rounded-full transition-all ${
            pin.length > i ? (error ? 'bg-red-400' : 'bg-stone-800') : 'bg-stone-300'
          }`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n, i) => (
          <button key={i} onClick={() => {
            if (n === '⌫') setPin(p => p.slice(0,-1))
            else if (n !== '') handlePin(n)
          }}
            className={`py-4 rounded-2xl text-xl font-medium transition-all ${
              n === '' ? '' : 'bg-white text-stone-700 hover:bg-stone-100 shadow-sm active:scale-95'
            }`}>
            {n}
          </button>
        ))}
      </div>
    </main>
  )

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-stone-800">FELICITY</h1>
        <p className="text-stone-400 text-xs mt-1 tracking-widest">ADMIN</p>
      </div>
      <div className="w-full max-w-sm grid grid-cols-2 gap-3">
        <button onClick={() => router.push('/admin/timeclock')}
          className="bg-white hover:bg-stone-50 rounded-2xl p-6 text-center transition-all shadow-sm">
          <div className="text-2xl mb-2">⏱</div>
          <div className="text-sm font-medium text-stone-700">出勤記録</div>
        </button>
        <button onClick={() => router.push('/schedule')}
          className="bg-white hover:bg-stone-50 rounded-2xl p-6 text-center transition-all shadow-sm">
          <div className="text-2xl mb-2">📅</div>
          <div className="text-sm font-medium text-stone-700">シフト管理</div>
        </button>

        <button onClick={() => router.push('/admin/shifts')}
          className="bg-white hover:bg-stone-50 rounded-2xl p-6 text-center transition-all shadow-sm">
          <div className="text-2xl mb-2">📝</div>
          <div className="text-sm font-medium text-stone-700">シフト一括入力</div>
        </button>
        <button onClick={() => router.push('/admin/payroll')}
          className="bg-white hover:bg-stone-50 rounded-2xl p-6 text-center transition-all shadow-sm">
          <div className="text-2xl mb-2">💴</div>
          <div className="text-sm font-medium text-stone-700">給与管理</div>
        </button>
        <button onClick={() => router.push('/admin/live')}
          className="bg-teal-50 hover:bg-teal-100 rounded-2xl p-6 text-center transition-all shadow-sm border border-teal-200 col-span-2">
          <div className="text-2xl mb-2">👥</div>
          <div className="text-sm font-medium text-teal-700">在籍状況（リアルタイム）</div>
        </button>
      </div>
      <button onClick={() => router.push('/')} className="text-stone-400 text-xs hover:text-stone-600">← ホームに戻る</button>
    </main>
  )
}
