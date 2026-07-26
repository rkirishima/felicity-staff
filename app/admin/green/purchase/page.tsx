'use client'
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { useIsStaff } from '@/lib/use-is-staff'
import { toast } from 'sonner'
import { ChevronLeft, TruckIcon, Trash2 } from 'lucide-react'
import { todayJST, fmtDateJST } from '@/lib/green-stock'

type BeanRow = { id: string; display_name: string }
type Supplier = { id: string; name: string }
type Purchase = {
  id: string
  purchased_at: string
  bean_id: string
  supplier_id: string | null
  product_label: string | null
  green_kg: number
  unit_yen_per_kg: number | null
  invoice_no: string | null
}

export default function GreenPurchasePage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const isStaff = useIsStaff()

  const [beans, setBeans] = useState<BeanRow[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [recent, setRecent] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [beanId, setBeanId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [purchasedAt, setPurchasedAt] = useState(todayJST())
  const [greenKg, setGreenKg] = useState('')
  const [unitYen, setUnitYen] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [productLabel, setProductLabel] = useState('')

  const hasAccess = isAdmin || isStaff

  const load = useCallback(async () => {
    const [{ data: b }, { data: s }, { data: p }] = await Promise.all([
      supabase.from('roast_beans').select('id, display_name').eq('active', true).order('display_name'),
      supabase.from('roast_suppliers').select('id, name').eq('active', true).order('name'),
      supabase
        .from('roast_purchases')
        .select('id, purchased_at, bean_id, supplier_id, product_label, green_kg, unit_yen_per_kg, invoice_no')
        .order('purchased_at', { ascending: false })
        .limit(15),
    ])
    setBeans((b as BeanRow[]) ?? [])
    setSuppliers((s as Supplier[]) ?? [])
    setRecent((p as Purchase[]) ?? [])
    setLoading(false)
  }, [supabase])

  // load() は async で、setState は必ず await 後(マイクロタスク)に走る。
  // このルールが警告する「effect 本体での同期 setState」には当たらないので抑制する。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (hasAccess) load() }, [hasAccess, load])

  // 豆を選んだら商品名の初期値を入れておく(請求書の表記に上書きしてよい)
  function pickBean(id: string) {
    setBeanId(id)
    if (!productLabel) setProductLabel(beans.find((b) => b.id === id)?.display_name ?? '')
  }

  async function submit() {
    if (!beanId) return toast.error('豆を選択してください')
    const kg = Number(greenKg)
    if (!greenKg || kg <= 0) return toast.error('生豆kgを入力してください')

    // 金額は integer(円) のみ。AGENTS.md の経理ルールに合わせて parseInt。
    const unit = unitYen ? parseInt(unitYen, 10) : null
    if (unitYen && (Number.isNaN(unit!) || unit! < 0)) return toast.error('単価が不正です')

    setSubmitting(true)
    const { error } = await supabase.from('roast_purchases').insert({
      purchased_at: purchasedAt,
      bean_id: beanId,
      supplier_id: supplierId || null,
      product_label: productLabel.trim() || null,
      green_kg: kg,
      unit_yen_per_kg: unit,
      total_yen_excl_tax: unit !== null ? Math.round(kg * unit) : null,
      invoice_no: invoiceNo.trim() || null,
    })
    setSubmitting(false)
    if (error) return toast.error(`記録失敗: ${error.message}`)

    toast.success(`${kg}kg を入荷記録しました`)
    setGreenKg(''); setUnitYen(''); setInvoiceNo(''); setProductLabel('')
    load()
  }

  async function remove(id: string) {
    if (!confirm('この仕入記録を削除しますか? 在庫からも取り消されます。')) return
    const { error } = await supabase.from('roast_purchases').delete().eq('id', id)
    if (error) return toast.error(`削除失敗: ${error.message}`)
    toast.success('削除しました')
    load()
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F0E8' }}>
        <div className="text-stone-600 text-sm">管理者またはスタッフでログインしてください</div>
      </main>
    )
  }

  const inputCls = 'w-full bg-stone-900 text-white rounded-lg px-3 py-3 text-sm border border-stone-700 focus:border-amber-500 focus:outline-none'

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-4" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <Link href="/admin/green" className="text-stone-500 text-xs flex items-center gap-1 mb-2">
          <ChevronLeft size={14} /> 生豆在庫
        </Link>
        <div className="flex items-center gap-2">
          <TruckIcon size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">生豆 仕入入力</h1>
        </div>
        <p className="text-xs text-stone-400 mt-1">入力すると在庫に自動で加算されます</p>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
          <div>
            <label className="block text-xs text-stone-400 mb-1">豆</label>
            <select value={beanId} onChange={(e) => pickBean(e.target.value)} className={inputCls}>
              <option value="">選択してください</option>
              {beans.map((b) => <option key={b.id} value={b.id}>{b.display_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">仕入先</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls}>
              <option value="">未選択</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">入荷日</label>
              <input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">生豆 (kg)</label>
              <input
                type="number" inputMode="decimal" step="0.1" min="0"
                value={greenKg} onChange={(e) => setGreenKg(e.target.value)}
                placeholder="30.0" className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-400 mb-1">単価 (円/kg、任意)</label>
              <input
                type="number" inputMode="numeric" step="1" min="0"
                value={unitYen} onChange={(e) => setUnitYen(e.target.value)}
                placeholder="2200" className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-stone-400 mb-1">請求書No (任意)</label>
              <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="1026130" className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">商品名 (請求書の表記)</label>
            <input value={productLabel} onChange={(e) => setProductLabel(e.target.value)} className={inputCls} />
          </div>

          {greenKg && unitYen && (
            <p className="text-xs text-stone-400">
              小計（税抜）: ¥{Math.round(Number(greenKg) * parseInt(unitYen, 10) || 0).toLocaleString()}
            </p>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full bg-amber-600 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? '記録中...' : '入荷を記録'}
          </button>
        </div>

        <div>
          <h2 className="text-xs text-stone-500 tracking-wider mb-2 px-1">最近の仕入</h2>
          {loading ? (
            <p className="text-stone-500 text-sm text-center py-6">読み込み中...</p>
          ) : recent.length === 0 ? (
            <p className="text-stone-600 text-sm text-center py-6">まだ記録がありません</p>
          ) : (
            <div className="space-y-2">
              {recent.map((p) => (
                <div key={p.id} className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                  <div className="min-w-0">
                    <p className="text-sm text-stone-200 truncate">{p.product_label || p.bean_id}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {fmtDateJST(p.purchased_at)} ・ {Number(p.green_kg).toFixed(1)}kg
                      {p.unit_yen_per_kg ? ` ・ ¥${p.unit_yen_per_kg.toLocaleString()}/kg` : ''}
                    </p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => remove(p.id)} className="text-stone-600 hover:text-red-400 shrink-0">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
