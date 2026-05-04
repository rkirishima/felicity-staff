'use client'
export const dynamic = 'force-dynamic'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import {
  archiveItem,
  unarchiveItem,
  updateItemRecord,
  type ItemInput,
} from '@/app/admin/keiri/items/actions'
import { ItemForm, type ItemFormValues } from '@/components/keiri/ItemForm'

type Row = ItemFormValues & { active: boolean }

export default function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
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
      const { data } = await supabase.from('keiri_items').select('*').eq('id', id).single()
      if (!data) {
        toast.error('商品が見つかりません')
        router.replace('/admin/keiri/items')
        return
      }
      setInitial({
        name: data.name ?? '',
        description: data.description ?? '',
        unit_price: String(data.unit_price ?? ''),
        tax_rate: (data.tax_rate === 8 ? 8 : 10) as 10 | 8,
        unit: data.unit ?? '',
        category_id: data.category_id ?? '',
        active: !!data.active,
      })
    })()
  }, [id, router, supabase])

  async function save(input: ItemInput) {
    setSaving(true)
    try {
      await updateItemRecord(id, input)
      toast.success('更新しました')
      router.push('/admin/keiri/items')
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
      if (initial.active) await archiveItem(id)
      else await unarchiveItem(id)
      toast.success(initial.active ? 'アーカイブしました' : '復元しました')
      router.push('/admin/keiri/items')
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
          <button onClick={() => router.push('/admin/keiri/items')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">商品を編集</h1>
          <span className="w-10" />
        </div>

        <ItemForm initial={initial} onSave={save} saving={saving} saveLabel="保存" />

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
