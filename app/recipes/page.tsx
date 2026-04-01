'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Manual = { id: string; category: string; title: string; content: string }

const CATEGORIES = [
  { key: 'drink_recipe', label: 'ドリンク', icon: '☕' },
  { key: 'food_recipe', label: 'フード', icon: '🍳' },
  { key: 'opening_ops', label: 'オープン', icon: '🌅' },
  { key: 'closing_ops', label: 'クローズ', icon: '🌙' },
]

export default function RecipesPage() {
  const [category, setCategory] = useState('drink_recipe')
  const [manuals, setManuals] = useState<Manual[]>([])
  const [selected, setSelected] = useState<Manual | null>(null)
  const [loading, setLoading] = useState(false)

  function getSupabase() {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }

  useEffect(() => {
    setLoading(true)
    const sb = getSupabase()
    sb.from('manuals').select('*').eq('category', category).eq('active', true).order('sort_order')
      .then(({ data }) => { setManuals(data ?? []); setLoading(false); setSelected(null) })
  }, [category])

  if (selected) return (
    <main className="min-h-screen bg-zinc-950 p-4 max-w-lg mx-auto">
      <button onClick={() => setSelected(null)} className="text-zinc-500 text-sm mb-4 hover:text-zinc-300">← 戻る</button>
      <h2 className="text-xl font-bold text-teal-400 mb-4">{selected.title}</h2>
      <div className="bg-zinc-900 rounded-2xl p-4 text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
        {selected.content}
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-zinc-950 p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold tracking-widest text-teal-400 mb-4">マニュアル・レシピ</h1>

      <div className="grid grid-cols-4 gap-2 mb-6">
        {CATEGORIES.map(c => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className={`flex flex-col items-center py-3 rounded-xl text-xs transition-all ${category === c.key ? 'bg-teal-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
            <span className="text-xl mb-1">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-zinc-600 text-center">読み込み中...</p>
      ) : manuals.length === 0 ? (
        <div className="text-center text-zinc-600 py-12">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-sm">まだコンテンツがありません</p>
          <p className="text-xs mt-1">管理画面から追加できます</p>
        </div>
      ) : (
        <div className="space-y-2">
          {manuals.map(m => (
            <button key={m.id} onClick={() => setSelected(m)}
              className="w-full flex items-center justify-between bg-zinc-800 hover:bg-zinc-700 rounded-xl px-4 py-3 text-left transition-all">
              <span className="text-sm text-zinc-200">{m.title}</span>
              <span className="text-zinc-600">→</span>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
