'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/lib/admin-context'
import { getSession, getAdminSession } from '@/lib/session'
import { toast } from 'sonner'
import { ClipboardCheck, ChevronLeft, Send } from 'lucide-react'
import {
  STATUS_CHOICES,
  STATUS_LABEL,
  STATUS_STYLE,
  FREQ_LABEL,
  asStatus,
  type StockStatus,
  type CheckFrequency,
} from '@/lib/inventory/labels'

// inv_due_checks ビュー: 頻度から「今日チェックすべき」品目
type DueItem = {
  item_id: string
  name: string
  category: string | null
  check_frequency: CheckFrequency
  memo: string | null
  last_status: string | null
  last_checked_at: string | null
}

// 現在のPINユーザー名（スタッフ優先、無ければ管理者）
function currentUserName(): string {
  return getSession()?.staffName || getAdminSession()?.staffName || '不明'
}

export default function InventoryCheckPage() {
  const supabase = createClient()
  const isAdmin = useIsAdmin()
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => { setIsStaff(!!getSession()) }, [])
  const hasAccess = isAdmin || isStaff

  const [items, setItems] = useState<DueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<Record<string, StockStatus>>({}) // item_id → 選択状態
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inv_due_checks')
      .select('item_id, name, category, check_frequency, memo, last_status, last_checked_at')
      .order('category', { nullsFirst: false })
      .order('name')
    if (error) toast.error(`読み込み失敗: ${error.message}`)
    setItems((data as DueItem[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { if (hasAccess) load() }, [hasAccess])

  // カテゴリ別にグルーピング
  const grouped = useMemo(() => {
    const map = new Map<string, DueItem[]>()
    for (const it of items) {
      const key = it.category || 'その他'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(it)
    }
    return Array.from(map.entries())
  }, [items])

  const pickedCount = Object.keys(picked).length

  async function submit() {
    const entries = Object.entries(picked)
    if (entries.length === 0) {
      toast.error('チェックした品目がありません')
      return
    }
    setSaving(true)
    const by = currentUserName()
    const rows = entries.map(([item_id, status]) => ({ item_id, status, checked_by: by }))
    const { error } = await supabase.from('inv_stock_checks').insert(rows)
    setSaving(false)
    if (error) {
      toast.error(`保存失敗: ${error.message}`)
      return
    }
    toast.success(`${entries.length}件の状態を記録しました`)
    setPicked({})
    load()
  }

  if (!hasAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-950">
        <div className="text-stone-400 text-sm">ログインが必要です</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen pb-32 dark-forms" style={{ backgroundColor: '#1c1917' }}>
      {/* ヘッダー */}
      <div className="sticky top-0 z-10 px-4 pt-12 pb-3" style={{ backgroundColor: '#1c1917', borderBottom: '1px solid #292524' }}>
        <div className="flex items-center gap-2">
          <Link href="/inventory" className="text-stone-400 hover:text-white"><ChevronLeft size={20} /></Link>
          <ClipboardCheck size={18} className="text-amber-400" />
          <h1 className="text-lg font-bold text-white tracking-wider">状態チェック</h1>
          <span className="ml-auto text-[10px] text-stone-500">
            {pickedCount > 0 ? `${pickedCount}件選択中` : `要確認 ${items.length}件`}
          </span>
        </div>
        <p className="text-[10px] text-stone-500 mt-2">頻度から今日チェックすべき品目です。各品目を4択でタップ→まとめて送信。</p>
      </div>

      <div className="px-4 pt-4">
        {loading ? (
          <p className="text-stone-500 text-sm">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="text-stone-500 text-sm py-10 text-center">今日チェックすべき品目はありません 🎉</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <div className="text-[11px] font-semibold text-amber-400/80 mb-1.5 px-1 tracking-wide">{category}</div>
                <div className="space-y-2">
                  {list.map((it) => (
                    <div key={it.item_id} className="rounded-2xl px-3 py-2.5" style={{ backgroundColor: '#292524', border: '1px solid #44403c' }}>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-sm text-white font-medium">{it.name}</span>
                        <span className="text-[10px] text-stone-500">{FREQ_LABEL[it.check_frequency]}</span>
                        {it.last_status && (
                          <span className="text-[10px] text-stone-500">
                            前回: {STATUS_LABEL[asStatus(it.last_status)]}
                            {it.last_checked_at ? ` (${it.last_checked_at.slice(5)})` : ''}
                          </span>
                        )}
                        {it.memo && <span className="text-[10px] text-amber-300/70 ml-auto">{it.memo}</span>}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {STATUS_CHOICES.map((s) => {
                          const active = picked[it.item_id] === s
                          const st = STATUS_STYLE[s]
                          return (
                            <button
                              key={s}
                              onClick={() => setPicked((p) => ({ ...p, [it.item_id]: s }))}
                              className={`py-2 rounded-lg text-xs font-medium border transition-colors ${active ? st.activeBtn : st.idleBtn}`}
                            >
                              {STATUS_LABEL[s]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 送信バー */}
      {pickedCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4" style={{ backgroundColor: '#1c1917', borderTop: '1px solid #44403c' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setPicked({})} className="text-stone-400 hover:text-stone-200 text-xs px-3 py-2">クリア</button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-stone-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              <Send size={16} />
              {saving ? '送信中...' : `${pickedCount}件を送信`}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
