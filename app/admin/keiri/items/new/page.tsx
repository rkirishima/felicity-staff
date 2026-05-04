'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { createItemRecord, type ItemInput } from '@/app/admin/keiri/items/actions'
import { ItemForm, emptyItem } from '@/components/keiri/ItemForm'

export default function NewItemPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  async function save(input: ItemInput) {
    setSaving(true)
    try {
      await createItemRecord(input)
      toast.success('登録しました')
      router.push('/admin/keiri/items')
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
          <button onClick={() => router.push('/admin/keiri/items')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">商品を追加</h1>
          <span className="w-10" />
        </div>
        <ItemForm initial={emptyItem()} onSave={save} saving={saving} saveLabel="保存" />
      </div>
    </main>
  )
}
