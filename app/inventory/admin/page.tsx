'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { toast } from 'sonner'
import { Settings, ChevronLeft, Plus, Pencil, Trash2, Download, Upload, X, Save } from 'lucide-react'
import {
  FREQ_LABEL,
  FREQ_CHOICES,
  CONTACT_LABEL,
  CONTACT_CHOICES,
  TRACKING_LABEL,
  type CheckFrequency,
  type ContactMethod,
  type TrackingMode,
} from '@/lib/inventory/labels'

type Item = {
  id: string
  name: string
  category: string | null
  check_frequency: CheckFrequency
  order_unit: string | null
  reorder_threshold: string | null
  supplier_id: string | null
  storage: string | null
  memo: string | null
  tracking_mode: TrackingMode
  is_active: boolean
}

type Supplier = {
  id: string
  name: string
  contact_method: ContactMethod | null
  email: string | null
  lead_time_days: number | null
  note: string | null
}

// CSV書出のカラム順
const ITEM_COLS: (keyof Item)[] = [
  'id', 'name', 'category', 'check_frequency', 'order_unit',
  'reorder_threshold', 'storage', 'memo', 'tracking_mode', 'supplier_id', 'is_active',
]

// 最小限のCSVパーサ（ダブルクォート対応）
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false
      } else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else if (ch === '\r') { /* skip */ }
      else cur += ch
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function InventoryAdminPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  const [tab, setTab] = useState<'items' | 'suppliers'>('items')
  const [items, setItems] = useState<Item[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const [editSup, setEditSup] = useState<Supplier | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const [it, sup] = await Promise.all([
      supabase.from('inv_items').select('id, name, category, check_frequency, order_unit, reorder_threshold, supplier_id, storage, memo, tracking_mode, is_active').order('id'),
      supabase.from('inv_suppliers').select('id, name, contact_method, email, lead_time_days, note').order('name'),
    ])
    setItems((it.data as Item[]) ?? [])
    setSuppliers((sup.data as Supplier[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  const supName = useMemo(() => {
    const m = new Map<string, string>()
    suppliers.forEach((s) => m.set(s.id, s.name))
    return m
  }, [suppliers])

  // 次の P-ID を採番
  function nextItemId(): string {
    let max = 0
    for (const it of items) {
      const m = /^P(\d+)$/.exec(it.id)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return 'P' + String(max + 1).padStart(3, '0')
  }

  function newItem() {
    setEditItem({
      id: nextItemId(), name: '', category: '', check_frequency: 'weekly',
      order_unit: '', reorder_threshold: '', supplier_id: null, storage: '常温',
      memo: '', tracking_mode: 'manual', is_active: true,
    })
  }

  async function saveItem() {
    if (!editItem) return
    if (!editItem.name.trim()) { toast.error('品名は必須です'); return }
    const payload = { ...editItem, supplier_id: editItem.supplier_id || null, updated_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString() }
    const { error } = await supabase.from('inv_items').upsert(payload)
    if (error) { toast.error(`保存失敗: ${error.message}`); return }
    toast.success(`${editItem.name} を保存しました`)
    setEditItem(null)
    load()
  }

  async function deleteItem(it: Item) {
    if (!confirm(`「${it.name}」を削除しますか? (チェック履歴がある場合は無効化を推奨)`)) return
    const { error } = await supabase.from('inv_items').delete().eq('id', it.id)
    if (error) {
      // FK等で消せない場合は無効化にフォールバック
      const { error: e2 } = await supabase.from('inv_items').update({ is_active: false }).eq('id', it.id)
      if (e2) { toast.error(`削除失敗: ${error.message}`); return }
      toast.success('履歴があるため無効化しました')
    } else {
      toast.success('削除しました')
    }
    load()
  }

  async function saveSup() {
    if (!editSup) return
    if (!editSup.name.trim()) { toast.error('発注先名は必須です'); return }
    const payload = { ...editSup, updated_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString() }
    const { error } = await supabase.from('inv_suppliers').upsert(payload)
    if (error) { toast.error(`保存失敗: ${error.message}`); return }
    toast.success(`${editSup.name} を保存しました`)
    setEditSup(null)
    load()
  }

  async function deleteSup(s: Supplier) {
    if (!confirm(`発注先「${s.name}」を削除しますか?`)) return
    const { error } = await supabase.from('inv_suppliers').delete().eq('id', s.id)
    if (error) { toast.error(`削除失敗: ${error.message}`); return }
    toast.success('削除しました')
    load()
  }

  // 品目CSV書出
  function exportCSV() {
    const header = ITEM_COLS.join(',')
    const lines = items.map((it) => ITEM_COLS.map((c) => csvCell(it[c])).join(','))
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inv_items_${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 品目CSV取込（id一致でupsert）
  async function importCSV(file: File) {
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length < 2) { toast.error('データ行がありません'); return }
    const header = rows[0].map((h) => h.trim())
    const idx = (k: string) => header.indexOf(k)
    if (idx('id') < 0 || idx('name') < 0) { toast.error('id と name 列が必要です'); return }
    const payload = rows.slice(1).map((r) => {
      const get = (k: string) => { const i = idx(k); return i >= 0 ? (r[i]?.trim() ?? '') : '' }
      const freq = get('check_frequency')
      return {
        id: get('id'),
        name: get('name'),
        category: get('category') || null,
        check_frequency: (FREQ_CHOICES as string[]).includes(freq) ? freq : 'weekly',
        order_unit: get('order_unit') || null,
        reorder_threshold: get('reorder_threshold') || null,
        storage: get('storage') || null,
        memo: get('memo') || null,
        tracking_mode: get('tracking_mode') === 'square_linked' ? 'square_linked' : 'manual',
        supplier_id: get('supplier_id') || null,
        is_active: get('is_active').toLowerCase() !== 'false',
      }
    }).filter((p) => p.id && p.name)
    if (payload.length === 0) { toast.error('有効な行がありません'); return }
    const { error } = await supabase.from('inv_items').upsert(payload)
    if (error) { toast.error(`取込失敗: ${error.message}`); return }
    toast.success(`${payload.length}件を取込みました`)
    load()
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-950">
        <div className="text-stone-400 text-sm">管理者ログインが必要です</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-24 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="text-stone-400 hover:text-white"><ChevronLeft size={20} /></Link>
          <Settings size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">在庫マスタ管理</h1>
        </div>
        <div className="flex gap-1 mt-3">
          {(['items', 'suppliers'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${tab === t ? 'bg-amber-600 text-white' : 'bg-stone-900 text-stone-400 border border-stone-700'}`}>
              {t === 'items' ? `品目 (${items.length})` : `発注先 (${suppliers.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : tab === 'items' ? (
          <>
            <div className="flex gap-2 mb-3">
              <button onClick={newItem} className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg">
                <Plus size={14} /> 新規品目
              </button>
              <button onClick={exportCSV} className="flex items-center gap-1 bg-stone-800 hover:bg-stone-700 text-white text-xs px-3 py-2 rounded-lg border border-stone-700">
                <Download size={14} /> CSV書出
              </button>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 bg-stone-800 hover:bg-stone-700 text-white text-xs px-3 py-2 rounded-lg border border-stone-700">
                <Upload size={14} /> CSV取込
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = '' }} />
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
              {items.map((it, i) => (
                <div key={it.id} className={`px-3 py-2.5 flex items-center gap-3 ${i > 0 ? 'border-t border-stone-700/60' : ''} ${!it.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-stone-500 font-mono">{it.id}</span>
                      <span className="text-sm text-white truncate">{it.name}</span>
                      {!it.is_active && <span className="text-[9px] text-stone-500">(無効)</span>}
                    </div>
                    <div className="text-[10px] text-stone-500">
                      {it.category ?? '—'} · {FREQ_LABEL[it.check_frequency]}
                      {it.order_unit ? ` · ${it.order_unit}` : ''}
                      {it.supplier_id ? ` · ${supName.get(it.supplier_id) ?? '?'}` : ' · 発注先未設定'}
                    </div>
                  </div>
                  <button onClick={() => setEditItem({ ...it })} className="text-stone-400 hover:text-amber-400 p-1"><Pencil size={15} /></button>
                  <button onClick={() => deleteItem(it)} className="text-stone-400 hover:text-rose-400 p-1"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => setEditSup({ id: '', name: '', contact_method: 'email', email: '', lead_time_days: 1, note: '' })}
              className="flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg mb-3">
              <Plus size={14} /> 新規発注先
            </button>
            {suppliers.length === 0 ? (
              <p className="text-stone-500 text-sm py-6 text-center">発注先が未登録です</p>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                {suppliers.map((s, i) => (
                  <div key={s.id} className={`px-3 py-2.5 flex items-center gap-3 ${i > 0 ? 'border-t border-stone-700/60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white">{s.name}</span>
                      <div className="text-[10px] text-stone-500">
                        {s.contact_method ? CONTACT_LABEL[s.contact_method] : '—'}
                        {s.email ? ` · ${s.email}` : ''}
                        {typeof s.lead_time_days === 'number' ? ` · リードタイム${s.lead_time_days}日` : ''}
                      </div>
                    </div>
                    <button onClick={() => setEditSup({ ...s })} className="text-stone-400 hover:text-amber-400 p-1"><Pencil size={15} /></button>
                    <button onClick={() => deleteSup(s)} className="text-stone-400 hover:text-rose-400 p-1"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 品目編集モーダル */}
      {editItem && (
        <EditModal title={`品目 ${editItem.id}`} onClose={() => setEditItem(null)} onSave={saveItem}>
          <Field label="品名">
            <input value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="カテゴリ">
            <input value={editItem.category ?? ''} onChange={(e) => setEditItem({ ...editItem, category: e.target.value })} className={inputCls} list="cat-list" />
          </Field>
          <Field label="チェック頻度">
            <div className="flex gap-1.5">
              {FREQ_CHOICES.map((f) => (
                <button key={f} onClick={() => setEditItem({ ...editItem, check_frequency: f })}
                  className={`flex-1 py-2 rounded-lg text-xs ${editItem.check_frequency === f ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 border border-stone-700'}`}>
                  {FREQ_LABEL[f]}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="発注単位"><input value={editItem.order_unit ?? ''} onChange={(e) => setEditItem({ ...editItem, order_unit: e.target.value })} className={inputCls} placeholder="1袋" /></Field>
            <Field label="保管"><input value={editItem.storage ?? ''} onChange={(e) => setEditItem({ ...editItem, storage: e.target.value })} className={inputCls} placeholder="常温/冷蔵/冷凍" /></Field>
          </div>
          <Field label="発注先">
            <select value={editItem.supplier_id ?? ''} onChange={(e) => setEditItem({ ...editItem, supplier_id: e.target.value || null })} className={inputCls}>
              <option value="">未設定</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="発注ライン目安 (メモ)"><input value={editItem.reorder_threshold ?? ''} onChange={(e) => setEditItem({ ...editItem, reorder_threshold: e.target.value })} className={inputCls} placeholder="残り2本で発注 等" /></Field>
          <Field label="メモ"><input value={editItem.memo ?? ''} onChange={(e) => setEditItem({ ...editItem, memo: e.target.value })} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="追跡モード">
              <select value={editItem.tracking_mode} onChange={(e) => setEditItem({ ...editItem, tracking_mode: e.target.value as TrackingMode })} className={inputCls}>
                {(Object.keys(TRACKING_LABEL) as TrackingMode[]).map((m) => <option key={m} value={m}>{TRACKING_LABEL[m]}</option>)}
              </select>
            </Field>
            <Field label="有効">
              <button onClick={() => setEditItem({ ...editItem, is_active: !editItem.is_active })}
                className={`w-full py-2 rounded-lg text-xs ${editItem.is_active ? 'bg-emerald-700 text-white' : 'bg-stone-800 text-stone-400 border border-stone-700'}`}>
                {editItem.is_active ? '有効' : '無効'}
              </button>
            </Field>
          </div>
          <datalist id="cat-list">
            {Array.from(new Set(items.map((i) => i.category).filter(Boolean))).map((c) => <option key={c} value={c as string} />)}
          </datalist>
        </EditModal>
      )}

      {/* 発注先編集モーダル */}
      {editSup && (
        <EditModal title={editSup.id ? '発注先編集' : '新規発注先'} onClose={() => setEditSup(null)} onSave={saveSup}>
          <Field label="発注先名"><input value={editSup.name} onChange={(e) => setEditSup({ ...editSup, name: e.target.value })} className={inputCls} /></Field>
          <Field label="連絡手段">
            <div className="flex gap-1.5">
              {CONTACT_CHOICES.map((c) => (
                <button key={c} onClick={() => setEditSup({ ...editSup, contact_method: c })}
                  className={`flex-1 py-2 rounded-lg text-xs ${editSup.contact_method === c ? 'bg-amber-600 text-white' : 'bg-stone-800 text-stone-400 border border-stone-700'}`}>
                  {CONTACT_LABEL[c]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="メール/連絡先"><input value={editSup.email ?? ''} onChange={(e) => setEditSup({ ...editSup, email: e.target.value })} className={inputCls} /></Field>
          <Field label="リードタイム(日)">
            <input type="number" inputMode="numeric" value={editSup.lead_time_days ?? ''} onChange={(e) => setEditSup({ ...editSup, lead_time_days: e.target.value === '' ? null : parseInt(e.target.value, 10) })} className={inputCls} />
          </Field>
          <Field label="メモ"><input value={editSup.note ?? ''} onChange={(e) => setEditSup({ ...editSup, note: e.target.value })} className={inputCls} /></Field>
        </EditModal>
      )}
    </main>
  )
}

const inputCls = 'w-full bg-stone-900 text-white text-sm rounded-lg px-3 py-2 border border-stone-700 focus:border-amber-500 focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-stone-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function EditModal({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 space-y-3"
        style={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 pb-1">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-white"><X size={20} /></button>
        </div>
        {children}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm text-stone-300 bg-stone-800 border border-stone-700">キャンセル</button>
          <button onClick={onSave} className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 flex items-center justify-center gap-1.5">
            <Save size={15} /> 保存
          </button>
        </div>
      </div>
    </div>
  )
}
