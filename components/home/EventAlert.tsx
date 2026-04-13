'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { PartyPopper, MapPin, Clock } from 'lucide-react'

interface EventInfo {
  id: string
  title: string
  title_en?: string
  description?: string
  event_type?: string
  floor_block?: string
  seats_blocked?: number
  time_relation?: string
}

interface EventDate {
  start_time?: string
  end_time?: string
  events: EventInfo
}

interface EventInstance {
  start_time?: string
  end_time?: string
  notes?: string
  events: EventInfo
}

interface TodayEvents {
  confirmedEvents: EventInfo[]
  eventDates: EventDate[]
  eventInstances: EventInstance[]
}

export function EventAlert() {
  const [events, setEvents] = useState<TodayEvents | null>(null)

  useEffect(() => {
    fetch('/api/events/today')
      .then(r => r.json())
      .then(setEvents)
      .catch(() => {})
  }, [])

  if (!events) return null

  const hasEvents =
    events.confirmedEvents.length > 0 ||
    events.eventDates.length > 0 ||
    events.eventInstances.length > 0

  if (!hasEvents) return null

  // Collect all events into a flat list
  const items: { title: string; description?: string; floor?: string; startTime?: string; endTime?: string; seats?: number }[] = []

  for (const e of events.confirmedEvents) {
    items.push({
      title: e.title,
      description: e.description ?? undefined,
      floor: e.floor_block ?? undefined,
      seats: e.seats_blocked,
    })
  }

  for (const ed of events.eventDates) {
    const e = ed.events
    if (e) {
      items.push({
        title: e.title,
        description: e.description ?? undefined,
        floor: e.floor_block ?? undefined,
        startTime: ed.start_time ?? undefined,
        endTime: ed.end_time ?? undefined,
        seats: e.seats_blocked,
      })
    }
  }

  for (const ei of events.eventInstances) {
    const e = ei.events
    if (e) {
      items.push({
        title: e.title,
        description: ei.notes || e.description || undefined,
        floor: e.floor_block ?? undefined,
        startTime: ei.start_time ?? undefined,
        endTime: ei.end_time ?? undefined,
        seats: e.seats_blocked,
      })
    }
  }

  // Dedupe by title
  const seen = new Set<string>()
  const unique = items.filter(i => {
    if (seen.has(i.title)) return false
    seen.add(i.title)
    return true
  })

  if (unique.length === 0) return null

  return (
    <Card className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300 border-2">
      <div className="flex items-center gap-2 mb-3">
        <PartyPopper className="w-5 h-5 text-orange-500" />
        <h3 className="font-bold text-orange-800">本日のイベント</h3>
      </div>
      <div className="space-y-2">
        {unique.map((item, idx) => (
          <div key={idx} className="bg-white/70 rounded-lg p-3">
            <p className="font-bold text-gray-800">{item.title}</p>
            {item.description && (
              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
              {item.startTime && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {item.startTime}{item.endTime ? ` 〜 ${item.endTime}` : ''}
                </span>
              )}
              {item.floor && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {item.floor}
                </span>
              )}
              {item.seats && item.seats > 0 && (
                <span>席ブロック: {item.seats}席</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
