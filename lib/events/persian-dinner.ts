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
    'フェリシティで一夜限りのペルシャ料理ディナー。ペルシャの家庭の食卓のように、色とりどりの料理を大皿で囲んでお楽しみください。',
  description_en:
    'A one-night-only Persian dinner at Felicity. Gather around a table of colourful sharing dishes, just like a Persian family feast.',
  // メニュー（予定・仮）
  menu: [
    { ja: 'ゼレシュク・ポロ — サフランとバーベリーのライス', en: 'Zereshk Polo — saffron rice with barberries' },
    { ja: 'ゴルメ・サブズィ — ハーブと牛肉の煮込み', en: 'Ghormeh Sabzi — herb & beef stew' },
    { ja: 'ホレシュ — ピスタチオを散らした煮込み肉', en: 'Khoresh — slow-cooked meat stew with pistachios' },
    { ja: 'マスト・オ・ヒヤール — きゅうりとミントのヨーグルト、ローズペタル', en: 'Mast-o-Khiar — cucumber & mint yogurt with rose petals' },
    { ja: 'サラダ・シーラーズィ — トマトときゅうりのサラダ', en: 'Salad Shirazi — tomato & cucumber salad' },
    { ja: 'サブズィ・ホルダン — フレッシュハーブとラディッシュ', en: 'Sabzi Khordan — fresh herbs & radishes' },
    { ja: 'ナン（ペルシャのパン）', en: 'Persian flatbread' },
  ],
} as const

// キャンセル期限（JST, YYYY-MM-DD）。開催日の cancel_days_before 日前の 23:59 まで。
export function cancelDeadline(): string {
  const d = new Date(PERSIAN_DINNER.date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - PERSIAN_DINNER.cancel_days_before)
  return d.toISOString().slice(0, 10)
}
