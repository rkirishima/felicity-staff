'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Staff = { id: string; name: string; role: string }

export default function HomePage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selected, setSelected] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const { createBrowserClient } = require('@supabase/ssr')
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    sb.from('staff').select('id, name, role').eq('active', true)
      .not('role', 'eq', 'accountant').order('name')
      .then(({ data }: any) => setStaffList(data ?? []))
  }, [])

  async function getSb() {
    const { createBrowserClient } = require('@supabase/ssr')
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  function handleSelect(s: Staff) {
    if (s.role === 'admin') { router.push('/admin'); return }
    setSelected(s)
  }

  async function handleClockIn() {
    if (!selected) return
    setLoading(true)
    const sb = await getSb()
    const { error } = await sb.from('timeclock').insert({
      staff_id: selected.id, clock_in: new Date().toISOString(),
    })
    if (error) { toast.error('エラーが発生しました'); setLoading(false); return }
    toast.success(`${selected.name}さん、おはようございます！`)
    setLoading(false); setSelected(null)
  }

  async function handleClockOut() {
    if (!selected) return
    setLoading(true)
    const sb = await getSb()
    const { error } = await sb.from('timeclock')
      .update({ clock_out: new Date().toISOString() })
      .eq('staff_id', selected.id).is('clock_out', null)
    if (error) { toast.error('エラーが発生しました'); setLoading(false); return }
    toast.success(`${selected.name}さん、お疲れ様でした！`)
    setLoading(false); setSelected(null)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-8"
      style={{ backgroundColor: '#F5F0E8' }}>

      <div className="flex flex-col items-center gap-2">
        <Image
          src="https://felicity.cafe/felicity-logo.png"
          alt="Felicity"
          width={160}
          height={60}
          className="object-contain"
          unoptimized
        />
        <p className="text-xs tracking-[0.4em] text-stone-400 uppercase">Hayama</p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <p className="text-stone-500 text-xs text-center tracking-widest uppercase">Select Staff</p>
        <div className="grid grid-cols-3 gap-2">
          {staffList.map(s => (
            <button key={s.id} onClick={() => handleSelect(s)}
              className={`py-3 rounded-xl text-sm font-medium transition-all border ${
                selected?.id === s.id
                  ? 'bg-stone-800 text-white border-stone-800'
                  : s.role === 'admin'
                  ? 'bg-white text-teal-700 border-teal-200 hover:border-teal-400'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
              }`}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <p className="text-center text-stone-500 text-sm">
            <span className="text-stone-800 font-semibold">{selected.name}</span>さん
          </p>
          <button onClick={handleClockIn} disabled={loading}
            className="w-full py-5 text-lg font-medium rounded-2xl bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-50 transition-all tracking-wider">
            出勤
          </button>
          <button onClick={handleClockOut} disabled={loading}
            className="w-full py-5 text-lg font-medium rounded-2xl border-2 border-stone-300 text-stone-600 hover:border-stone-500 disabled:opacity-50 transition-all tracking-wider">
            退勤
          </button>
        </div>
      )}

      <p className="text-stone-400 text-xs tracking-wider">
        {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
      </p>
    </main>
  )
}
