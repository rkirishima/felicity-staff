'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import dayjs from 'dayjs'
import { ScheduleRequest } from '@/types'

interface ScheduleHistoryProps {
  userId: string;
}

export function ScheduleHistory({ userId }: ScheduleHistoryProps) {
  const [requests, setRequests] = useState<ScheduleRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch(`/api/schedule/requests?user_id=${userId}`)
        if (res.ok) {
          const data = await res.json()
          setRequests(data || [])
        }
      } catch (error) {
        console.error('Failed to fetch schedule requests:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
  }, [userId])

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800'
  }

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: '未定',
      approved: '承認',
      rejected: '却下',
    }
    return labels[status as keyof typeof labels] || status
  }

  if (loading) {
    return <Card className="p-6"><p>読込中...</p></Card>
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">申請履歴</h2>
      {requests.length === 0 ? (
        <p className="text-gray-500">申請履歴がありません</p>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="p-3 border rounded hover:bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold">{dayjs(req.requested_date).format('YYYY年MM月DD日')}</p>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusBadge(req.status)}`}>
                  {getStatusLabel(req.status)}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {dayjs(req.start_time).format('HH:mm')} - {dayjs(req.end_time).format('HH:mm')}
              </p>
              {req.reason && (
                <p className="text-xs text-gray-500 mt-1">{req.reason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
