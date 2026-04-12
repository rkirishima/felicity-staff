'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import dayjs from 'dayjs'

interface ScheduleRequestFormProps {
  userId: string;
  staffName: string;
  onSuccess?: () => void;
}

export function ScheduleRequestForm({ userId, staffName, onSuccess }: ScheduleRequestFormProps) {
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    requested_date: '',
    start_time: '09:00',
    end_time: '18:00',
    reason: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/schedule/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          staff_name: staffName,
          requested_date: formData.requested_date,
          start_time: `${formData.requested_date}T${formData.start_time}:00`,
          end_time: `${formData.requested_date}T${formData.end_time}:00`,
          reason: formData.reason,
        }),
      })

      if (!res.ok) {
        throw new Error('シフト申請に失敗しました')
      }

      setSubmitted(true)
      setFormData({
        requested_date: '',
        start_time: '09:00',
        end_time: '18:00',
        reason: '',
      })

      setTimeout(() => {
        setSubmitted(false)
        onSuccess?.()
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Card className="p-6 bg-green-50 border-green-300">
        <p className="text-green-700 font-semibold">✅ シフト申請が完了しました</p>
        <p className="text-green-600 text-sm mt-2">管理者の承認をお待ちください</p>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">シフト申請</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="requested_date">申請日付 *</Label>
          <Input
            id="requested_date"
            name="requested_date"
            type="date"
            required
            value={formData.requested_date}
            onChange={handleChange}
            min={dayjs().format('YYYY-MM-DD')}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="start_time">開始時刻 *</Label>
            <Input
              id="start_time"
              name="start_time"
              type="time"
              required
              value={formData.start_time}
              onChange={handleChange}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="end_time">終了時刻 *</Label>
            <Input
              id="end_time"
              name="end_time"
              type="time"
              required
              value={formData.end_time}
              onChange={handleChange}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="reason">理由・備考</Label>
          <textarea
            id="reason"
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            className="w-full p-2 border rounded mt-1 text-sm"
            rows={3}
            placeholder="シフト申請の理由（任意）"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-300 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {loading ? '申請中...' : '申請する'}
        </Button>
      </form>
    </Card>
  )
}
