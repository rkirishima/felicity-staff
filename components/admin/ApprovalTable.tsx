'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import dayjs from 'dayjs'
import { ScheduleRequest } from '@/types'

interface ApprovalTableProps {
  refreshKey?: number;
  onApprovalChange?: () => void;
}

export function ApprovalTable({ refreshKey, onApprovalChange }: ApprovalTableProps) {
  const [requests, setRequests] = useState<ScheduleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch('/api/approval/pending')
        if (res.ok) {
          const data = await res.json()
          setRequests(data || [])
        }
      } catch (error) {
        console.error('Failed to fetch pending requests:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
  }, [refreshKey])

  const handleApprove = async (id: string) => {
    setProcessing(id)
    try {
      const res = await fetch(`/api/approval/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      })

      if (res.ok) {
        setRequests(requests.filter(r => r.id !== id))
        onApprovalChange?.()
      }
    } catch (error) {
      console.error('Approval failed:', error)
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (id: string) => {
    setProcessing(id)
    try {
      const res = await fetch(`/api/approval/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })

      if (res.ok) {
        setRequests(requests.filter(r => r.id !== id))
        onApprovalChange?.()
      }
    } catch (error) {
      console.error('Rejection failed:', error)
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return <Card className="p-6"><p>読込中...</p></Card>
  }

  if (requests.length === 0) {
    return (
      <Card className="p-6 bg-green-50 border-green-300">
        <p className="text-green-700 font-semibold">✅ 承認待ちはありません</p>
      </Card>
    )
  }

  return (
    <Card className="p-6 overflow-x-auto">
      <h2 className="text-2xl font-bold mb-4">承認待ちシフト</h2>
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <th className="text-left py-2">スタッフ</th>
            <th className="text-left py-2">申請日</th>
            <th className="text-left py-2">時間帯</th>
            <th className="text-left py-2">理由</th>
            <th className="text-right py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(req => (
            <tr key={req.id} className="border-b hover:bg-gray-50">
              <td className="py-3">{req.staff_name}</td>
              <td className="py-3">{dayjs(req.requested_date).format('MM/DD')}</td>
              <td className="py-3">
                {dayjs(req.start_time).format('HH:mm')} - {dayjs(req.end_time).format('HH:mm')}
              </td>
              <td className="py-3 text-gray-600 text-xs">{req.reason?.substring(0, 20)}...</td>
              <td className="py-3 text-right space-x-2">
                <Button
                  size="sm"
                  onClick={() => handleApprove(req.id)}
                  disabled={processing === req.id}
                  className="bg-green-600 hover:bg-green-700"
                >
                  承認
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleReject(req.id)}
                  disabled={processing === req.id}
                  className="bg-red-600 hover:bg-red-700"
                >
                  却下
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
