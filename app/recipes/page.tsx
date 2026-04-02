'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
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

export default function RecipesPage() {
  const [manuals, setManuals] = useState<any[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('manuals').select('*').order('category').order('title')
      .then(({ data }) => setManuals(data ?? []))
  }, [])

  const categories = ['all', ...Array.from(new Set(manuals.map(m => m.category)))]
  const filtered = selectedCat === 'all' ? manuals : manuals.filter(m => m.category === selectedCat)

  function getYoutubeId(url: string) {
    const match = url?.match(/(?:v=|youtu\.be\/)([^&\s]+)/)
    return match?.[1]
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-24" style={{ backgroundColor: '#F5F0E8' }}>
      <h1 className="text-lg font-bold tracking-widest text-stone-800 mb-4">マニュアル</h1>

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

      {manuals.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-stone-400 shadow-sm">
          <p className="text-2xl mb-2">📖</p>
          <p className="text-sm">マニュアルはまだありません</p>
          <p className="text-xs mt-1">管理画面から追加できます</p>
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
                  <div>
                    <p className="font-medium text-stone-800 text-sm">{m.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.frequency && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${FREQ_COLOR[m.frequency] || 'bg-stone-100 text-stone-500'}`}>
                          {FREQ_LABEL[m.frequency] || m.frequency}
                        </span>
                      )}
                      <span className="text-xs text-stone-400">{CAT_LABEL[m.category] || m.category}</span>
                    </div>
                  </div>
                  <span className="text-stone-400 text-lg">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {m.content && (
                      <p className="text-sm text-stone-600 leading-relaxed">{m.content}</p>
                    )}
                    {ytId && (
                      <div>
                        <a href={m.youtube_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 font-medium text-sm hover:bg-red-100 transition-all">
                          <span className="text-xl">▶️</span>
                          YouTubeで見る
                        </a>
                      </div>
                    )}
                    {!ytId && !m.content && (
                      <p className="text-xs text-stone-400">詳細情報が登録されていません</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
