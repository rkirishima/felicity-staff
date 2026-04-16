'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, getAdminSession } from '@/lib/session'

type Variation = {
  variationId: string
  sku: string
  upc: string
  size: string
  price: number
  type: 'bean' | 'ground'
}

type LabelItem = {
  itemId: string
  name: string
  rawName: string
  category: 'drip' | 'retail' | 'wholesale'
  variations: Variation[]
}

type SelectedKey = `${string}__${string}`  // `${itemId}__${variationId}`

// Size helpers
const sizeToGrams = (size: string): number => {
  const m = size.match(/(\d+(?:\.\d+)?)\s*(kg|g)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  return m[2].toLowerCase() === 'kg' ? n * 1000 : n
}

const SIZE_GROUPS = [
  { label: 'ドリップパック 10g', min: 0, max: 10 },
  { label: '100g', min: 50, max: 150 },
  { label: '200g', min: 150, max: 300 },
  { label: '500g', min: 300, max: 700 },
  { label: '業販 1kg', min: 700, max: 10000 },
] as const

export default function LabelPrintPage() {
  const [items, setItems] = useState<LabelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedKey | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [printing, setPrinting] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (!getSession() && !getAdminSession()) router.replace('/')
  }, [router])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/catalog/label-items')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { if (!cancelled) setItems(data.items ?? []) })
      .catch(e => { if (!cancelled) setLoadError(`カタログ読込失敗 (${e})`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Build { sizeLabel → [(item, variation)] } grouped for UI
  const grouped = useMemo(() => {
    const groups: Record<string, Array<{ item: LabelItem; variation: Variation }>> = {}
    for (const g of SIZE_GROUPS) groups[g.label] = []

    for (const item of items) {
      for (const v of item.variations) {
        const grams = sizeToGrams(v.size)
        const group = SIZE_GROUPS.find(g => grams > g.min && grams <= g.max)
        if (group) groups[group.label].push({ item, variation: v })
      }
    }

    // Sort each group: beans before ground, then by name
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        if (a.variation.type !== b.variation.type) return a.variation.type === 'bean' ? -1 : 1
        return a.item.name.localeCompare(b.item.name)
      })
    }
    return groups
  }, [items])

  const changeQuantity = (delta: number) => {
    setQuantity(Math.max(1, Math.min(99, quantity + delta)))
  }

  const showMessage = (msg: string, duration = 2500) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), duration)
  }

  const getSelectedEntry = () => {
    if (!selected) return null
    const [itemId, variationId] = selected.split('__')
    const item = items.find(i => i.itemId === itemId)
    const variation = item?.variations.find(v => v.variationId === variationId)
    if (!item || !variation) return null
    return { item, variation }
  }

  const printLabel = async () => {
    const entry = getSelectedEntry()
    if (!entry) return
    const { item, variation } = entry

    const grams = sizeToGrams(variation.size)
    const category: 'drip' | 'retail' | 'wholesale' =
      grams <= 10 ? 'drip' :
      grams >= 1000 ? 'wholesale' :
      'retail'

    setPrinting(true)
    try {
      const response = await fetch('/api/label-print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: item.name,
          size: variation.size,
          type: variation.type,
          gtin: variation.upc,
          quantity,
          category,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        showMessage(`✓ ${quantity}枚 印刷しました`)
        setSelected(null)
        setQuantity(1)
      } else {
        showMessage(`✗ エラー: ${result.error || '印刷失敗'}`, 3500)
      }
    } catch {
      showMessage('✗ サーバー接続エラー', 3500)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-900 pb-40">
      {/* Header */}
      <div className="bg-stone-950 border-b border-stone-800 p-4">
        <h1 className="text-xl font-semibold text-white">ラベル印刷</h1>
        <p className="text-xs text-stone-500 mt-0.5">Square catalogから自動同期</p>
      </div>

      {/* Quantity Selector */}
      <div className="bg-stone-800 border-b border-stone-700 p-4 flex items-center justify-between">
        <label className="text-sm text-stone-400">印刷枚数</label>
        <div className="flex items-center gap-4">
          <button
            onClick={() => changeQuantity(-1)}
            className="bg-stone-700 text-white w-9 h-9 rounded-lg flex items-center justify-center text-xl active:bg-stone-600"
          >
            −
          </button>
          <div className="text-2xl font-semibold text-white min-w-10 text-center">
            {quantity}
          </div>
          <button
            onClick={() => changeQuantity(1)}
            className="bg-stone-700 text-white w-9 h-9 rounded-lg flex items-center justify-center text-xl active:bg-stone-600"
          >
            +
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {loading && (
          <p className="text-center text-stone-500 text-sm py-12">カタログ読込中...</p>
        )}
        {loadError && (
          <p className="text-center text-red-400 text-sm py-12">{loadError}</p>
        )}

        {!loading && !loadError && SIZE_GROUPS.map(g => {
          const entries = grouped[g.label] ?? []
          if (entries.length === 0) return null
          return (
            <div key={g.label} className="mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-3">
                {g.label}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {entries.map(({ item, variation }) => {
                  const key: SelectedKey = `${item.itemId}__${variation.variationId}`
                  const isSelected = selected === key
                  const badgeColor = variation.type === 'bean' ? 'bg-orange-500' : 'bg-blue-500'
                  const badgeLabel = variation.type === 'bean' ? '豆' : '粉'

                  return (
                    <button
                      key={key}
                      onClick={() => setSelected(key)}
                      className={`
                        bg-stone-800 rounded-xl p-3 min-h-16 flex flex-col justify-center relative
                        border-2 transition-all active:scale-97
                        ${isSelected
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-transparent active:bg-stone-700'
                        }
                      `}
                    >
                      <span className={`absolute top-2 right-2 text-white text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}>
                        {badgeLabel}
                      </span>
                      <div className="text-white font-semibold text-sm mb-0.5 leading-tight pr-8">
                        {item.name}
                      </div>
                      <div className="text-stone-400 text-xs">
                        {variation.size}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {!loading && !loadError && items.length === 0 && (
          <p className="text-center text-stone-500 text-sm py-12">
            印刷可能な商品がありません。<br/>
            Square catalogで「print_label = yes」属性を設定してください。
          </p>
        )}
      </div>

      {/* Print Button */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-gradient-to-t from-stone-900 via-stone-900 to-transparent">
        <button
          onClick={printLabel}
          disabled={!selected || printing}
          className={`
            w-full rounded-2xl py-4 text-lg font-semibold transition-all
            ${selected && !printing
              ? 'bg-blue-500 text-white active:scale-98 shadow-lg shadow-blue-500/30'
              : 'bg-stone-700 text-stone-500'
            }
          `}
        >
          {printing ? (
            <span className="flex items-center justify-center gap-2">
              印刷中...
              <div className="w-4 h-4 border-2 border-stone-500 border-t-white rounded-full animate-spin" />
            </span>
          ) : selected ? (
            `${quantity}枚 印刷する`
          ) : (
            '商品を選択してください'
          )}
        </button>
      </div>

      {/* Status Message */}
      {message && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/90 text-white px-8 py-6 rounded-2xl text-base z-50">
          {message}
        </div>
      )}
    </div>
  )
}
