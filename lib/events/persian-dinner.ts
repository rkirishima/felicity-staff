// ペルシャディナー・ポップアップ（テスト版）の固定設定。
// 金額は integer（円・税込）。
export const PERSIAN_DINNER = {
  slug: 'persian-dinner',
  title: '冬至のペルシャ料理',
  title_note: '仮称',
  title_en: 'Persian Cuisine for the Winter Solstice (Shab-e Yalda)',
  date: '2026-12-20',
  start_time: '18:00',
  photo: '/events/persian-dinner-pomegranate-tree.webp', // レザ作「ザクロの木」
  photos: {
    utensils: '/events/persian-dinner-utensils.webp',
    nabat: '/events/persian-dinner-nabat.webp',
    herbs: '/events/persian-dinner-herbs.webp',
    pots: '/events/persian-dinner-pots.webp',
    tea: '/events/persian-dinner-tea.webp',
  },
  capacity: 20,
  price_jpy: 6600, // 1名あたり・税込
  max_per_order: 6,
  cancel_days_before: 3, // 開催3日前まで全額返金でキャンセル可
  // ドリンクは料金に含まない（当日別会計）
  drinks: ['ワイン', 'ビール', 'コーヒー', 'ソフトドリンク'],
  drinks_en: ['Wine', 'Beer', 'Coffee', 'Soft drinks'],
  // 冬至（シャべヤルダ）の紹介文
  intro: [
    '冬至は古代ペルシャから続く特別な日です。',
    'シャべヤルダと呼ばれる冬至前夜には、赤い食べ物、ザクロやリンゴやスイカなどがテーブルを飾り、赤い食材を使った料理を作って無病息災を願います。',
    '光が闇に勝利する「冬至の日の出」を待ちながら、この夜は家族でハーフェズ占いをしたり、詩を読んだりして、一年で一番長い夜を楽しみます。',
    'そんな特別な日を Felicity にて皆様に味わっていただくのが私たちの願いです。',
  ],
  intro_en:
    'The winter solstice has been a special day since ancient Persia. On Shab-e Yalda, the longest night of the year, tables are decorated with red foods such as pomegranates, apples and watermelon, and families share red dishes for good health, read poetry and tell fortunes with the poems of Hafez while waiting for the solstice sunrise.',
  hosts: ['M.レザ ラハバ', '長谷川朝子'],
  book: '「家庭で楽しむペルシャ料理」河出書房新社',
  notes: [
    '「ペルシャ」はイランの旧国名ですが、今は文化的総称として使われています。',
    '「ハーフェズ占い」ハーフェズは14世紀のペルシャの詩人。各家庭にあるハーフェズ詩集を無作為に開き、そこからメッセージを受け取ります。',
  ],
  // ペルシャ料理とは
  about: [
    '季節の野菜やハーブ、フルーツをふんだんに使うペルシャ料理。豆やナッツ、サフランやバラ水など、幅広い豊かな食材を組み合わせて出来上がります。イランでは「最高のシェフは家庭にあり」と言われ、そのレシピは各家庭で脈々と受け継がれてきました。',
    'ペルシャ料理の歴史は古代まで遡りますが、7世紀には現代のペルシャ料理の原型ができたと言われています。近隣諸国の食文化に深く影響を与え、その長い歴史の中ではそれぞれの食物がもつ性質、温・冷・乾・湿をうまく組み合わせたバランスの取れた料理が育まれました。家庭でも天候や体調に合わせた食べ物や飲み物が工夫され、幼い頃から見聞きした知識が自然に身に着くかたちで、それは長く伝承されてきました。',
    '私が思い出す幼い頃の朝の風景とは、バスケットいっぱいに積んだハーブの前に座る祖母と母の姿。家族が食べる今日1日分のハーブを茎と葉に分けて下準備をしている姿です。',
    'たっぷり時間をかけて用意をして、ゆっくり食べる。幼い私が遊びに行きたい一心で急いで食べようとすると、きまって聞かされるのが「急ぐのは悪魔の仕業」という、ことわざでした。',
  ],
  about_by: 'レザ',
  menu: [
    { ja: 'ザクロとクルミと鶏のコレシュ', en: 'Chicken khoresh with pomegranate & walnuts', photo: '/events/persian-dinner-khoresh.webp' },
    { ja: '薄焼きナンロール', en: 'Thin flatbread rolls', photo: '/events/persian-dinner-nan-roll.webp' },
    { ja: '豆と肉と米のボール', en: 'Bean, meat & rice balls', photo: '/events/persian-dinner-kufteh.webp' },
    { ja: 'ハーブの炊き込みご飯', en: 'Herb rice', photo: '/events/persian-dinner-herb-rice.webp' },
  ],
} as const

// キャンセル期限（JST, YYYY-MM-DD）。開催日の cancel_days_before 日前の 23:59 まで。
export function cancelDeadline(): string {
  const d = new Date(PERSIAN_DINNER.date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - PERSIAN_DINNER.cancel_days_before)
  return d.toISOString().slice(0, 10)
}
