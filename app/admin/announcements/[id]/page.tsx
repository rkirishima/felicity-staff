'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import { updateAnnouncement, deleteAnnouncement, type AnnouncementInput } from '../actions'
import { AnnouncementForm } from '../new/page'

export default function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [form, setForm] = useState<AnnouncementInput | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        toast.error('告知が見つかりません')
        router.push('/admin/announcements')
        return
      }
      setForm({
        title: data.title,
        title_en: data.title_en,
        body: data.body,
        body_en: data.body_en,
        banner_text: data.banner_text,
        banner_text_en: data.banner_text_en,
        type: data.type,
        start_date: data.start_date,
        end_date: data.end_date,
        event_date: data.event_date,
        event_start_time: data.event_start_time ? data.event_start_time.slice(0, 5) : null,
        event_end_time: data.event_end_time ? data.event_end_time.slice(0, 5) : null,
        link_url: data.link_url,
        published: data.published,
        priority: data.priority,
      })
    })()
    return () => { cancelled = true }
  }, [id, router])

  function set<K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) {
    setForm(f => (f ? { ...f, [k]: v } : f))
  }

  async function handleSave() {
    if (!form) return
    if (!form.title.trim()) { toast.error('タイトル必須'); return }
    if (!form.banner_text.trim()) { toast.error('バナー文必須'); return }
    setSaving(true)
    try {
      await updateAnnouncement(id, form)
      toast.success('保存しました')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('この告知を削除しますか？（復元できません）')) return
    try {
      await deleteAnnouncement(id)
      toast.success('削除しました')
      router.push('/admin/announcements')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '削除失敗')
    }
  }

  if (!form) {
    return (
      <main className="min-h-screen pt-8 px-4" style={{ backgroundColor: '#F5F0E8' }}>
        <p className="text-stone-400 text-sm text-center">読み込み中...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/announcements')} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">告知編集</h1>
          <div className="w-12" />
        </div>

        <AnnouncementForm form={form} set={set} />

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-stone-800 text-white py-3 rounded-2xl font-medium disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          onClick={handleDelete}
          className="w-full bg-white border border-rose-300 text-rose-700 py-3 rounded-2xl font-medium"
        >
          削除
        </button>
      </div>
    </main>
  )
}
