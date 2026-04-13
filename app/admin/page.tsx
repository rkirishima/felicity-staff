'use client'

import { useState } from 'react'
import { ApprovalTable } from '@/components/admin/ApprovalTable'
import { CSVExport } from '@/components/admin/CSVExport'
import { TimecardEditor } from '@/components/admin/TimecardEditor'
import { ChevronLeft } from 'lucide-react'

export default function AdminPage() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4 pb-20">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <a href="/" className="text-blue-600 hover:underline mb-3 inline-flex items-center gap-1 text-sm">
            <ChevronLeft className="w-4 h-4" /> ホーム
          </a>
          <h1 className="text-2xl font-bold text-gray-800">管理者ダッシュボード</h1>
          <p className="text-gray-500 text-sm mt-1">シフト承認とデータ管理</p>
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
