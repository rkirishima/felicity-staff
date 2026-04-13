'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, CalendarDays, Users, MapPin, X, AlertTriangle, Repeat } from 'lucide-react'

interface FloorInfo {
  floor: string
  total_seats: number
  description: string
  dog_friendly: boolean
}

interface SectionInfo {
  id: string
  floor: string
  name: string
  seats: number
  extra_seats: number
}

interface EventDate {
  date: string
  start_time: string
  end_time: string
}

interface PrepTask {
  task: string
  task_en?: string
}

interface Event {
  id: string
  title: string
  title_en: string
  description: string
  description_en: string
  event_type: string
  recurrence_rule: string | null
  floor_block: string | null
  seats_blocked: number
  max_attendees: number
  time_relation: string
  confirmed_date: string | null
  status: string
  prep_tasks: PrepTask[] | null
  event_dates: EventDate[]
}

const EVENT_TYPES = [
  { value: 'one_off', label: '単発' },
  { value: 'recurring', label: '定期' },
]

const TIME_RELATIONS = [
  { value: 'during', label: '営業時間中' },
  { value: 'before', label: '営業前' },
  { value: 'after', label: '営業後' },
  { value: 'closed', label: '貸切' },
]

const DAY_OPTIONS = [
  { value: 'MO', label: '月' },
  { value: 'TU', label: '火' },
  { value: 'WE', label: '水' },
  { value: 'TH', label: '木' },
  { value: 'FR', label: '金' },
  { value: 'SA', label: '土' },
  { value: 'SU', label: '日' },
]

export function EventManager() {
  const [events, setEvents] = useState<Event[]>([])
  const [floors, setFloors] = useState<FloorInfo[]>([])
  const [sections, setSections] = useState<SectionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [eventType, setEventType] = useState('one_off')
  const [floorBlock, setFloorBlock] = useState('')
  const [seatsBlocked, setSeatsBlocked] = useState(0)
  const [maxAttendees, setMaxAttendees] = useState(0)
  const [timeRelation, setTimeRelation] = useState('during')
  const [confirmedDate, setConfirmedDate] = useState('')
  const [eventDates, setEventDates] = useState<EventDate[]>([
    { date: '', start_time: '', end_time: '' },
  ])
  const [prepTasks, setPrepTasks] = useState<PrepTask[]>([])
  // Recurrence
  const [recurDay, setRecurDay] = useState('TU')
  const [recurStartTime, setRecurStartTime] = useState('10:00')
  const [recurEndTime, setRecurEndTime] = useState('11:00')

  useEffect(() => {
    fetchEvents()
    fetchFloorData()
  }, [])

  async function fetchEvents() {
    try {
      const res = await fetch('/api/events')
      if (res.ok) {
        const data = await res.json()
        setEvents(data)
      }
    } finally {
      setLoading(false)
    }
  }

  async function fetchFloorData() {
    const res = await fetch('/api/floor-sections')
    if (res.ok) {
      const data = await res.json()
      setFloors(data.floors)
      setSections(data.sections)
    }
  }

  function getSeatOptions(): number[] {
    if (!floorBlock) return []

    const floorSections = sections.filter(s => s.floor === floorBlock)
    const floor = floors.find(f => f.floor === floorBlock)

    const options = new Set<number>()

    for (const sec of floorSections) {
      options.add(sec.seats)
      if (sec.extra_seats > 0) {
        options.add(sec.seats + sec.extra_seats)
      }
    }

    if (floor) {
      options.add(floor.total_seats)
    }

    if (floorSections.length > 0) {
      const totalBase = floorSections.reduce((sum, s) => sum + s.seats, 0)
      const totalMax = floorSections.reduce((sum, s) => sum + s.seats + s.extra_seats, 0)
      options.add(totalBase)
      if (totalMax !== totalBase) options.add(totalMax)
    }

    return Array.from(options).sort((a, b) => a - b)
  }

  function getCapacityOptions(): number[] {
    const options: number[] = []
    for (let i = 1; i <= 30; i++) options.push(i)
    return options
  }

  function resetForm() {
    setTitle('')
    setTitleEn('')
    setDescription('')
    setDescriptionEn('')
    setEventType('one_off')
    setFloorBlock('')
    setSeatsBlocked(0)
    setMaxAttendees(0)
    setTimeRelation('during')
    setConfirmedDate('')
    setEventDates([{ date: '', start_time: '', end_time: '' }])
    setPrepTasks([])
    setRecurDay('TU')
    setRecurStartTime('10:00')
    setRecurEndTime('11:00')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const validDates = eventDates.filter(d => d.date)
      const recurrenceRule = eventType === 'recurring'
        ? `BYDAY=${recurDay};TIME=${recurStartTime}-${recurEndTime}`
        : null

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          title_en: titleEn,
          description,
          description_en: descriptionEn,
          event_type: eventType,
          recurrence_rule: recurrenceRule,
          floor_block: floorBlock || null,
          seats_blocked: seatsBlocked,
          max_attendees: maxAttendees,
          time_relation: timeRelation,
          confirmed_date: confirmedDate || null,
          dates: validDates,
          prep_tasks: prepTasks.length > 0 ? prepTasks : [],
        }),
      })

      if (res.ok) {
        resetForm()
        setShowForm(false)
        fetchEvents()
      } else {
        const err = await res.json()
        alert(err.error || '作成に失敗しました')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('このイベントを削除しますか？')) return

    const res = await fetch(`/api/events/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchEvents()
    }
  }

  function addDateRow() {
    setEventDates([...eventDates, { date: '', start_time: '', end_time: '' }])
  }

  function removeDateRow(idx: number) {
    setEventDates(eventDates.filter((_, i) => i !== idx))
  }

  function updateDateRow(idx: number, field: keyof EventDate, value: string) {
    const updated = [...eventDates]
    updated[idx] = { ...updated[idx], [field]: value }
    setEventDates(updated)
  }

  function addPrepTask() {
    setPrepTasks([...prepTasks, { task: '', task_en: '' }])
  }

  function removePrepTask(idx: number) {
    setPrepTasks(prepTasks.filter((_, i) => i !== idx))
  }

  function updatePrepTask(idx: number, field: keyof PrepTask, value: string) {
    const updated = [...prepTasks]
    updated[idx] = { ...updated[idx], [field]: value }
    setPrepTasks(updated)
  }

  function getSectionSummary(floor: string): string {
    const floorSections = sections.filter(s => s.floor === floor)
    if (floorSections.length === 0) {
      const f = floors.find(fl => fl.floor === floor)
      return f?.description || ''
    }
    return floorSections
      .map(s => `${s.name}${s.seats}${s.extra_seats > 0 ? `+${s.extra_seats}` : ''}名`)
      .join(' / ')
  }

  function parseRecurrence(rule: string | null): { day: string; time: string } | null {
    if (!rule) return null
    const dayMatch = rule.match(/BYDAY=(\w+)/)
    const timeMatch = rule.match(/TIME=(.+)/)
    if (!dayMatch) return null
    const dayLabel = DAY_OPTIONS.find(d => d.value === dayMatch[1])?.label || dayMatch[1]
    return {
      day: dayLabel,
      time: timeMatch ? timeMatch[1] : '',
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-purple-600" />
          イベント管理
        </h2>
        <Button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm() }}
          variant={showForm ? 'outline' : 'default'}
          size="sm"
        >
          {showForm ? <><X className="w-4 h-4 mr-1" /> 閉じる</> : <><Plus className="w-4 h-4 mr-1" /> 新規作成</>}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 mb-6 space-y-4">
          {/* Title */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="title">タイトル *</Label>
              <Input
                id="title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="イベント名"
                required
              />
            </div>
            <div>
              <Label htmlFor="titleEn">Title (EN)</Label>
              <Input
                id="titleEn"
                value={titleEn}
                onChange={e => setTitleEn(e.target.value)}
                placeholder="Event name"
              />
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="desc">説明</Label>
              <textarea
                id="desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="イベントの詳細"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="descEn">Description (EN)</Label>
              <textarea
                id="descEn"
                value={descriptionEn}
                onChange={e => setDescriptionEn(e.target.value)}
                placeholder="Event details"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
          </div>

          {/* Type & Time relation */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>種類</Label>
              <select
                value={eventType}
                onChange={e => setEventType(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
              >
                {EVENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>時間帯</Label>
              <select
                value={timeRelation}
                onChange={e => setTimeRelation(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
              >
                {TIME_RELATIONS.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {eventType === 'one_off' && (
              <div>
                <Label>確定日</Label>
                <Input
                  type="date"
                  value={confirmedDate}
                  onChange={e => setConfirmedDate(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label>定員</Label>
              <select
                value={maxAttendees}
                onChange={e => setMaxAttendees(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
              >
                <option value={0}>制限なし</option>
                {getCapacityOptions().map(n => (
                  <option key={n} value={n}>{n}名</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recurrence (for recurring events) */}
          {eventType === 'recurring' && (
            <div className="bg-blue-50 rounded-lg p-3 space-y-2">
              <Label className="flex items-center gap-1">
                <Repeat className="w-4 h-4" /> 定期スケジュール
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">曜日</Label>
                  <select
                    value={recurDay}
                    onChange={e => setRecurDay(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
                  >
                    {DAY_OPTIONS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}曜日</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">開始</Label>
                  <Input
                    type="time"
                    value={recurStartTime}
                    onChange={e => setRecurStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">終了</Label>
                  <Input
                    type="time"
                    value={recurEndTime}
                    onChange={e => setRecurEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Floor & Seats */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>フロア確保</Label>
              <select
                value={floorBlock}
                onChange={e => { setFloorBlock(e.target.value); setSeatsBlocked(0) }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
              >
                <option value="">なし</option>
                {floors.map(f => (
                  <option key={f.floor} value={f.floor}>
                    {f.floor}（{f.total_seats}席{f.dog_friendly ? '・犬OK' : ''}）
                  </option>
                ))}
              </select>
              {floorBlock && (
                <p className="text-xs text-gray-500 mt-1">
                  {getSectionSummary(floorBlock)}
                </p>
              )}
            </div>
            <div>
              <Label>確保席数</Label>
              <select
                value={seatsBlocked}
                onChange={e => setSeatsBlocked(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm h-9"
                disabled={!floorBlock}
              >
                <option value={0}>0席</option>
                {getSeatOptions().map(n => (
                  <option key={n} value={n}>{n}席</option>
                ))}
              </select>
            </div>
          </div>

          {/* Prep tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-orange-500" /> 前日準備タスク
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={addPrepTask}>
                <Plus className="w-4 h-4 mr-1" /> 追加
              </Button>
            </div>
            {prepTasks.length > 0 && (
              <div className="space-y-2">
                {prepTasks.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={t.task}
                      onChange={e => updatePrepTask(idx, 'task', e.target.value)}
                      placeholder="例: 1階の床をモップする"
                      className="flex-1"
                    />
                    <Input
                      value={t.task_en || ''}
                      onChange={e => updatePrepTask(idx, 'task_en', e.target.value)}
                      placeholder="EN (optional)"
                      className="w-40"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removePrepTask(idx)}>
                      <X className="w-4 h-4 text-gray-400" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {prepTasks.length === 0 && (
              <p className="text-xs text-gray-400">前日に表示するタスク（床モップなど）があれば追加</p>
            )}
          </div>

          {/* Event dates (for one-off events) */}
          {eventType === 'one_off' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>候補日程</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addDateRow}>
                  <Plus className="w-4 h-4 mr-1" /> 追加
                </Button>
              </div>
              <div className="space-y-2">
                {eventDates.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={d.date}
                      onChange={e => updateDateRow(idx, 'date', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="time"
                      value={d.start_time}
                      onChange={e => updateDateRow(idx, 'start_time', e.target.value)}
                      className="w-28"
                    />
                    <span className="text-gray-400">〜</span>
                    <Input
                      type="time"
                      value={d.end_time}
                      onChange={e => updateDateRow(idx, 'end_time', e.target.value)}
                      className="w-28"
                    />
                    {eventDates.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeDateRow(idx)}>
                        <X className="w-4 h-4 text-gray-400" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" disabled={saving || !title} className="w-full">
            {saving ? '作成中...' : 'イベントを作成'}
          </Button>
        </form>
      )}

      {/* Event list */}
      {events.length === 0 ? (
        <p className="text-center text-gray-400 py-4">イベントはありません</p>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const recur = parseRecurrence(event.recurrence_rule)
            const hasPrepTasks = event.prep_tasks && event.prep_tasks.length > 0
            return (
              <div key={event.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-lg">{event.title}</p>
                    {event.title_en && (
                      <p className="text-sm text-gray-400">{event.title_en}</p>
                    )}
                    {event.description && (
                      <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(event.id)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                    {EVENT_TYPES.find(t => t.value === event.event_type)?.label || event.event_type}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                    {TIME_RELATIONS.find(t => t.value === event.time_relation)?.label || event.time_relation}
                  </span>
                  {recur && (
                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                      <Repeat className="w-3 h-3" />
                      毎週{recur.day} {recur.time}
                    </span>
                  )}
                  {event.floor_block && (
                    <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1 rounded-full">
                      <MapPin className="w-3 h-3" />
                      {event.floor_block} — {event.seats_blocked}席確保
                    </span>
                  )}
                  {event.max_attendees > 0 && (
                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded-full">
                      <Users className="w-3 h-3" />
                      定員{event.max_attendees}名
                    </span>
                  )}
                  {event.confirmed_date && (
                    <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full">
                      確定: {event.confirmed_date}
                    </span>
                  )}
                </div>

                {/* Prep tasks */}
                {hasPrepTasks && (
                  <div className="mt-2 bg-red-50 rounded p-2">
                    <p className="text-xs font-medium text-red-700 flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-3 h-3" /> 前日準備
                    </p>
                    <ul className="space-y-0.5">
                      {event.prep_tasks!.map((t, i) => (
                        <li key={i} className="text-xs text-red-600">・{t.task}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Event dates */}
                {event.event_dates && event.event_dates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {event.event_dates.map((d: EventDate & { id?: string }, i: number) => (
                      <span key={d.id || i} className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {d.date}
                        {d.start_time && ` ${d.start_time}`}
                        {d.end_time && `〜${d.end_time}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
