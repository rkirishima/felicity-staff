// 在庫モジュール共通ラベル/色マップ。
// DB/コードは英語キー、UI表示は日本語。色: enough=緑 / reorder=薄赤 / urgent=濃赤 / unchecked=グレー。

export type StockStatus = 'enough' | 'reorder' | 'urgent' | 'unchecked'
export type CheckFrequency = 'daily' | 'weekly' | 'monthly'
export type ContactMethod = 'email' | 'line' | 'phone' | 'fax'
export type TrackingMode = 'manual' | 'square_linked'

// 状態の日本語ラベル
export const STATUS_LABEL: Record<StockStatus, string> = {
  enough: '十分ある',
  reorder: '発注ライン',
  urgent: '緊急',
  unchecked: '未確認',
}

// チェック画面の4択ボタン並び順
export const STATUS_CHOICES: StockStatus[] = ['enough', 'reorder', 'urgent', 'unchecked']

// ダークテーマ用の色クラス。dot=丸バッジ / chip=ラベルチップ / activeBtn=選択中ボタン / idleBtn=未選択ボタン
export const STATUS_STYLE: Record<
  StockStatus,
  { dot: string; chip: string; activeBtn: string; idleBtn: string }
> = {
  enough: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    activeBtn: 'bg-emerald-600 text-white border-emerald-500',
    idleBtn: 'bg-stone-900 text-emerald-300/70 border-stone-700',
  },
  reorder: {
    dot: 'bg-rose-400',
    chip: 'bg-rose-400/15 text-rose-200 border border-rose-400/30',
    activeBtn: 'bg-rose-500 text-white border-rose-400',
    idleBtn: 'bg-stone-900 text-rose-300/70 border-stone-700',
  },
  urgent: {
    dot: 'bg-red-600',
    chip: 'bg-red-600/20 text-red-300 border border-red-600/40',
    activeBtn: 'bg-red-700 text-white border-red-600',
    idleBtn: 'bg-stone-900 text-red-400/70 border-stone-700',
  },
  unchecked: {
    dot: 'bg-stone-500',
    chip: 'bg-stone-500/15 text-stone-300 border border-stone-500/30',
    activeBtn: 'bg-stone-600 text-white border-stone-500',
    idleBtn: 'bg-stone-900 text-stone-400 border-stone-700',
  },
}

// チェック頻度の日本語ラベル
export const FREQ_LABEL: Record<CheckFrequency, string> = {
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
}

export const FREQ_CHOICES: CheckFrequency[] = ['daily', 'weekly', 'monthly']

// 発注先の連絡手段ラベル
export const CONTACT_LABEL: Record<ContactMethod, string> = {
  email: 'メール',
  line: 'LINE',
  phone: '電話',
  fax: 'FAX',
}

export const CONTACT_CHOICES: ContactMethod[] = ['email', 'line', 'phone', 'fax']

// 在庫追跡モード
export const TRACKING_LABEL: Record<TrackingMode, string> = {
  manual: '手動',
  square_linked: 'Square連動',
}

// 文字列を既知の状態に丸める（未知値は unchecked 扱い）
export function asStatus(v: string | null | undefined): StockStatus {
  return v === 'enough' || v === 'reorder' || v === 'urgent' || v === 'unchecked' ? v : 'unchecked'
}
