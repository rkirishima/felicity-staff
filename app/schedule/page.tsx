'use client'

import { useState } from 'react'
import { ScheduleRequestForm } from '@/components/forms/ScheduleRequestForm'
import { ScheduleHistory } from '@/components/forms/ScheduleHistory'

const DEMO_USER_ID = 'demo-user-001'
const DEMO_STAFF_NAME = 'テスト スタッフ'

export default function SchedulePage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <a href="/" className="text-blue-600 hover:underline mb-4 inline-block">
            ← ホームに戻る
          </a>
          <h1 className="text-4xl font-bold text-gray-800">シフト管理</h1>
          <p className="text-gray-600 mt-2">シフト申請と履歴確認</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ScheduleRequestForm
            userId={DEMO_USER_ID}
            staffName={DEMO_STAFF_NAME}
            onSuccess={() => setRefreshKey(k => k + 1)}
          />
          <ScheduleHistory userId={DEMO_USER_ID} key={refreshKey} />
        </div>
      </div>
    </main>
  )
}
