'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

type Staff = { id: string; name: string; skill: string }
type Template = { id: string; name: string; day_type: string; start_time: string; end_time: string }

function getSb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function isWeekend(d: Date) { return d.getDay() === 0 || d.getDay() === 6 }
function isFoodTruck(d: Date) { return d.getDay() === 3 || d.getDay() === 4 }

export default function AdminShiftsPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [rows, setRows] = useState([{ staffId: '', date: '', templateId: '' }])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const sb = getSb()
    sb.from('staff').select('id, name, skill').eq('active', true).not('role', 'eq', 'accountant').order('name')
      .then(({ data }) => setStaff(data ?? []))
    sb.from('shift_templates').select('*').order('day_type')
      .then(({ data }) => setTemplates(data ?? []))
  }, [])

  function addRow() {
    setRows(prev => [...prev, { staffId: '', date: '', templateId: '' }])
  }

  function updateRow(i: number, field: string, val: string) {
    setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: val } : r))
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, j) => j !== i))
  }

  function getTemplatesForDate(date: string) {
    if (!date) return templates
    const d = new Date(date + 'T12:00:00')
    const dayType = isWeekend(d) ? 'weekend' : 'weekday'
    return templates.filter(t => t.day_type === dayType)
  }

  async function submit() {
    const valid = rows.filter(r => r.staffId && r.date && r.templateId)
    if (valid.length === 0) { toast.error('入力してください'); return }
    setLoading(true)
    const sb = getSb()
    let success = 0
    for (const row of valid) {
      const tmpl = templates.find(t => t.id === row.templateId)
      if (!tmpl) continue
      const { error } = await sb.from('shifts').insert({
        staff_id: row.staffId,
        date: row.date,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        status: 'approved',
      })
      if (!error) success++
    }
    toast.success(`${success}件登録しました！`)
    setRows([{ staffId: '', date: '', templateId: '' }])
    setLoading(false)
  }

  return (
    <main className="min-h-screen p-4 max-w-2xl mx-auto" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin')} className="text-stone-400 hover:text-stone-600">←</button>
        <h1 className="text-xl font-bold text-stone-800 tracking-wider">シフト一括入力</h1>
      </div>

      <div className="space-y-3 mb-4">
        {rows.map((row, i) => {
          const filteredTmpl = getTemplatesForDate(row.date)
          const d = row.date ? new Date(row.date + 'T12:00:00') : null
          const isFT = d ? isFoodTruck(d) : false
          const isWE = d ? isWeekend(d) : false

          return (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400 font-medium">#{i + 1}</span>
                {rows.length > 1 && (
                  <button onClick={() => removeRow(i)} className="text-xs text-red-400 hover:text-red-600">削除</button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">スタッフ</label>
                  <select value={row.staffId} onChange={e => updateRow(i, 'staffId', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-700">
                    <option value="">選択</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-500 mb-1 block">
                    日付
                    {isFT && <span className="ml-1 text-amber-500">🚐</span>}
                    {isWE && <span className="ml-1 text-teal-500">土日</span>}
                  </label>
                  <input type="date" value={row.date} onChange={e => updateRow(i, 'date', e.target.value)}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-stone-700" />
                </div>
              </div>

              <div>
                <label className="text-xs text-stone-500 mb-1 block">シフト</label>
                <div className="grid grid-cols-2 gap-2">
                  {filteredTmpl.map(t => (
                    <button key={t.id} onClick={() => updateRow(i, 'templateId', t.id)}
                      className={`py-2 px-3 rounded-xl text-xs transition-all border ${
                        row.templateId === t.id
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                      }`}>
                      <div className="font-medium">{t.name}</div>
                      <div className="opacity-70">{t.start_time.slice(0,5)}〜{t.end_time.slice(0,5)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={addRow}
        className="w-full py-3 border-2 border-dashed border-stone-300 rounded-2xl text-stone-400 hover:border-stone-500 hover:text-stone-600 transition-all text-sm mb-4">
        + 行を追加
      </button>

      <button onClick={submit} disabled={loading}
        className="w-full py-4 bg-stone-800 text-white rounded-2xl font-medium tracking-wider disabled:opacity-50 transition-all">
        {loading ? '登録中...' : `${rows.filter(r => r.staffId && r.date && r.templateId).length}件を登録する`}
      </button>
    </main>
  )
}
