'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { createClientRecord } from '@/app/admin/keiri/clients/actions'
import { ClientForm, emptyClient } from '@/components/keiri/ClientForm'
import type { ClientInput } from '@/app/admin/keiri/clients/actions'

export default function NewClientPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  async function save(input: ClientInput) {
    setSaving(true)
    try {
      await createClientRecord(input)
      toast.success('登録しました')
      router.push('/admin/keiri/clients')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/clients')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">取引先を追加</h1>
          <span className="w-10" />
        </div>
        <ClientForm initial={emptyClient()} onSave={save} saving={saving} saveLabel="保存" />
      </div>
    </main>
  )
}
