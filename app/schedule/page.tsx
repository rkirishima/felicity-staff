'use client'

import { useState, useEffect } from 'react'
import { ScheduleRequestForm } from '@/components/forms/ScheduleRequestForm'
import { ScheduleHistory } from '@/components/forms/ScheduleHistory'
import { ChevronLeft } from 'lucide-react'

const STORAGE_KEY = 'felicity_staff_id'
const STORAGE_NAME_KEY = 'felicity_staff_name'

export default function SchedulePage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [staffName, setStaffName] = useState<string | null>(null)

  useEffect(() => {
    setUserId(localStorage.getItem(STORAGE_KEY))
    setStaffName(localStorage.getItem(STORAGE_NAME_KEY))
  }, [])

  if (!userId || !staffName) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">先にホーム画面でスタッフを選択してください</p>
          <a href="/" className="text-blue-600 hover:underline">ホームへ</a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 p-4 pb-20">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <a href="/" className="text-blue-600 hover:underline mb-3 inline-flex items-center gap-1 text-sm">
            <ChevronLeft className="w-4 h-4" /> ホーム
          </a>
          <h1 className="text-2xl font-bold text-gray-800">シフト申請</h1>
          <p className="text-gray-500 text-sm mt-1">{staffName}</p>
        </header>

        <div className="space-y-6">
          <ScheduleRequestForm
            userId={userId}
            staffName={staffName}
            onSuccess={() => setRefreshKey(k => k + 1)}
          />
          <ScheduleHistory userId={userId} key={refreshKey} />
        </div>
      </div>
    </main>
  )
}
