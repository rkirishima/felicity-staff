'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function AdminShiftsPage() {
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { loadPending() }, [])

  async function loadPending() {
    const { data } = await supabase.from('shifts')
      .select('*, staff(name)')
      .eq('status', 'pending')
      .order('date')
    setPending(data ?? [])
  }

  async function approve(id: string) {
    await supabase.from('shifts').update({ status: 'approved' }).eq('id', id)
    toast.success('承認しました')
    loadPending()
  }

  async function reject(id: string) {
    await supabase.from('shifts').update({ status: 'rejected' }).eq('id', id)
    toast.success('却下しました')
    loadPending()
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400 text-lg">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">シフト申請</h1>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-stone-400 shadow-sm">
          <p className="text-2xl mb-2">📅</p>
          <p className="text-sm">承認待ちのシフトはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="mb-3">
                <p className="font-medium text-stone-800">{(s.staff as any)?.name}</p>
                <p className="text-sm text-stone-500 mt-0.5">
                  {new Date(s.date + 'T12:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                </p>
                <p className="text-sm text-stone-500">
                  {s.start_time?.slice(0,5)}〜{s.end_time?.slice(0,5)}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => approve(s.id)}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium">✓ 承認</button>
                <button onClick={() => reject(s.id)}
                  className="flex-1 py-2.5 bg-red-50 text-red-500 rounded-xl text-sm font-medium">✕ 却下</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
