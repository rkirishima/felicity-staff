// ペルシャディナー・ポップアップ（テスト版）の固定設定。
// 金額は integer（円・税込）。
export const PERSIAN_DINNER = {
  slug: 'persian-dinner',
  title: 'ペルシャ料理ディナー ポップアップ',
  title_en: 'Persian Dinner Pop-up',
  date: '2026-12-20',
  start_time: '18:00',
  photo: '/events/persian-dinner.webp', // 仮写真
  capacity: 20,
  price_jpy: 6600, // 1名あたり・税込
  max_per_order: 6,
  cancel_days_before: 3, // 開催3日前まで全額返金でキャンセル可
  // ドリンクは料金に含まない（当日別会計）
  drinks: ['ワイン', 'ビール', 'コーヒー', 'ソフトドリンク'],
  drinks_en: ['Wine', 'Beer', 'Coffee', 'Soft drinks'],
  description:
    'フェリシティで一夜限りのペルシャ料理ディナー。サフランライス、ハーブたっぷりのシチュー、ケバブなど、本場の家庭料理をコースでお楽しみください。',
  description_en:
    'A one-night-only Persian dinner at Felicity. Enjoy a home-style course of saffron rice, herb stews, kebabs and more.',
} as const

// キャンセル期限（JST, YYYY-MM-DD）。開催日の cancel_days_before 日前の 23:59 まで。
export function cancelDeadline(): string {
  const d = new Date(PERSIAN_DINNER.date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - PERSIAN_DINNER.cancel_days_before)
  return d.toISOString().slice(0, 10)
}
