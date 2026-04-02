'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export default function AdminTimeclockPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [records, setRecords] = useState<any[]>([])
  const [tab, setTab] = useState<'requests' | 'records'>('requests')
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))
  const [editId, setEditId] = useState<string | null>(null)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { loadRequests(); }, [])
  useEffect(() => { if (tab === 'records') loadRecords() }, [tab, month])

  async function loadRequests() {
    const { data } = await supabase.from('timeclock_requests')
      .select('*, staff(name)').eq('status', 'pending').order('created_at')
    setRequests(data ?? [])
  }

  async function loadRecords() {
    const { data } = await supabase.from('timeclock')
      .select('*, staff(name)')
      .gte('clock_in', `${month}-01`).lte('clock_in', `${month}-31`)
      .order('clock_in', { ascending: false })
    setRecords(data ?? [])
  }

  async function approveRequest(r: any) {
    // timeclockに記録を追加
    await supabase.from('timeclock').insert({
      staff_id: r.staff_id,
      clock_in: `${r.date}T${r.clock_in}:00+09:00`,
      clock_out: r.clock_out ? `${r.date}T${r.clock_out}:00+09:00` : null,
    })
    await supabase.from('timeclock_requests').update({ status: 'approved' }).eq('id', r.id)
    toast.success('承認しました')
    loadRequests()
  }

  async function rejectRequest(id: string) {
    await supabase.from('timeclock_requests').update({ status: 'rejected' }).eq('id', id)
    toast.success('却下しました')
    loadRequests()
  }

  async function saveEdit(id: string, staffId: string) {
    const date = records.find(r => r.id === id)?.clock_in?.slice(0,10)
    await supabase.from('timeclock').update({
      clock_in: `${date}T${editIn}:00+09:00`,
      clock_out: editOut ? `${date}T${editOut}:00+09:00` : null,
    }).eq('id', id)
    toast.success('修正しました')
    setEditId(null); loadRecords()
  }

  async function exportCSV() {
    const { data } = await supabase.from('timeclock')
      .select('*, staff(name, hourly_rate)')
      .gte('clock_in', `${month}-01`).lte('clock_in', `${month}-31`)
      .order('clock_in')
    const rows = (data ?? []).map((r: any) => {
      const hours = r.clock_out
        ? ((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000).toFixed(2)
        : ''
      return `${(r.staff as any)?.name},${r.clock_in?.slice(0,10)},${r.clock_in?.slice(11,16)},${r.clock_out?.slice(11,16) || ''},${hours}`
    })
    const csv = '\uFEFF' + 'スタッフ,日付,出勤,退勤,労働時間\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `timeclock_${month}.csv`; a.click()
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">タイムカード管理</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('requests')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'requests' ? 'bg-stone-800 text-white' : 'bg-white text-stone-600'}`}>
          修正リクエスト {requests.length > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 rounded-full">{requests.length}</span>}
        </button>
        <button onClick={() => setTab('records')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'records' ? 'bg-stone-800 text-white' : 'bg-white text-stone-600'}`}>
          打刻記録
        </button>
      </div>

      {tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="text-center py-12 text-stone-400 text-sm">修正リクエストはありません</div>
          ) : requests.map(r => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-stone-800">{(r.staff as any)?.name}</p>
                  <p className="text-xs text-stone-400">{r.date} {r.clock_in}〜{r.clock_out || '?'}</p>
                  {r.reason && <p className="text-xs text-amber-600 mt-1">「{r.reason}」</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => approveRequest(r)}
                  className="flex-1 py-2 bg-teal-600 text-white rounded-xl text-sm font-medium">承認</button>
                <button onClick={() => rejectRequest(r.id)}
                  className="flex-1 py-2 bg-red-100 text-red-600 rounded-xl text-sm font-medium">却下</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'records' && (
        <>
          <div className="flex gap-2 mb-3">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white" />
            <button onClick={exportCSV}
              className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm text-stone-600 font-medium">
              CSV
            </button>
          </div>
          <div className="space-y-2">
            {records.map(r => (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
                {editId === r.id ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-stone-700">{(r.staff as any)?.name} — {r.clock_in?.slice(0,10)}</p>
                    <div className="flex gap-2">
                      <input type="time" value={editIn} onChange={e => setEditIn(e.target.value)}
                        className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm" />
                      <span className="self-center text-stone-400">〜</span>
                      <input type="time" value={editOut} onChange={e => setEditOut(e.target.value)}
                        className="flex-1 border border-stone-200 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(r.id, r.staff_id)}
                        className="flex-1 py-2 bg-stone-800 text-white rounded-xl text-sm">保存</button>
                      <button onClick={() => setEditId(null)}
                        className="flex-1 py-2 bg-stone-100 text-stone-600 rounded-xl text-sm">キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-stone-700">{(r.staff as any)?.name}</p>
                      <p className="text-xs text-stone-400">
                        {r.clock_in?.slice(0,10)} {r.clock_in?.slice(11,16)}〜{r.clock_out?.slice(11,16) || '未退勤'}
                        {r.clock_out && (
                          <span className="ml-2 text-teal-600">
                            {((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000).toFixed(1)}h
                          </span>
                        )}
                      </p>
                    </div>
                    <button onClick={() => {
                      setEditId(r.id)
                      setEditIn(r.clock_in?.slice(11,16) || '')
                      setEditOut(r.clock_out?.slice(11,16) || '')
                    }} className="text-xs text-stone-400 hover:text-stone-600 px-2 py-1 rounded-lg hover:bg-stone-100">
                      編集
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
