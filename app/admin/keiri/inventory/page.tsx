'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { getAdminSession } from '@/lib/session'
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  copyFromPreviousMonth,
  type Category,
  type InventoryInput,
} from './actions'
import { LoadError } from '@/components/keiri/LoadError'

type Row = {
  id: string
  snapshot_date: string
  item_name: string
  category: Category
  unit_price: number
  quantity: number
  unit: string | null
  note: string | null
}

const CATEGORY_LABEL: Record<Category, string> = {
  ingredients: '🥗 食材',
  goods: '👕 グッズ',
  supplies: '📦 資材',
}

function thisMonthEndJST(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  // last day of current month
  const last = new Date(Date.UTC(y, m + 1, 0))
  return last.toISOString().slice(0, 10)
}

function monthEndOptions(count = 24): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0))
    const value = d.toISOString().slice(0, 10)
    const label = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月末（${value}）`
    list.push({ value, label })
  }
  return list
}

function prevMonthEnd(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(s => parseInt(s, 10))
  const prev = new Date(Date.UTC(y, m - 1, 0)) // last day of previous month
  return prev.toISOString().slice(0, 10)
}

export default function InventoryPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const dateOptions = useMemo(() => monthEndOptions(24), [])
  const [snapshotDate, setSnapshotDate] = useState(thisMonthEndJST())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  // Add-form state
  const [newCategory, setNewCategory] = useState<Category>('ingredients')
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newQty, setNewQty] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [newNote, setNewNote] = useState('')
  const [adding, setAdding] = useState(false)

  // Editing inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<InventoryInput>>({})

  useEffect(() => {
    if (!getAdminSession()) router.replace('/admin')
  }, [router])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadErr(null)
      const { data, error } = await supabase
        .from('keiri_inventory_snapshots')
        .select('id, snapshot_date, item_name, category, unit_price, quantity, unit, note')
        .eq('snapshot_date', snapshotDate)
        .order('category')
        .order('item_name')
      if (cancelled) return
      setLoadErr(error ? error.message : null)
      setRows((data ?? []) as Row[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, snapshotDate, reload])

  const grouped = useMemo(() => {
    const out: Record<Category, Row[]> = { ingredients: [], goods: [], supplies: [] }
    for (const r of rows) out[r.category].push(r)
    return out
  }, [rows])

  const totals = useMemo(() => {
    const t: Record<Category, number> = { ingredients: 0, goods: 0, supplies: 0 }
    for (const r of rows) {
      t[r.category] += Math.round(r.unit_price * r.quantity)
    }
    const grand = t.ingredients + t.goods + t.supplies
    return { ...t, grand }
  }, [rows])

  async function handleAdd() {
    if (!newName.trim()) { toast.error('品名必須'); return }
    const price = parseInt(newPrice, 10) || 0
    const qty = parseFloat(newQty) || 0
    setAdding(true)
    try {
      const session = getAdminSession()
      await createInventoryItem(
        {
          snapshot_date: snapshotDate,
          item_name: newName.trim(),
          category: newCategory,
          unit_price: price,
          quantity: qty,
          unit: newUnit.trim() || null,
          note: newNote.trim() || null,
        },
        session?.staffName ?? null,
      )
      toast.success('追加しました')
      setNewName(''); setNewPrice(''); setNewQty(''); setNewUnit(''); setNewNote('')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(r: Row) {
    setEditingId(r.id)
    setEditForm({
      snapshot_date: r.snapshot_date,
      item_name: r.item_name,
      category: r.category,
      unit_price: r.unit_price,
      quantity: r.quantity,
      unit: r.unit,
      note: r.note,
    })
  }

  async function saveEdit(id: string) {
    if (!editForm.item_name || !editForm.category) { toast.error('項目不足'); return }
    try {
      await updateInventoryItem(id, {
        snapshot_date: editForm.snapshot_date as string,
        item_name: editForm.item_name as string,
        category: editForm.category as Category,
        unit_price: (editForm.unit_price as number) ?? 0,
        quantity: (editForm.quantity as number) ?? 0,
        unit: (editForm.unit as string | null) ?? null,
        note: (editForm.note as string | null) ?? null,
      })
      toast.success('更新しました')
      setEditingId(null)
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失敗')
    }
  }

  async function handleDelete(r: Row) {
    if (!confirm(`「${r.item_name}」を削除しますか？`)) return
    try {
      await deleteInventoryItem(r.id)
      toast.success('削除しました')
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '削除失敗')
    }
  }

  async function handleCopyPrev() {
    const prev = prevMonthEnd(snapshotDate)
    if (!confirm(`前月（${prev}）の在庫を当月（${snapshotDate}）にコピーしますか？\n既にある品目はスキップ・数量や単価は後で修正してください。`)) return
    try {
      const session = getAdminSession()
      const res = await copyFromPreviousMonth(snapshotDate, prev, session?.staffName ?? null)
      toast.success(`${res.inserted}件コピー${res.skipped > 0 ? `／${res.skipped}件は既存スキップ` : ''}`)
      setReload(n => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'コピー失敗')
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-8" style={{ backgroundColor: '#F5F0E8' }}>
      <div className="max-w-lg mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/admin/keiri')} className="text-stone-500 text-sm">
            ← 戻る
          </button>
          <h1 className="text-lg font-semibold tracking-wider text-stone-800">月末在庫</h1>
          <div className="w-12" />
        </div>

        <LoadError message={loadErr} />

        <select
          value={snapshotDate}
          onChange={e => setSnapshotDate(e.target.value)}
          className="w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone-200"
        >
          {dateOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="grid grid-cols-3 gap-2">
          {(['ingredients', 'goods', 'supplies'] as Category[]).map(c => (
            <div key={c} className="bg-white rounded-2xl shadow-sm p-3 text-center">
              <p className="text-[10px] text-stone-500">{CATEGORY_LABEL[c]}</p>
              <p className="text-sm font-medium text-stone-900 tabular-nums mt-1">
                ¥{totals[c].toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-stone-800 rounded-2xl shadow-sm p-4 flex justify-between items-baseline">
          <span className="text-xs text-stone-400 tracking-wider">月末在庫合計</span>
          <span className="text-2xl font-light text-white tabular-nums">
            ¥{totals.grand.toLocaleString()}
          </span>
        </div>

        <button
          onClick={handleCopyPrev}
          className="w-full bg-white border border-stone-200 text-stone-700 py-2 rounded-xl text-sm"
        >
          📋 前月分の在庫を当月にコピー
        </button>

        {/* Add new item */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
          <p className="text-xs text-stone-500 tracking-wider mb-2">+ 新規追加</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {(['ingredients', 'goods', 'supplies'] as Category[]).map(c => (
              <button
                key={c}
                onClick={() => setNewCategory(c)}
                className={`py-1.5 rounded-lg ${
                  newCategory === c ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="品名（例：エチオピア生豆）"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder="仕入単価"
              value={newPrice}
              onChange={e => setNewPrice(e.target.value)}
              className="bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
            <input
              type="number"
              inputMode="decimal"
              placeholder="残数"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
              className="bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
            <input
              type="text"
              placeholder="単位 kg/個"
              value={newUnit}
              onChange={e => setNewUnit(e.target.value)}
              className="bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
            />
          </div>
          <input
            type="text"
            placeholder="メモ（任意）"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            className="w-full bg-stone-50 rounded-xl px-3 py-2 text-sm border border-stone-200"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="w-full bg-stone-800 text-white py-2 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {adding ? '追加中…' : '追加'}
          </button>
        </div>

        {loading ? (
          <p className="text-center text-stone-400 text-sm py-12">読み込み中…</p>
        ) : (
          (['ingredients', 'goods', 'supplies'] as Category[]).map(c => {
            const list = grouped[c]
            if (list.length === 0) return null
            return (
              <div key={c} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="flex justify-between items-baseline px-4 py-2.5 bg-stone-50 border-b border-stone-100">
                  <p className="text-sm font-medium text-stone-700">{CATEGORY_LABEL[c]}</p>
                  <span className="text-xs text-stone-500 tabular-nums">¥{totals[c].toLocaleString()}</span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {list.map(r => {
                    const isEdit = editingId === r.id
                    const lineTotal = Math.round(r.unit_price * r.quantity)
                    return (
                      <li key={r.id} className="px-4 py-2.5">
                        {isEdit ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={(editForm.item_name as string) ?? ''}
                              onChange={e => setEditForm(f => ({ ...f, item_name: e.target.value }))}
                              className="w-full bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                            />
                            <div className="grid grid-cols-3 gap-1.5">
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder="単価"
                                value={(editForm.unit_price as number | undefined) ?? ''}
                                onChange={e => setEditForm(f => ({ ...f, unit_price: parseInt(e.target.value, 10) || 0 }))}
                                className="bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                              />
                              <input
                                type="number"
                                inputMode="decimal"
                                placeholder="残数"
                                value={(editForm.quantity as number | undefined) ?? ''}
                                onChange={e => setEditForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                                className="bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                              />
                              <input
                                type="text"
                                placeholder="単位"
                                value={(editForm.unit as string | null) ?? ''}
                                onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                                className="bg-stone-50 rounded-lg px-2 py-1.5 text-sm border border-stone-200"
                              />
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => saveEdit(r.id)}
                                className="flex-1 bg-stone-800 text-white py-1.5 rounded-lg text-xs"
                              >
                                保存
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-xs"
                              >
                                キャンセル
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center text-sm gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-stone-800 truncate">{r.item_name}</p>
                              <p className="text-[10px] text-stone-400 mt-0.5">
                                ¥{r.unit_price.toLocaleString()} × {r.quantity}
                                {r.unit && ` ${r.unit}`}
                                {r.note && ` ・${r.note}`}
                              </p>
                            </div>
                            <span className="tabular-nums text-stone-900 font-medium whitespace-nowrap">
                              ¥{lineTotal.toLocaleString()}
                            </span>
                            <div className="flex gap-1">
                              <button onClick={() => startEdit(r)} className="text-xs text-stone-500 px-1.5">✎</button>
                              <button onClick={() => handleDelete(r)} className="text-xs text-rose-500 px-1.5">🗑</button>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })
        )}

        {!loading && rows.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <p className="text-stone-500 text-sm">この月末の在庫はまだ登録されていません</p>
            <p className="text-stone-400 text-xs mt-1">「前月分をコピー」または上の「新規追加」フォームから入力</p>
          </div>
        )}
      </div>
    </main>
  )
}
