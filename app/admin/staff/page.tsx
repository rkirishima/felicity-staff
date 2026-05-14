'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { toast } from 'sonner'

type Role = 'staff' | 'admin' | 'accountant'
type StaffRow = {
  id: string
  name: string
  role: Role
  active: boolean
  hourly_rate: number | null
  employment_type: string | null
  skill: string | null
}

const ROLES: { value: Role; label: string; badge: string }[] = [
  { value: 'staff', label: 'スタッフ', badge: 'bg-stone-100 text-stone-600' },
  { value: 'admin', label: 'ADMIN', badge: 'bg-teal-100 text-teal-700' },
  { value: 'accountant', label: '経理', badge: 'bg-amber-100 text-amber-700' },
]

export default function AdminStaffPage() {
  const router = useRouter()
  const supabase = createClient()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<StaffRow>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) { router.replace('/admin'); return }
    load()
  }, [])

  async function load() {
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, role, active, hourly_rate, employment_type, skill')
      .order('active', { ascending: false })
      .order('role')
      .order('name')
    if (error) { toast.error('読み込み失敗: ' + error.message); return }
    setStaff((data ?? []) as StaffRow[])
  }

  function startEdit(s: StaffRow) {
    setEditingId(s.id)
    setDraft({ role: s.role, active: s.active, hourly_rate: s.hourly_rate })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft({})
  }

  async function save(id: string) {
    setSaving(true)
    const payload: Record<string, unknown> = {}
    if (draft.role !== undefined) payload.role = draft.role
    if (draft.active !== undefined) payload.active = draft.active
    if (draft.hourly_rate !== undefined) payload.hourly_rate = draft.hourly_rate
    const { error } = await supabase.from('staff').update(payload).eq('id', id)
    setSaving(false)
    if (error) { toast.error('保存失敗: ' + error.message); return }
    toast.success('更新しました')
    setEditingId(null)
    setDraft({})
    load()
  }

  const visible = staff.filter(s => showInactive || s.active)

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.push('/admin')} className="text-stone-400 text-lg">←</button>
        <h1 className="text-lg font-bold tracking-widest text-stone-800">スタッフ管理</h1>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-stone-400">{visible.length}名表示中</p>
        <label className="flex items-center gap-2 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="w-4 h-4 accent-stone-700"
          />
          無効も表示
        </label>
      </div>

      <div className="space-y-2">
        {visible.map(s => {
          const isEditing = editingId === s.id
          const currentRole = isEditing ? (draft.role ?? s.role) : s.role
          const roleMeta = ROLES.find(r => r.value === currentRole) ?? ROLES[0]
          return (
            <div
              key={s.id}
              className={`bg-white rounded-2xl shadow-sm p-4 ${!s.active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-stone-800">{s.name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${roleMeta.badge}`}>
                    {roleMeta.label}
                  </span>
                  {!s.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">
                      無効
                    </span>
                  )}
                </div>
                {!isEditing && (
                  <button
                    onClick={() => startEdit(s)}
                    className="text-xs text-teal-600 px-3 py-1 rounded-lg bg-teal-50"
                  >
                    編集
                  </button>
                )}
              </div>

              {!isEditing && (
                <p className="text-xs text-stone-400 mt-1">
                  時給 ¥{(s.hourly_rate ?? 0).toLocaleString()}
                  {s.employment_type && <> ・ {s.employment_type}</>}
                  {s.skill && <> ・ {s.skill}</>}
                </p>
              )}

              {isEditing && (
                <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
                  {/* ロール */}
                  <div>
                    <p className="text-xs text-stone-400 mb-1.5">ロール</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {ROLES.map(r => {
                        const active = (draft.role ?? s.role) === r.value
                        return (
                          <button
                            key={r.value}
                            onClick={() => setDraft(d => ({ ...d, role: r.value }))}
                            className={`py-2 rounded-xl text-xs font-medium transition-all ${
                              active ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {r.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* 有効 / 無効 */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-stone-400">在籍</p>
                    <button
                      onClick={() => setDraft(d => ({ ...d, active: !(d.active ?? s.active) }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium ${
                        (draft.active ?? s.active)
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-red-50 text-red-500'
                      }`}
                    >
                      {(draft.active ?? s.active) ? '在籍中' : '退職/休職'}
                    </button>
                  </div>

                  {/* 時給 */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-stone-400">時給</p>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-stone-400">¥</span>
                      <input
                        type="number"
                        value={draft.hourly_rate ?? s.hourly_rate ?? 0}
                        onChange={e =>
                          setDraft(d => ({ ...d, hourly_rate: Number(e.target.value) }))
                        }
                        className="w-24 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-right bg-white text-stone-800"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex-1 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-sm font-medium"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={() => save(s.id)}
                      disabled={saving}
                      className="flex-1 py-2.5 bg-stone-800 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
