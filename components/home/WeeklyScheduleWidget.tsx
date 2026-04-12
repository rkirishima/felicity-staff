'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

interface WeeklyScheduleWidgetProps {
  userId: string;
}

interface ScheduleItem {
  date: string;
  day: string;
  shift_start?: string;
  shift_end?: string;
  status: 'scheduled' | 'off' | 'pending';
}

export function WeeklyScheduleWidget({ userId }: WeeklyScheduleWidgetProps) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        const res = await fetch(`/api/schedule/weekly?user_id=${userId}`)
        if (res.ok) {
          const data = await res.json()
          setSchedule(data)
        }
      } catch (error) {
        console.error('Failed to fetch weekly schedule:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSchedule()
  }, [userId])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-green-100 border-green-300'
      case 'off':
        return 'bg-gray-100 border-gray-300'
      case 'pending':
        return 'bg-yellow-100 border-yellow-300'
      default:
        return 'bg-white border-gray-300'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled':
        return '予定'
      case 'off':
        return '休休'
      case 'pending':
        return '未定'
      default:
        return ''
    }
  }

  if (loading) {
    return <Card className="p-6"><p>読込中...</p></Card>
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">今週のシフト</h2>
      <div className="grid grid-cols-7 gap-2">
        {schedule.map((item, idx) => (
          <div
            key={idx}
            className={`p-3 border-2 rounded text-center ${getStatusColor(item.status)}`}
          >
            <p className="text-xs font-semibold text-gray-600">{item.day}</p>
            <p className="text-sm font-bold">{item.date}</p>
            <div className="text-xs mt-2">
              {item.shift_start && item.shift_end ? (
                <>
                  <p className="text-blue-600">{dayjs(item.shift_start).format('HH:mm')}</p>
                  <p className="text-red-600">{dayjs(item.shift_end).format('HH:mm')}</p>
                </>
              ) : (
                <p className="text-gray-500">{getStatusLabel(item.status)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
