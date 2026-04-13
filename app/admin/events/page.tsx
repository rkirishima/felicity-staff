'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getAdminSession } from '@/lib/session'
import { ChevronDown, ChevronUp, Plus, Trash2, Calendar, X } from 'lucide-react'

const DAYS_JA = ['日','月','火','水','木','金','土']

function formatDateJa(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth()+1}/${d.getDate()}(${DAYS_JA[d.getDay()]})`
}

const STATUS_COLORS: Record<string, string> = {
  open: '#14b8a6',
  confirmed: '#22c55e',
  closed: '#78716c',
  cancelled: '#ef4444',
}

interface EventDate {
  id: string; date: string; start_time: string | null; end_time: string | null;
  yes_count: number; maybe_count: number;
}

interface Vote {
  id: string; event_date_id: string; voter_name: string; voter_email: string; response: string;
}

interface Event {
  id: string; title: string; title_en: string; description: string | null;
  description_en: string | null; photo: string | null; min_votes: number;
  status: string; confirmed_date: string | null; created_at: string;
  event_type: string; recurrence_rule: string | null;
  floor_block: string | null; seats_blocked: number; time_relation: string;
  event_dates: EventDate[]; event_votes: Vote[];
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  const [form, setForm] = useState({
    title: '', title_en: '', description: '', description_en: '',
    min_votes: 3, event_type: 'one_off', time_relation: 'during',
    floor_block: '', seats_blocked: 0,
    recurrence_rule: '',
  })
  const [newDates, setNewDates] = useState<{ date: string; start_time: string; end_time: string }[]>([
    { date: '', start_time: '', end_time: '' },
  ])

  useEffect(() => {
    if (!getAdminSession()) { router.replace('/admin'); return }
    loadEvents()
  }, [])

  async function loadEvents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*, event_dates(*), event_votes(*)')
      .order('created_at', { ascending: false })
    if (error) { console.error(error); toast.error('イベント読み込み失敗'); return }
    setEvents(data ?? [])
    setLoading(false)
  }

  async function createEvent() {
    if (!form.title || !form.title_en) { toast.error('タイトル（日英）必須'); return }

    const dates = newDates.filter(d => d.date).map(d => ({
      date: d.date, start_time: d.start_time || null, end_time: d.end_time || null,
    }))

    if (form.event_type === 'one_off' && dates.length === 0) {
      toast.error('候補日を1つ以上追加してください'); return
    }

    // Create event
    const { data: event, error } = await supabase.from('events').insert({
      title: form.title, title_en: form.title_en,
      description: form.description || null, description_en: form.description_en || null,
      min_votes: form.min_votes, event_type: form.event_type,
      time_relation: form.time_relation,
      floor_block: form.floor_block || null,
      seats_blocked: form.seats_blocked,
      recurrence_rule: form.recurrence_rule || null,
    }).select().single()

    if (error || !event) { toast.error('イベント作成失敗: ' + error?.message); return }

    // Add candidate dates
    if (dates.length > 0) {
      await supabase.from('event_dates').insert(
        dates.map(d => ({ event_id: event.id, ...d }))
      )
    }

    // For recurring events, generate instances
    if (form.event_type === 'recurring' && form.recurrence_rule) {
      await generateInstances(event.id, form.recurrence_rule, dates[0]?.start_time, dates[0]?.end_time)
    }

    toast.success('イベントを作成しました')
    setShowForm(false)
    setForm({ title: '', title_en: '', description: '', description_en: '', min_votes: 3, event_type: 'one_off', time_relation: 'during', floor_block: '', seats_blocked: 0, recurrence_rule: '' })
    setNewDates([{ date: '', start_time: '', end_time: '' }])
    loadEvents()
  }

  async function generateInstances(eventId: string, rule: string, startTime: string | null, endTime: string | null) {
    // Parse rule like 'WEEKLY:TUE' or 'WEEKLY:MON'
    const match = rule.match(/WEEKLY:(\w+)/)
    if (!match) return

    const dayMap: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }
    const targetDay = dayMap[match[1].toUpperCase()]
    if (targetDay === undefined) return

    const instances: any[] = []
    const today = new Date()

    for (let week = 0; week < 12; week++) {
      const d = new Date(today)
      d.setDate(d.getDate() + (targetDay - d.getDay() + 7) % 7 + week * 7)
      if (d < today) d.setDate(d.getDate() + 7)

      instances.push({
        event_id: eventId,
        date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
        start_time: startTime,
        end_time: endTime,
      })
    }

    if (instances.length > 0) {
      await supabase.from('event_instances').insert(instances)
    }
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('events').update({ status }).eq('id', id)
    toast.success('ステータスを更新しました')
    loadEvents()
  }

  async function deleteEvent(id: string) {
    if (!confirm('このイベントと全ての投票データを削除しますか？')) return
    await supabase.from('events').delete().eq('id', id)
    toast.success('削除しました')
    loadEvents()
  }

  async function addDate(eventId: string, date: string, startTime: string, endTime: string) {
    if (!date) return
    await supabase.from('event_dates').insert({
      event_id: eventId, date, start_time: startTime || null, end_time: endTime || null,
    })
    toast.success('候補日を追加しました')
    loadEvents()
  }

  async function removeDate(dateId: string) {
    await supabase.from('event_dates').delete().eq('id', dateId)
    toast.success('候補日を削除しました')
    loadEvents()
  }

  return (
    <main className="min-h-screen p-4 pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-medium" style={{ color: '#292524' }}>イベント管理</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium"
            style={{ backgroundColor: '#14b8a6', color: 'white' }}>
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? '閉じる' : '新規イベント'}
          </button>
        </div>

        {/* New event form */}
        {showForm && (
          <div className="rounded-2xl p-4 mb-6 border" style={{ backgroundColor: '#fff', borderColor: '#E8E0D4' }}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  placeholder="タイトル（日本語）" className="px-3 py-2.5 rounded-xl text-sm border"
                  style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4', color: '#292524' }} />
                <input value={form.title_en} onChange={e => setForm({...form, title_en: e.target.value})}
                  placeholder="Title (EN)" className="px-3 py-2.5 rounded-xl text-sm border"
                  style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4', color: '#292524' }} />
              </div>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="説明（日本語）" rows={2} className="w-full px-3 py-2.5 rounded-xl text-sm border resize-none"
                style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4', color: '#292524' }} />
              <textarea value={form.description_en} onChange={e => setForm({...form, description_en: e.target.value})}
                placeholder="Description (EN)" rows={2} className="w-full px-3 py-2.5 rounded-xl text-sm border resize-none"
                style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4', color: '#292524' }} />

              {/* Event type */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#78716c' }}>イベントタイプ</label>
                <div className="flex gap-2">
                  {[{ v: 'one_off', l: '単発（投票制）' }, { v: 'recurring', l: '定期開催' }].map(t => (
                    <button key={t.v} onClick={() => setForm({...form, event_type: t.v})}
                      className="flex-1 py-2 rounded-xl text-xs font-medium border"
                      style={{
                        backgroundColor: form.event_type === t.v ? '#292524' : '#fff',
                        color: form.event_type === t.v ? 'white' : '#57534e',
                        borderColor: form.event_type === t.v ? '#292524' : '#E8E0D4',
                      }}>{t.l}</button>
                  ))}
                </div>
              </div>

              {/* Recurring rule */}
              {form.event_type === 'recurring' && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#78716c' }}>繰り返し曜日</label>
                  <div className="flex gap-1">
                    {['MON','TUE','WED','THU','FRI','SAT','SUN'].map((day, i) => (
                      <button key={day} onClick={() => setForm({...form, recurrence_rule: `WEEKLY:${day}`})}
                        className="flex-1 py-2 rounded-lg text-xs font-medium border"
                        style={{
                          backgroundColor: form.recurrence_rule === `WEEKLY:${day}` ? '#14b8a6' : '#fff',
                          color: form.recurrence_rule === `WEEKLY:${day}` ? 'white' : '#57534e',
                          borderColor: '#E8E0D4',
                        }}>{DAYS_JA[(i+1) % 7]}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Time relation */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#78716c' }}>営業時間との関係</label>
                <div className="flex gap-2">
                  {[{ v: 'before', l: '営業前' }, { v: 'during', l: '営業中' }, { v: 'after', l: '営業後' }].map(t => (
                    <button key={t.v} onClick={() => setForm({...form, time_relation: t.v})}
                      className="flex-1 py-2 rounded-xl text-xs font-medium border"
                      style={{
                        backgroundColor: form.time_relation === t.v ? '#292524' : '#fff',
                        color: form.time_relation === t.v ? 'white' : '#57534e',
                        borderColor: '#E8E0D4',
                      }}>{t.l}</button>
                  ))}
                </div>
              </div>

              {/* Floor blocking */}
              {form.time_relation === 'during' && (
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#78716c' }}>フロアブロック</label>
                  <div className="flex gap-2">
                    {[{ v: '', l: 'なし' }, { v: '1F', l: '1F' }, { v: '2F', l: '2F' }, { v: 'both', l: '両方' }].map(f => (
                      <button key={f.v} onClick={() => setForm({...form, floor_block: f.v})}
                        className="flex-1 py-2 rounded-xl text-xs font-medium border"
                        style={{
                          backgroundColor: form.floor_block === f.v ? '#7C3AED' : '#fff',
                          color: form.floor_block === f.v ? 'white' : '#57534e',
                          borderColor: '#E8E0D4',
                        }}>{f.l}</button>
                    ))}
                  </div>
                  {form.floor_block && (
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-xs" style={{ color: '#78716c' }}>確保席数:</label>
                      <input type="number" value={form.seats_blocked}
                        onChange={e => setForm({...form, seats_blocked: parseInt(e.target.value) || 0})}
                        className="w-16 px-2 py-1.5 rounded-lg text-sm text-center border"
                        style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
                      <span className="text-xs" style={{ color: '#A8A29E' }}>0 = フロア全体</span>
                    </div>
                  )}
                </div>
              )}

              {/* Min votes */}
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: '#78716c' }}>最低投票数:</label>
                <input type="number" value={form.min_votes}
                  onChange={e => setForm({...form, min_votes: parseInt(e.target.value) || 3})}
                  min={1} className="w-14 px-2 py-1.5 rounded-lg text-sm text-center border"
                  style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
              </div>

              {/* Candidate dates */}
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#78716c' }}>候補日</label>
                {newDates.map((d, i) => (
                  <div key={i} className="flex gap-1 mb-1.5">
                    <input type="date" value={d.date}
                      onChange={e => { const u = [...newDates]; u[i].date = e.target.value; setNewDates(u) }}
                      className="flex-1 px-2 py-2 rounded-lg text-xs border"
                      style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
                    <input type="time" value={d.start_time}
                      onChange={e => { const u = [...newDates]; u[i].start_time = e.target.value; setNewDates(u) }}
                      className="w-24 px-2 py-2 rounded-lg text-xs border"
                      style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
                    <input type="time" value={d.end_time}
                      onChange={e => { const u = [...newDates]; u[i].end_time = e.target.value; setNewDates(u) }}
                      className="w-24 px-2 py-2 rounded-lg text-xs border"
                      style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
                    {newDates.length > 1 && (
                      <button onClick={() => setNewDates(newDates.filter((_, j) => j !== i))}
                        className="px-2"><Trash2 size={14} color="#A8A29E" /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => setNewDates([...newDates, { date: '', start_time: '', end_time: '' }])}
                  className="text-xs font-medium mt-1" style={{ color: '#14b8a6' }}>+ 候補日を追加</button>
              </div>

              <button onClick={createEvent}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#14b8a6', color: 'white' }}>
                イベントを作成
              </button>
            </div>
          </div>
        )}

        {/* Event list */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12" style={{ color: '#A8A29E' }}>読み込み中...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#A8A29E' }}>イベントはありません</div>
          ) : events.map(event => {
            const isExpanded = expandedId === event.id
            const sortedDates = [...(event.event_dates || [])].sort((a, b) => a.date.localeCompare(b.date))
            const votesByDate: Record<string, Vote[]> = {}
            ;(event.event_votes || []).forEach(v => {
              if (!votesByDate[v.event_date_id]) votesByDate[v.event_date_id] = []
              votesByDate[v.event_date_id].push(v)
            })

            return (
              <div key={event.id} className="rounded-2xl overflow-hidden border"
                style={{ backgroundColor: '#fff', borderColor: '#E8E0D4' }}>
                {/* Summary */}
                <div className="flex items-center gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[event.status] || '#78716c' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: '#292524' }}>{event.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: '#A8A29E' }}>
                      {event.event_type === 'recurring' ? `定期: ${event.recurrence_rule}` : `${sortedDates.length}候補日`}
                      {' · '}{(event.event_votes || []).length}票
                      {event.time_relation !== 'during' && ` · ${event.time_relation === 'before' ? '営業前' : '営業後'}`}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: STATUS_COLORS[event.status] + '20', color: STATUS_COLORS[event.status] }}>
                    {event.status}
                  </span>
                  {isExpanded ? <ChevronUp size={16} color="#A8A29E" /> : <ChevronDown size={16} color="#A8A29E" />}
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: '#E8E0D4' }}>
                    {/* Vote table */}
                    {sortedDates.length > 0 && (
                      <div className="overflow-x-auto mb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ borderBottom: '1px solid #E8E0D4' }}>
                              <th className="text-left py-1.5 pr-2" style={{ color: '#78716c' }}>投票者</th>
                              {sortedDates.map(d => (
                                <th key={d.id} className="text-center py-1.5 px-1" style={{ color: '#78716c' }}>
                                  {formatDateJa(d.date)}
                                  <br /><span style={{ color: '#14b8a6' }}>○{d.yes_count}</span>
                                  {' '}<span style={{ color: '#f59e0b' }}>△{d.maybe_count}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from(new Set((event.event_votes || []).map(v => v.voter_email))).map(email => {
                              const votes = (event.event_votes || []).filter(v => v.voter_email === email)
                              return (
                                <tr key={email} style={{ borderBottom: '1px solid #F5F0E8' }}>
                                  <td className="py-1 pr-2" style={{ color: '#292524' }}>{votes[0]?.voter_name}</td>
                                  {sortedDates.map(d => {
                                    const vote = votes.find(v => v.event_date_id === d.id)
                                    const sym = vote?.response === 'yes' ? '○' : vote?.response === 'maybe' ? '△' : '×'
                                    const col = vote?.response === 'yes' ? '#14b8a6' : vote?.response === 'maybe' ? '#f59e0b' : '#E8E0D4'
                                    return <td key={d.id} className="text-center py-1 font-mono" style={{ color: col }}>{sym}</td>
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Floor block info */}
                    {event.floor_block && (
                      <div className="text-xs mb-3 px-2 py-1.5 rounded-lg" style={{ backgroundColor: '#EBE5F5', color: '#5B21B6' }}>
                        フロアブロック: {event.floor_block} — {event.seats_blocked === 0 ? '全席' : `${event.seats_blocked}席`}確保
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {event.status === 'open' && (
                        <>
                          <button onClick={() => updateStatus(event.id, 'closed')}
                            className="px-3 py-1.5 rounded-lg text-xs border"
                            style={{ borderColor: '#E8E0D4', color: '#78716c' }}>投票終了</button>
                          <button onClick={() => updateStatus(event.id, 'cancelled')}
                            className="px-3 py-1.5 rounded-lg text-xs border"
                            style={{ borderColor: '#fecaca', color: '#ef4444' }}>キャンセル</button>
                        </>
                      )}
                      {(event.status === 'closed' || event.status === 'cancelled') && (
                        <button onClick={() => updateStatus(event.id, 'open')}
                          className="px-3 py-1.5 rounded-lg text-xs border"
                          style={{ borderColor: '#14b8a6', color: '#14b8a6' }}>再開</button>
                      )}
                      <button onClick={() => deleteEvent(event.id)}
                        className="px-3 py-1.5 rounded-lg text-xs border"
                        style={{ borderColor: '#fecaca', color: '#ef4444' }}>
                        <Trash2 size={12} className="inline mr-1" />削除
                      </button>
                    </div>

                    {/* Dates management */}
                    <div className="text-xs space-y-1">
                      {sortedDates.map(d => (
                        <div key={d.id} className="flex items-center justify-between py-1">
                          <span style={{ color: '#292524' }}>
                            {formatDateJa(d.date)} {d.start_time?.slice(0,5)}{d.end_time ? `–${d.end_time.slice(0,5)}` : ''}
                          </span>
                          <button onClick={() => removeDate(d.id)} className="text-xs" style={{ color: '#A8A29E' }}>削除</button>
                        </div>
                      ))}
                    </div>

                    {/* Add date inline */}
                    <AddDateInline eventId={event.id} onAdd={addDate} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function AddDateInline({ eventId, onAdd }: { eventId: string; onAdd: (id: string, date: string, start: string, end: string) => void }) {
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  return (
    <div className="flex gap-1 mt-2 items-center">
      <input type="date" value={date} onChange={e => setDate(e.target.value)}
        className="flex-1 px-2 py-1.5 rounded-lg text-xs border"
        style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
      <input type="time" value={start} onChange={e => setStart(e.target.value)}
        className="w-20 px-2 py-1.5 rounded-lg text-xs border"
        style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
      <input type="time" value={end} onChange={e => setEnd(e.target.value)}
        className="w-20 px-2 py-1.5 rounded-lg text-xs border"
        style={{ backgroundColor: '#F5F0E8', borderColor: '#E8E0D4' }} />
      <button onClick={() => { onAdd(eventId, date, start, end); setDate(''); setStart(''); setEnd('') }}
        className="px-2 py-1.5 rounded-lg text-xs font-medium"
        style={{ backgroundColor: '#14b8a6', color: 'white' }}>追加</button>
    </div>
  )
}
