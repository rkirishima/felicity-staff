'use client'

import { useState, useEffect } from 'react'
import { TimeclockWidget } from '@/components/home/TimeclockWidget'
import { WeeklyScheduleWidget } from '@/components/home/WeeklyScheduleWidget'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Staff {
  id: string
  name: string
}

const STORAGE_KEY = 'felicity_staff_id'
const STORAGE_NAME_KEY = 'felicity_staff_name'

export default function Home() {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restore selection from localStorage
    const savedId = localStorage.getItem(STORAGE_KEY)
    const savedName = localStorage.getItem(STORAGE_NAME_KEY)
    if (savedId && savedName) {
      setSelectedId(savedId)
      setSelectedName(savedName)
    }

    fetch('/api/staff')
      .then(r => r.json())
      .then(data => setStaffList(data || []))
      .finally(() => setLoading(false))
  }, [])

  function selectStaff(staff: Staff) {
    setSelectedId(staff.id)
    setSelectedName(staff.name)
    localStorage.setItem(STORAGE_KEY, staff.id)
    localStorage.setItem(STORAGE_NAME_KEY, staff.name)
  }

  function signOut() {
    setSelectedId(null)
    setSelectedName(null)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_NAME_KEY)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </main>
    )
  }

  // Staff picker
  if (!selectedId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-sm mx-auto pt-16">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Felicity Staff</h1>
            <p className="text-gray-500 mt-2">名前を選んでください</p>
          </div>
          <div className="space-y-3">
            {staffList.map(staff => (
              <button
                key={staff.id}
                onClick={() => selectStaff(staff)}
                className="w-full p-4 bg-white rounded-xl shadow-sm text-left font-medium text-gray-800 hover:bg-blue-50 hover:shadow-md transition-all border border-transparent hover:border-blue-200 text-lg"
              >
                {staff.name}
              </button>
            ))}
          </div>
        </div>
      </main>
    )
  }

  // Main app
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Felicity Staff</h1>
            <p className="text-gray-500 mt-1">{selectedName}</p>
          </div>
          <div className="flex gap-3">
            <a
              href="/admin"
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              管理者
            </a>
            <button
              onClick={signOut}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              変更
            </button>
          </div>
        </header>

        <div className="space-y-6">
          <TimeclockWidget staffName={selectedName!} staffId={selectedId} />
          <WeeklyScheduleWidget userId={selectedId} />
        </div>
      </div>
    </main>
  )
}
