'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface TimecardRecord {
  id: string
  staff_id: string
  clock_in: string | null
  clock_out: string | null
  break_minutes: number
  note: string | null
  staff: { name: string } | null
}

function toLocalTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const h = d.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
  return h // returns HH:MM
}

function toJSTIso(date: string, time: string): string {
  // date = YYYY-MM-DD, time = HH:MM → ISO string in JST
  return new Date(`${date}T${time}:00+09:00`).toISOString()
}

export function TimecardEditor() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const [date, setDate] = useState(today)
  const [records, setRecords] = useState<TimecardRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, { clock_in: string; clock_out: string; break_minutes: string; note: string }>>({})

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/timeclock/records?date=${date}`)
      const data = await res.json()
      setRecords(data || [])
      // Seed edits from fetched data
      const initial: typeof edits = {}
      for (const r of data || []) {
        initial[r.id] = {
          clock_in: toLocalTime(r.clock_in),
          clock_out: toLocalTime(r.clock_out),
          break_minutes: String(r.break_minutes ?? 0),
          note: r.note ?? '',
        }
      }
      setEdits(initial)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  function handleEdit(id: string, field: string, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function saveRecord(record: TimecardRecord) {
    const e = edits[record.id]
    if (!e) return
    setSaving(record.id)
    try {
      const body: Record<string, unknown> = { id: record.id }
      if (e.clock_in)  body.clock_in  = toJSTIso(date, e.clock_in)
      if (e.clock_out) body.clock_out = toJSTIso(date, e.clock_out)
      else             body.clock_out = null
      body.break_minutes = parseInt(e.break_minutes) || 0
      body.note = e.note || null

      const res = await fetch('/api/timeclock/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchRecords()
    } catch (err) {
      alert('保存失敗: ' + (err instanceof Error ? err.message : err))
    } finally {
      setSaving(null)
    }
  }

  async function deleteRecord(id: string, name: string) {
    if (!confirm(`${name}の記録を削除しますか？`)) return
    await fetch(`/api/timeclock/records?id=${id}`, { method: 'DELETE' })
    await fetchRecords()
  }

  const unclosed = records.filter(r => !r.clock_out)

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">タイムカード編集</h2>
          {unclosed.length > 0 && (
            <p className="text-sm text-red-600 mt-1">
              ⚠️ 退勤未記録: {unclosed.map(r => r.staff?.name).join('、')}
            </p>
          )}
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">読み込み中...</p>
      ) : records.length === 0 ? (
        <p className="text-gray-500 text-sm">この日の記録はありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-600">
                <th className="text-left py-2 pr-4 font-medium">スタッフ</th>
                <th className="text-left py-2 pr-4 font-medium">出勤</th>
                <th className="text-left py-2 pr-4 font-medium">退勤</th>
                <th className="text-left py-2 pr-4 font-medium">休憩(分)</th>
                <th className="text-left py-2 pr-4 font-medium">メモ</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {records.map(record => {
                const e = edits[record.id] || { clock_in: '', clock_out: '', break_minutes: '0', note: '' }
                const isSaving = saving === record.id
                const noClockOut = !record.clock_out

                return (
                  <tr key={record.id} className={`border-b ${noClockOut ? 'bg-red-50' : ''}`}>
                    <td className="py-3 pr-4 font-medium text-gray-800">
                      {record.staff?.name || record.staff_id}
                      {noClockOut && <span className="ml-2 text-xs text-red-500">未退勤</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="time"
                        value={e.clock_in}
                        onChange={ev => handleEdit(record.id, 'clock_in', ev.target.value)}
                        className="border rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="time"
                        value={e.clock_out}
                        onChange={ev => handleEdit(record.id, 'clock_out', ev.target.value)}
                        className={`border rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-purple-400 ${noClockOut ? 'border-red-300' : ''}`}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="number"
                        value={e.break_minutes}
                        onChange={ev => handleEdit(record.id, 'break_minutes', ev.target.value)}
                        className="border rounded px-2 py-1 text-sm w-16 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        min="0"
                        step="15"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="text"
                        value={e.note}
                        onChange={ev => handleEdit(record.id, 'note', ev.target.value)}
                        placeholder="任意"
                        className="border rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </td>
                    <td className="py-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveRecord(record)}
                        disabled={isSaving}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3"
                      >
                        {isSaving ? '保存中...' : '保存'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteRecord(record.id, record.staff?.name || '')}
                        className="text-red-500 border-red-300 hover:bg-red-50 text-xs px-3"
                      >
                        削除
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
