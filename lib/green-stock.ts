// 生豆(グリーン)在庫の共通型とラベル。
// 在庫の真は Supabase の green_stock_events(append-only) と
// green_stock_current ビュー。焙煎(roast_logs)と仕入(roast_purchases)からは
// DB トリガが自動でイベントを起こすので、アプリ側で在庫を書き換えない。

export type GreenStatus = 'needs_count' | 'out' | 'urgent' | 'reorder' | 'ok'

export type GreenStock = {
  bean_id: string
  display_name: string
  origin_country: string | null
  process: string | null
  supplier_id: string | null
  reorder_threshold_kg: number | null
  kg_on_hand: number
  last_count_at: string | null
  has_count: boolean
  kg_per_day_60d: number
  last_roast_at: string | null
  last_purchase_at: string | null
  days_cover: number | null
  status: GreenStatus
}

export type GreenEvent = {
  id: string
  bean_id: string
  ts: string
  delta_kg: number
  event_type: 'count_set' | 'purchase' | 'roast' | 'waste' | 'adjust'
  notes: string | null
  created_by: string | null
}

export const STATUS_META: Record<
  GreenStatus,
  { label: string; text: string; bg: string; border: string; order: number }
> = {
  out:         { label: '在庫切れ', text: '#fca5a5', bg: 'rgba(239,68,68,0.12)',  border: '#7f1d1d', order: 0 },
  urgent:      { label: '要発注',   text: '#fdba74', bg: 'rgba(249,115,22,0.12)', border: '#7c2d12', order: 1 },
  reorder:     { label: 'そろそろ', text: '#fcd34d', bg: 'rgba(245,158,11,0.12)', border: '#78350f', order: 2 },
  needs_count: { label: '棚卸し未', text: '#a8a29e', bg: 'rgba(168,162,158,0.10)', border: '#44403c', order: 3 },
  ok:          { label: '十分',     text: '#5eead4', bg: 'rgba(20,184,166,0.10)', border: '#134e4a', order: 4 },
}

export const EVENT_LABELS: Record<GreenEvent['event_type'], string> = {
  count_set: '棚卸し',
  purchase: '仕入',
  roast: '焙煎',
  waste: '廃棄',
  adjust: '調整',
}

/** 在庫が尽きる予測日。消費実績が無ければ null。 */
export function runsOutOn(s: GreenStock): Date | null {
  if (!s.kg_per_day_60d || s.kg_per_day_60d <= 0 || s.kg_on_hand <= 0) return null
  const days = s.kg_on_hand / s.kg_per_day_60d
  return new Date(Date.now() + days * 86400_000)
}

/** JST の YYYY-MM-DD */
export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** ISO 文字列を JST の YYYY-MM-DD で表示 */
export function fmtDateJST(iso: string | null): string {
  if (!iso) return '—'
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function fmtKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '—'
  return `${Number(kg).toFixed(1)} kg`
}
