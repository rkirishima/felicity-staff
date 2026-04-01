'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Staff = { id: string; name: string; role: string }

export default function HomePage() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selected, setSelected] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('staff').select('id, name, role').eq('active', true).order('name')
      .then(({ data }) => setStaffList(data ?? []))
  }, [])

  async function handleClockIn() {
    if (!selected) return
    setLoading(true)
    const { error } = await supabase.from('timeclock').insert({
      staff_id: selected.id,
      clock_in: new Date().toISOString(),
    })
    if (error) { toast.error('エラーが発生しました'); setLoading(false); return }
    toast.success(`${selected.name}さん、おはようございます！`)
    setLoading(false)
    setSelected(null)
  }

  async function handleClockOut() {
    if (!selected) return
    setLoading(true)
    const { error } = await supabase
      .from('timeclock')
      .update({ clock_out: new Date().toISOString() })
      .eq('staff_id', selected.id)
      .is('clock_out', null)
    if (error) { toast.error('エラーが発生しました'); setLoading(false); return }
    toast.success(`${selected.name}さん、お疲れ様でした！`)
    setLoading(false)
    setSelected(null)
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-[0.3em] text-teal-400">FELICITY</h1>
        <p className="text-zinc-500 text-sm mt-1 tracking-widest">HAYAMA</p>
      </div>
      <div className="w-full max-w-sm space-y-2">
        <p className="text-zinc-400 text-sm text-center">名前を選んでください</p>
        <div className="grid grid-cols-3 gap-2">
          {staffList.map(s => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`py-3 rounded-xl text-sm font-medium transition-all ${
                selected?.id === s.id
                  ? 'bg-teal-500 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <p className="text-center text-zinc-300">
            <span className="text-white font-bold">{selected.name}</span>さん
          </p>
          <Button onClick={handleClockIn} disabled={loading}
            className="w-full py-6 text-xl bg-teal-600 hover:bg-teal-500">
            出勤
          </Button>
          <Button onClick={handleClockOut} disabled={loading} variant="outline"
            className="w-full py-6 text-xl border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            退勤
          </Button>
        </div>
      )}
      <p className="text-zinc-700 text-xs">
        {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
      </p>
    </main>
  )
}
