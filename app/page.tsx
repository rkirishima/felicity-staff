'use client'

import { useState, useEffect } from 'react'
import { TimeclockWidget } from '@/components/home/TimeclockWidget'
import { WeeklyScheduleWidget } from '@/components/home/WeeklyScheduleWidget'
import { EventAlert } from '@/components/home/EventAlert'
import { VersionChecker } from '@/components/VersionChecker'
import { Card } from '@/components/ui/card'
import { CalendarDays, ClipboardList, Settings, Clock, UserCircle } from 'lucide-react'

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
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">読み込み中...</p>
        </div>
      </main>
    )
  }

  // Staff picker
  if (!selectedId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-sm mx-auto pt-12">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCircle className="w-10 h-10 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Felicity Staff</h1>
            <p className="text-gray-500 mt-2">名前を選んでください</p>
          </div>
          <div className="space-y-3">
            {staffList.map(staff => (
              <button
                key={staff.id}
                onClick={() => selectStaff(staff)}
                className="w-full p-4 bg-white rounded-xl shadow-sm text-left font-medium text-gray-800 hover:bg-blue-50 hover:shadow-md transition-all border border-transparent hover:border-blue-200 text-lg flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                  {staff.name.charAt(0)}
                </div>
                {staff.name}
              </button>
            ))}
          </div>
          <div className="mt-8 text-center">
            <VersionChecker />
          </div>
        </div>
      </main>
    )
  }

  // Main app
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-24">
      <div className="max-w-lg mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Felicity Staff</h1>
            <p className="text-gray-500 text-sm mt-0.5">{selectedName}</p>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
          >
            <UserCircle className="w-4 h-4" />
            変更
          </button>
        </header>

        <div className="space-y-4">
          <EventAlert />
          <TimeclockWidget staffName={selectedName!} staffId={selectedId} />
          <WeeklyScheduleWidget userId={selectedId} />
        </div>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 py-2 z-50">
          <div className="max-w-lg mx-auto flex justify-around">
            <a href="/" className="flex flex-col items-center gap-0.5 text-blue-600 text-xs font-medium py-1 px-3">
              <Clock className="w-5 h-5" />
              打刻
            </a>
            <a href="/reservations" className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-orange-600 text-xs font-medium py-1 px-3">
              <CalendarDays className="w-5 h-5" />
              予約
            </a>
            <a href="/schedule" className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-green-600 text-xs font-medium py-1 px-3">
              <ClipboardList className="w-5 h-5" />
              申請
            </a>
            <a href="/admin" className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-purple-600 text-xs font-medium py-1 px-3">
              <Settings className="w-5 h-5" />
              管理
            </a>
          </div>
        </nav>

        <div className="mt-6 text-center">
          <VersionChecker />
        </div>
      </div>
    </main>
  )
}
