'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import dayjs from 'dayjs'

interface TimeclockWidgetProps {
  staffName: string
  staffId: string
}

export function TimeclockWidget({ staffName, staffId }: TimeclockWidgetProps) {
  const [clockedIn, setClockedIn] = useState(false)
  const [clockInTime, setClockInTime] = useState<string | null>(null)
  const [clockOutTime, setClockOutTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    setInitialLoading(true)
    const fetchToday = async () => {
      try {
        const res = await fetch(`/api/timeclock/today?staff_id=${staffId}`)
        if (!res.ok) return
        const data = await res.json()
        setClockInTime(data?.clock_in ?? null)
        setClockOutTime(data?.clock_out ?? null)
        setClockedIn(!!data?.clock_in && !data?.clock_out)
      } finally {
        setInitialLoading(false)
      }
    }
    fetchToday()
    const interval = setInterval(fetchToday, 30000)
    return () => clearInterval(interval)
  }, [staffId])

  const handleClockIn = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/timeclock/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId }),
      })
      const data = await res.json()
      if (res.ok) {
        setClockInTime(data.clock_in)
        setClockedIn(true)
      } else {
        alert(data.error || '出勤処理に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClockOut = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/timeclock/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId }),
      })
      const data = await res.json()
      if (res.ok) {
        setClockOutTime(data.clock_out)
        setClockedIn(false)
      } else {
        alert(data.error || '退勤処理に失敗しました')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">打刻</h2>
          <p className="text-gray-600">{staffName}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">出勤</p>
            <p className="text-2xl font-bold text-blue-700">
              {clockInTime ? dayjs(clockInTime).format('HH:mm') : '--:--'}
            </p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">退勤</p>
            <p className="text-2xl font-bold text-red-700">
              {clockOutTime ? dayjs(clockOutTime).format('HH:mm') : '--:--'}
            </p>
          </div>
        </div>

        {initialLoading ? (
          <div className="flex items-center justify-center h-12">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex gap-3">
              <Button
                onClick={handleClockIn}
                disabled={clockedIn || loading || !!clockOutTime}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 text-base"
              >
                {loading && !clockedIn ? '処理中...' : '出勤'}
              </Button>
              <Button
                onClick={handleClockOut}
                disabled={!clockedIn || loading}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white h-12 text-base"
              >
                {loading && clockedIn ? '処理中...' : '退勤'}
              </Button>
            </div>
            {clockOutTime && (
              <p className="text-center text-sm text-gray-500">お疲れ様でした！</p>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
