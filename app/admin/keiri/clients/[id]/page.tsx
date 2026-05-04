'use client'
export const dynamic = 'force-dynamic'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import {
  archiveClient,
  unarchiveClient,
  updateClientRecord,
  type ClientInput,
} from '@/app/admin/keiri/clients/actions'
import { ClientForm, type ClientFormValues } from '@/components/keiri/ClientForm'

type Row = ClientFormValues & { active: boolean }

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [initial, setInitial] = useState<Row | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) {
      router.replace('/admin')
      return
    }
    ;(async () => {
      const { data } = await supabase.from('keiri_clients').select('*').eq('id', id).single()
      if (!data) {
        toast.error('取引先が見つかりません')
        router.replace('/admin/keiri/clients')
        return
      }
      setInitial({
        name: data.name ?? '',
        name_kana: data.name_kana ?? '',
        registration_number: data.registration_number ?? '',
        postal_code: data.postal_code ?? '',
        address: data.address ?? '',
        contact_person: data.contact_person ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        payment_terms: data.payment_terms ?? '',
        notes: data.notes ?? '',
        active: !!data.active,
      })
    })()
  }, [id, router, supabase])

  async function save(input: ClientInput) {
    setSaving(true)
    try {
      await updateClientRecord(id, input)
      toast.success('更新しました')
      router.push('/admin/keiri/clients')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggleArchive() {
    if (!initial) return
    if (!confirm(initial.active ? 'アーカイブしますか?' : '復元しますか?')) return
    setBusy(true)
    try {
      if (initial.active) await archiveClient(id)
      else await unarchiveClient(id)
      toast.success(initial.active ? 'アーカイブしました' : '復元しました')
      router.push('/admin/keiri/clients')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!initial) {
    return (
      <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
        <p className="text-center text-stone-400 text-sm py-12">読み込み中...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri/clients')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">取引先を編集</h1>
          <span className="w-10" />
        </div>

        <ClientForm initial={initial} onSave={save} saving={saving} saveLabel="保存" />

        <button
          onClick={toggleArchive}
          disabled={busy}
          className="w-full bg-white border border-stone-300 text-stone-600 py-3 rounded-2xl text-sm shadow-sm disabled:opacity-40"
        >
          {initial.active ? 'アーカイブする' : '復元する'}
        </button>
      </div>
    </main>
  )
}
