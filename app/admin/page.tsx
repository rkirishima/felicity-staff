'use client'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-teal-400">FELICITY</h1>
        <p className="text-zinc-500 text-xs mt-1 tracking-widest">ADMIN</p>
      </div>
      <div className="w-full max-w-sm grid grid-cols-2 gap-3">
        <button onClick={() => router.push('/admin/timeclock')}
          className="bg-zinc-800 hover:bg-zinc-700 rounded-2xl p-6 text-center transition-all">
          <div className="text-2xl mb-2">⏱</div>
          <div className="text-sm font-medium">出勤記録</div>
        </button>
        <button onClick={() => router.push('/schedule')}
          className="bg-zinc-800 hover:bg-zinc-700 rounded-2xl p-6 text-center transition-all">
          <div className="text-2xl mb-2">📅</div>
          <div className="text-sm font-medium">シフト管理</div>
        </button>
        <button onClick={() => router.push('/hygiene')}
          className="bg-zinc-800 hover:bg-zinc-700 rounded-2xl p-6 text-center transition-all">
          <div className="text-2xl mb-2">✅</div>
          <div className="text-sm font-medium">衛生チェック</div>
        </button>
        <button onClick={() => router.push('/admin/payroll')}
          className="bg-zinc-800 hover:bg-zinc-700 rounded-2xl p-6 text-center transition-all">
          <div className="text-2xl mb-2">💴</div>
          <div className="text-sm font-medium">給与計算</div>
        </button>
      </div>
      <button onClick={() => router.push('/')} className="text-zinc-600 text-xs hover:text-zinc-400">← ホームに戻る</button>
    </main>
  )
}
