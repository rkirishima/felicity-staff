'use client'

import { useState } from 'react'
import { ApprovalTable } from '@/components/admin/ApprovalTable'
import { CSVExport } from '@/components/admin/CSVExport'
import { TimecardEditor } from '@/components/admin/TimecardEditor'

export default function AdminPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <a href="/" className="text-blue-600 hover:underline mb-4 inline-block">
            ← ホームに戻る
          </a>
          <h1 className="text-4xl font-bold text-gray-800">管理者ダッシュボード</h1>
          <p className="text-gray-600 mt-2">シフト承認とデータ管理</p>
        </header>

        <div className="space-y-6">
          <TimecardEditor />

          <ApprovalTable
            refreshKey={refreshKey}
            onApprovalChange={() => setRefreshKey(k => k + 1)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CSVExport type="timeclock" />
            <CSVExport type="schedule" />
          </div>
        </div>
      </div>
    </main>
  )
}
