'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const FREQ_LABEL: Record<string, string> = {
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
}

const FREQ_COLOR: Record<string, string> = {
  daily: 'bg-teal-100 text-teal-700',
  weekly: 'bg-amber-100 text-amber-700',
  monthly: 'bg-purple-100 text-purple-700',
}

const CAT_LABEL: Record<string, string> = {
  cleaning: '🧹 清掃',
  machine: '⚙️ 機器操作',
  food: '🍽️ フード',
  drink: '☕ ドリンク',
  other: '📋 その他',
}

const CAT_OPTIONS = ['drink', 'food', 'machine', 'cleaning', 'other']
const FREQ_OPTIONS = ['', 'daily', 'weekly', 'monthly']

type Manual = {
  id: string
  title: string
  category: string
  frequency?: string
  content?: string
  youtube_url?: string
  image_url?: string
}

const EMPTY_FORM = {
  title: '',
  category: 'drink',
  frequency: '',
  content: '',
  youtube_url: '',
  image_url: '',
}

export default function RecipesPage() {
  const [manuals, setManuals] = useState<Manual[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('manuals').select('*').order('category').order('title')
    setManuals(data ?? [])
  }

  function openNew() {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setFormOpen(true)
  }

  function openEdit(m: Manual, e: React.MouseEvent) {
    e.stopPropagation()
    setForm({
      title: m.title,
      category: m.category,
      frequency: m.frequency ?? '',
      content: m.content ?? '',
      youtube_url: m.youtube_url ?? '',
      image_url: m.image_url ?? '',
    })
    setEditingId(m.id)
    setFormOpen(true)
  }

  async function handleImageUpload(file: File) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('manual-images').upload(path, file)
      if (!error) {
        const { data } = supabase.storage.from('manual-images').getPublicUrl(path)
        setForm(f => ({ ...f, image_url: data.publicUrl }))
      }
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await supabase.from('manuals').update(form).eq('id', editingId)
      } else {
        await supabase.from('manuals').insert(form)
      }
      await load()
      setFormOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function del(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('このマニュアルを削除しますか？')) return
    await supabase.from('manuals').delete().eq('id', id)
    await load()
    if (expanded === id) setExpanded(null)
  }

  function getYoutubeId(url: string) {
    const match = url?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)
    return match?.[1]
  }

  const categories = ['all', ...Array.from(new Set(manuals.map(m => m.category)))]
  const filtered = selectedCat === 'all' ? manuals : manuals.filter(m => m.category === selectedCat)

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold tracking-widest text-stone-800">マニュアル</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 text-white rounded-xl text-sm font-medium"
        >
          <span>＋</span> 追加
        </button>
      </div>

      {/* カテゴリフィルター */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {categories.map(cat => (
          <button key={cat} onClick={() => setSelectedCat(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              selectedCat === cat ? 'bg-stone-800 text-white' : 'bg-white text-stone-500 shadow-sm'
            }`}>
            {cat === 'all' ? '📋 すべて' : CAT_LABEL[cat] || cat}
          </button>
        ))}
      </div>

      {/* リスト */}
      {manuals.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-stone-400 shadow-sm">
          <p className="text-2xl mb-2">📖</p>
          <p className="text-sm">マニュアルはまだありません</p>
          <p className="text-xs mt-1">「追加」から作成できます</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const ytId = getYoutubeId(m.youtube_url || '')
            const isOpen = expanded === m.id
            return (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : m.id)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-800 text-sm truncate">{m.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.frequency && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${FREQ_COLOR[m.frequency] || 'bg-stone-100 text-stone-500'}`}>
                          {FREQ_LABEL[m.frequency] || m.frequency}
                        </span>
                      )}
                      <span className="text-xs text-stone-400">{CAT_LABEL[m.category] || m.category}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <button
                      onClick={(e) => openEdit(m, e)}
                      className="text-xs px-2.5 py-1 bg-stone-100 text-stone-500 rounded-lg hover:bg-stone-200 transition-all"
                    >
                      編集
                    </button>
                    <button
                      onClick={(e) => del(m.id, e)}
                      className="text-xs px-2.5 py-1 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 transition-all"
                    >
                      削除
                    </button>
                    <span className="text-stone-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {m.image_url && (
                      <img
                        src={m.image_url}
                        alt={m.title}
                        className="w-full rounded-xl object-cover max-h-48"
                      />
                    )}
                    {m.content && (
                      <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    )}
                    {ytId && (
                      <a href={m.youtube_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 font-medium text-sm hover:bg-red-100 transition-all">
                        <span className="text-xl">▶️</span>
                        YouTubeで見る
                      </a>
                    )}
                    {!ytId && !m.content && !m.image_url && (
                      <p className="text-xs text-stone-400">詳細情報が登録されていません</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 追加・編集モーダル */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
          onClick={() => setFormOpen(false)}>
          <div
            className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-stone-800">
                {editingId ? 'マニュアルを編集' : '新しいマニュアル'}
              </h2>
              <button onClick={() => setFormOpen(false)} className="text-stone-400 text-xl">✕</button>
            </div>

            {/* タイトル */}
            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">タイトル *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="例：カフェラテの作り方"
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:border-stone-400"
              />
            </div>

            {/* カテゴリ */}
            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">カテゴリ</label>
              <div className="flex gap-2 flex-wrap">
                {CAT_OPTIONS.map(cat => (
                  <button key={cat} onClick={() => setForm(f => ({ ...f, category: cat }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      form.category === cat ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'
                    }`}>
                    {CAT_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* 頻度 */}
            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">頻度</label>
              <div className="flex gap-2 flex-wrap">
                {FREQ_OPTIONS.map(freq => (
                  <button key={freq} onClick={() => setForm(f => ({ ...f, frequency: freq }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      form.frequency === freq ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500'
                    }`}>
                    {freq ? FREQ_LABEL[freq] : 'なし'}
                  </button>
                ))}
              </div>
            </div>

            {/* 内容 */}
            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">内容・手順</label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="手順や注意点を入力..."
                rows={5}
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:border-stone-400 resize-none"
              />
            </div>

            {/* 画像アップロード */}
            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">画像</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleImageUpload(file)
                }}
              />
              {form.image_url ? (
                <div className="relative">
                  <img src={form.image_url} alt="" className="w-full rounded-xl object-cover max-h-40" />
                  <button
                    onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed border-stone-200 rounded-xl py-4 text-stone-400 text-sm text-center hover:border-stone-300 transition-all"
                >
                  {uploading ? 'アップロード中...' : '📷 タップして画像を追加'}
                </button>
              )}
            </div>

            {/* YouTube URL */}
            <div>
              <label className="text-xs text-stone-500 font-medium mb-1 block">YouTube URL（任意）</label>
              <input
                value={form.youtube_url}
                onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))}
                placeholder="https://youtu.be/..."
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:border-stone-400"
              />
            </div>

            {/* 保存ボタン */}
            <button
              onClick={save}
              disabled={saving || !form.title.trim()}
              className="w-full py-3.5 bg-stone-800 text-white rounded-xl font-medium text-sm disabled:opacity-40 transition-all"
            >
              {saving ? '保存中...' : editingId ? '変更を保存' : '追加する'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
