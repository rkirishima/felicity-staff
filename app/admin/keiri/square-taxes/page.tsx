'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getAdminSession } from '@/lib/session'
import { REVENUE_CATEGORY_LABEL, type RevenueCategory } from '@/lib/keiri/classifyRevenue'

type Tax = {
  id: string
  name: string
  rate: number | null
  appliesToCustomAmounts: boolean
  enabled: boolean
}

type Item = {
  id: string
  name: string
  category: string | null
  tax_ids: string[]
  revenue_category: RevenueCategory
  proposal: 'std10' | 'red8' | null
}

type Target = 'std10' | 'red8' | 'skip'

export default function SquareTaxesPage() {
  const router = useRouter()
  const [taxes, setTaxes] = useState<Tax[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [std10TaxId, setStd10TaxId] = useState('')
  const [red8TaxId, setRed8TaxId] = useState('')
  const [choices, setChoices] = useState<Record<string, Target>>({})

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/keiri/square-taxes')
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? data.error ?? '取得失敗')
      const txs: Tax[] = data.taxes
      const its: Item[] = data.items
      setTaxes(txs)
      setItems(its)
      // 正規の税を推定: 10%は「標準」を含む名前を優先、8%は「軽減」を優先
      const std =
        txs.find(t => t.rate === 10 && t.name.includes('標準')) ?? txs.find(t => t.rate === 10)
      const red =
        txs.find(t => t.rate === 8 && t.name.includes('軽減')) ?? txs.find(t => t.rate === 8)
      setStd10TaxId(prev => prev || std?.id || '')
      setRed8TaxId(prev => prev || red?.id || '')
      const init: Record<string, Target> = {}
      for (const i of its) init[i.id] = i.proposal ?? 'skip'
      setChoices(init)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const taxById = useMemo(() => new Map(taxes.map(t => [t.id, t])), [taxes])
  const itemCountByTax = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) for (const id of i.tax_ids) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [items])

  // 変更が必要な商品 = 選択ターゲットの税1つだけが付いている状態になっていないもの
  const pending = useMemo(() => {
    return items.filter(i => {
      const target = choices[i.id]
      if (!target || target === 'skip') return false
      const wantId = target === 'std10' ? std10TaxId : red8TaxId
      if (!wantId) return false
      return !(i.tax_ids.length === 1 && i.tax_ids[0] === wantId)
    })
  }, [items, choices, std10TaxId, red8TaxId])

  const doubleTaxed = useMemo(() => items.filter(i => i.tax_ids.length >= 2), [items])
  const customOnTaxes = useMemo(() => taxes.filter(t => t.appliesToCustomAmounts), [taxes])

  async function applyItems() {
    if (!std10TaxId || !red8TaxId) return toast.error('10%/8%の税を選択してください')
    if (pending.length === 0) return toast.info('変更が必要な商品はありません')
    setApplying(true)
    try {
      const res = await fetch('/api/keiri/square-taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          std10TaxId,
          red8TaxId,
          assignments: pending.map(i => ({ itemId: i.id, target: choices[i.id] })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? data.error ?? '適用失敗')
      toast.success(`適用完了: 10%標準 ${data.std10}件 / 8%軽減 ${data.red8}件`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  async function fixCustomFlags() {
    if (!std10TaxId) return toast.error('10%の税を選択してください')
    setApplying(true)
    try {
      const res = await fetch('/api/keiri/square-taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'custom_flags', onTaxId: std10TaxId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? data.error ?? '修正失敗')
      toast.success(
        data.changed.length > 0 ? `フラグ修正: ${data.changed.join(', ')}` : '既に正しい状態です',
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">Square税設定</h1>
          <div className="w-12" />
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">Squareカタログ読み込み中…</p>
        ) : error ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-2">
            <p className="text-red-600 text-sm">{error}</p>
            <button onClick={() => void load()} className="text-xs text-stone-500 underline">
              再試行
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
              <p className="text-sm font-medium text-stone-800">登録されている税</p>
              <ul className="space-y-1">
                {taxes.map(t => (
                  <li key={t.id} className="flex justify-between text-xs text-stone-600">
                    <span>
                      {t.name}({t.rate ?? '?'}%)
                      {t.appliesToCustomAmounts && (
                        <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px]">
                          任意の金額ON
                        </span>
                      )}
                    </span>
                    <span className="text-stone-400">{itemCountByTax.get(t.id) ?? 0}商品</span>
                  </li>
                ))}
              </ul>
              {(doubleTaxed.length > 0 || customOnTaxes.length !== 1) && (
                <p className="text-[11px] text-red-600">
                  {doubleTaxed.length > 0 && <>⚠ 税が2つ以上付いた商品が{doubleTaxed.length}点。</>}
                  {customOnTaxes.length > 1 && <>⚠ 「任意の金額」がONの税が{customOnTaxes.length}つ(二重課税の原因)。</>}
                  {customOnTaxes.length === 0 && <>⚠ 「任意の金額」がONの税がありません(カスタム金額が無税になります)。</>}
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
              <p className="text-sm font-medium text-stone-800">正規の税を選択</p>
              <label className="block text-[11px] text-stone-500">
                標準10%(イートイン・物販)
                <select
                  value={std10TaxId}
                  onChange={e => setStd10TaxId(e.target.value)}
                  className="mt-1 w-full bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
                >
                  {taxes.filter(t => t.rate === 10).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] text-stone-500">
                軽減8%(豆・焼き菓子等の持ち帰り食品)
                <select
                  value={red8TaxId}
                  onChange={e => setRed8TaxId(e.target.value)}
                  className="mt-1 w-full bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
                >
                  {taxes.filter(t => t.rate === 8).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => void fixCustomFlags()}
                disabled={applying}
                className="w-full py-2 text-xs rounded-xl bg-stone-100 text-stone-700 disabled:opacity-50"
              >
                「任意の金額に税金を適用」を標準10%のみONに修正
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-medium text-stone-800">商品 {items.length}点</p>
                <span className="text-[11px] text-stone-400">要変更 {pending.length}点</span>
              </div>
              <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                {items.map(i => {
                  const target = choices[i.id] ?? 'skip'
                  const wantId = target === 'std10' ? std10TaxId : target === 'red8' ? red8TaxId : null
                  const ok = wantId != null && i.tax_ids.length === 1 && i.tax_ids[0] === wantId
                  return (
                    <li key={i.id} className={`rounded-xl border p-3 space-y-1.5 ${ok ? 'border-stone-100' : 'border-amber-200 bg-amber-50/50'}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-stone-800 truncate">{i.name}</p>
                          <p className="text-[10px] text-stone-400">
                            {i.category && <>{i.category} ・ </>}
                            現在: {i.tax_ids.length === 0
                              ? '税なし'
                              : i.tax_ids.map(id => taxById.get(id)?.name ?? id).join(' + ')}
                            {' ・ '}推定: {REVENUE_CATEGORY_LABEL[i.revenue_category]}
                          </p>
                        </div>
                        {ok && <span className="text-[10px] text-emerald-600">✓</span>}
                      </div>
                      <select
                        value={target}
                        onChange={e => setChoices(c => ({ ...c, [i.id]: e.target.value as Target }))}
                        className="w-full bg-white rounded-lg px-2 py-1.5 text-xs border border-stone-200"
                      >
                        <option value="std10">🍽 標準10%にする</option>
                        <option value="red8">☕ 軽減8%にする</option>
                        <option value="skip">— 変更しない —</option>
                      </select>
                    </li>
                  )
                })}
              </ul>
              <button
                onClick={() => void applyItems()}
                disabled={applying || pending.length === 0}
                className="w-full py-3 text-sm rounded-xl bg-stone-800 text-white font-medium disabled:opacity-50"
              >
                {applying ? '適用中…' : `一括適用(${pending.length}点の税を1つに揃える)`}
              </button>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 space-y-1">
              <p className="font-medium">仕組み</p>
              <p>各商品に消費税を1つだけ割り当て、それ以外の税(重複した古い税を含む)は外します。「任意の金額」フラグは選択した標準10%のみONにし、カスタム金額の二重課税を止めます。</p>
              <p>ドリンクのテイクアウト(8%)を都度切り替える場合は、Squareダッシュボードの税金ルール(イートイン/テイクアウト)で設定してください。ここでの割り当てはベースの税率です。</p>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
