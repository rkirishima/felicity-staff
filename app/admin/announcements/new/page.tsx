'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { createAnnouncement, type AnnouncementInput } from '../actions'

function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function NewAnnouncementPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<AnnouncementInput>({
    title: '',
    title_en: '',
    body: '',
    body_en: '',
    banner_text: '',
    banner_text_en: '',
    type: 'closure',
    start_date: todayJST(),
    end_date: todayJST(),
    event_date: null,
    event_start_time: null,
    event_end_time: null,
    link_url: null,
    published: true,
    priority: 0,
  })

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  function set<K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('タイトル必須'); return }
    if (!form.banner_text.trim()) { toast.error('バナー文必須'); return }
    if (form.start_date > form.end_date) { toast.error('掲載開始日が終了日より後になっています'); return }
    setSaving(true)
    try {
      const session = getAdminSession()
      const id = await createAnnouncement(form, session?.staffName ?? null)
      toast.success('告知を作成しました')
      router.push(`/admin/announcements/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-stone-500 text-sm">← 戻る</button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">新規告知</h1>
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
      </div>
    </main>
  )
}

export function AnnouncementForm({
  form,
  set,
}: {
  form: AnnouncementInput
  set: <K extends keyof AnnouncementInput>(k: K, v: AnnouncementInput[K]) => void
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <Field label="種別">
        <select
          value={form.type}
          onChange={e => set('type', e.target.value as AnnouncementInput['type'])}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        >
          <option value="closure">🏷 貸切・休業</option>
          <option value="event">🎉 イベント</option>
          <option value="menu">☕ メニュー</option>
          <option value="other">📌 その他</option>
        </select>
      </Field>

      <Field label="タイトル（日本語・必須）">
        <input
          type="text"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          placeholder="貸切営業のお知らせ"
        />
      </Field>
      <Field label="Title (English)">
        <input
          type="text"
          value={form.title_en ?? ''}
          onChange={e => set('title_en', e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          placeholder="Private Event Notice"
        />
      </Field>

      <Field label="バナー文（短文・1行・必須）" hint="サイト上部・SNS見出し用">
        <input
          type="text"
          value={form.banner_text}
          onChange={e => set('banner_text', e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          placeholder="7/2(木) 7:00〜14:00 貸切のため一般営業休止"
        />
      </Field>
      <Field label="Banner (English)">
        <input
          type="text"
          value={form.banner_text_en ?? ''}
          onChange={e => set('banner_text_en', e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          placeholder="Closed for private event 7:00–14:00 on Jul 2"
        />
      </Field>

      <Field label="本文（日本語・詳細）">
        <textarea
          value={form.body ?? ''}
          onChange={e => set('body', e.target.value)}
          rows={4}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          placeholder="2026年7月2日（木）は朝7時から14時まで貸切営業とさせていただきます…"
        />
      </Field>
      <Field label="Body (English)">
        <textarea
          value={form.body_en ?? ''}
          onChange={e => set('body_en', e.target.value)}
          rows={4}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          placeholder="We will be closed for a private event…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="掲載開始日">
          <input
            type="date"
            value={form.start_date}
            onChange={e => set('start_date', e.target.value)}
            className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          />
        </Field>
        <Field label="掲載終了日">
          <input
            type="date"
            value={form.end_date}
            onChange={e => set('end_date', e.target.value)}
            className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          />
        </Field>
      </div>

      <Field label="対象日（任意）" hint="貸切・休業の実施日">
        <input
          type="date"
          value={form.event_date ?? ''}
          onChange={e => set('event_date', e.target.value || null)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="開始時刻（任意）">
          <input
            type="time"
            value={form.event_start_time ?? ''}
            onChange={e => set('event_start_time', e.target.value || null)}
            className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          />
        </Field>
        <Field label="終了時刻（任意）">
          <input
            type="time"
            value={form.event_end_time ?? ''}
            onChange={e => set('event_end_time', e.target.value || null)}
            className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          />
        </Field>
      </div>

      <Field label="詳細リンク（任意）">
        <input
          type="url"
          value={form.link_url ?? ''}
          onChange={e => set('link_url', e.target.value || null)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          placeholder="https://felicity.cafe/events/..."
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="優先度" hint="大きい数字ほど上に表示">
          <input
            type="number"
            value={form.priority}
            onChange={e => set('priority', parseInt(e.target.value, 10) || 0)}
            className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
          />
        </Field>
        <Field label="公開状態">
          <label className="flex items-center gap-2 pt-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={form.published}
              onChange={e => set('published', e.target.checked)}
              className="w-4 h-4"
            />
            公開する
          </label>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-xs text-stone-600 font-medium">{label}</label>
        {hint && <span className="text-[10px] text-stone-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
