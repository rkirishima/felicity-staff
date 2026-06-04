/**
 * 豆 × ローストレベル のプロファイル(Probat P05III想定)。
 *
 * 2026-05-29 投入温度リキャリブレーション (Opus 4.8):
 *   実機フィードバック「投入温度が高すぎる」を反映し、charge を全体 -12〜-16°C 引き下げ。
 *   - P05III(5kg級ドラム)で 1〜3.6kg の小〜中バッチ運用 → ドラムの蓄熱が豆量に対して大きい。
 *     高チャージは表面スコーチ/チッピングを招くため、BT基準で robust 186〜196 / delicate 180〜186 に。
 *   - 1kg→3.6kg デルタを +18 → robust +12〜13 / delicate +8 に縮小(振りすぎ防止)。
 *   - charge < FC の自然な曲線へ修正(投入→中点ディップ→FC へ上昇)。
 *   - FC温度・ドロップ温度は不変(実機で検証済の結果ターゲットのため)。
 *   ⚠ これらは出発点。実機の中点(turning point)実測で各豆 ±3〜5°C 微調整推奨。
 *
 * 2026-05-30 ドラムRPMリキャリブレーション:
 *   旧値45〜55は5kg級ドラムに対して遅すぎ(Scott Rao推奨は5kg級で約60〜70、
 *   1〜2kgで70〜80・12kgで52〜56=決め手はドラム径)。P05IIIはインバーター可変。
 *   - 標準(washed/ブラジル等) 50/55 → 62。
 *   - 繊細・スコーチ警戒(ナチュラル/ハニー/デカフェ) 45/50 → 64。
 *     ※前回「ナチュラルは低RPM」は理屈が逆だった。低RPM=ドラム接触時間↑=伝導熱↑=
 *       スコーチ/チッピング↑。繊細な豆ほど高RPMで空中時間を稼ぎ接触を減らすのが正。
 *
 * 1豆に複数レベルあり。UIで豆選択後、対応レベルから選ぶ。
 */

export type RoastLevel = 'light' | 'city' | 'medium' | 'dark'

export const ROAST_LEVEL_LABELS: Record<RoastLevel, string> = {
  light:  '浅煎り (City)',
  city:   'City+',
  medium: '中煎り (Full City)',
  dark:   '深煎り (Vienna)',
}

export type RoastProfile = {
  bean_id: string
  roast_level: RoastLevel
  group: string
  flavor: string
  charge_1kg_c: number
  charge_3kg_c?: number
  fc_c: number
  drop_c: number
  total_time_min: string
  drum_rpm: number
  drum_note?: string
  heat_method:
    | 'fast-ramp'
    | 'aggressive-steady'
    | 'gradual-ramp'
    | 'steady-medium'
    | 'gentle-controlled'
    | 'gentle-balanced'
    | 'very-gentle'
  strategy: string
  pro_tip: string
  /** 'none'=ソーク無し / 'short'=短ソーク20-30秒 / 'full'=フルソーク約60秒 */
  soak: 'none' | 'short' | 'full'
}

export const PROFILES: RoastProfile[] = [
  // ═══════════════════ PNG BAROIDA WASHED ═══════════════════
  {
    bean_id: 'PNG_BAROIDA_WASHED', roast_level: 'city',
    group: 'Traditional', flavor: 'Milk Chocolate / Almond / Cedar / Balanced Body',
    charge_1kg_c: 194, charge_3kg_c: 207, fc_c: 200, drop_c: 215,
    total_time_min: '11:00', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'fast-ramp',
    strategy: 'カフェ・フィルター向けCity+。ドライング短めでMaillardしっかり、FC+60秒で落としてバランス重視。',
    pro_tip: 'DTR 18-20%。City+でナッツ感とライトボディが綺麗にまとまる。',
    soak: 'none',
  },
  {
    bean_id: 'PNG_BAROIDA_WASHED', roast_level: 'dark',
    group: 'Traditional', flavor: 'Dark Chocolate / Roasted Almond / Cedar / Bold Espresso',
    charge_1kg_c: 194, charge_3kg_c: 207, fc_c: 200, drop_c: 224,
    total_time_min: '12:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'fast-ramp',
    strategy: '旭興産向けの深煎り。Maillardを伸ばしてからFC、Vienna手前でドロップ。エスプレッソのボディと甘味の核に。',
    pro_tip: 'FC後に必ず2段ガス減でクラッシュ防止。224°C超えると焦げ臭が出るので注意。',
    soak: 'none',
  },

  // ═══════════════════ PNG BAROIDA HONEY ═══════════════════
  {
    bean_id: 'PNG_BAROIDA_HONEY', roast_level: 'city',
    group: 'Traditional', flavor: 'Honey / Red Apple / Milk Chocolate / Syrupy Body',
    charge_1kg_c: 190, charge_3kg_c: 202, fc_c: 199, drop_c: 214,
    total_time_min: '11:00', drum_rpm: 64, drum_note: 'HONEY - 糖質多くスコーチ寄り、高RPM+排気やや強め',
    heat_method: 'gentle-balanced',
    strategy: 'ハニー製法でwashedより甘く果実寄り。中庸火力でハチミツの甘味とリンゴ酸を両立、FC+60秒で落とす。',
    pro_tip: 'washed版より-4°Cチャージ。糖が多くスコーチしやすいので最初の2分は色ムラ監視。',
    soak: 'none',
  },
  {
    bean_id: 'PNG_BAROIDA_HONEY', roast_level: 'dark',
    group: 'Traditional', flavor: 'Dark Chocolate / Caramelized Honey / Almond / Bold',
    charge_1kg_c: 190, charge_3kg_c: 202, fc_c: 199, drop_c: 222,
    total_time_min: '12:00', drum_rpm: 64, drum_note: 'HONEY - 糖質多くスコーチ寄り、高RPM+排気やや強め',
    heat_method: 'gentle-balanced',
    strategy: '深煎りでハニーの糖がカラメル化。エスプレッソのボディと甘味に。Vienna手前で止める。',
    pro_tip: '222°C超えると糖の苦味が勝つ。ハニーは深煎りでも甘味が核なので欲張らない。',
    soak: 'none',
  },

  // ═══════════════════ PNG PREMIUM (特価バルク/業販ベース) ═══════════════════
  {
    bean_id: 'PNG_PREMIUM_BULK', roast_level: 'city',
    group: 'Traditional', flavor: 'Nutty / Brown Sugar / Mild Cocoa / Easy Body',
    charge_1kg_c: 187, charge_3kg_c: 198, fc_c: 198, drop_c: 214,
    total_time_min: '10:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: '特価バルク。ブレンドベース/業販向けにクセなく素直に。City+でナッツと甘味。',
    pro_tip: 'グレード不揃いの可能性。色ムラが出たら排気で調整。長時間ベイク回避。',
    soak: 'none',
  },
  {
    bean_id: 'PNG_PREMIUM_BULK', roast_level: 'dark',
    group: 'Traditional', flavor: 'Dark Chocolate / Caramel / Full Body',
    charge_1kg_c: 187, charge_3kg_c: 198, fc_c: 198, drop_c: 222,
    total_time_min: '11:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: 'ブレンドのボディ要員。Full City+で苦味と甘味をしっかり。業販ブレンドの土台。',
    pro_tip: 'Vienna超えるとスモーキー。222°Cまで。コスト豆なので回転重視で安定運用。',
    soak: 'none',
  },

  // ═══════════════════ BRASIL SANTA ALINA ═══════════════════
  {
    bean_id: 'BRA_SANTA_ALINA', roast_level: 'city',
    group: 'Traditional', flavor: 'Hazelnut / Caramel / Light Chocolate / Creamy',
    charge_1kg_c: 188, charge_3kg_c: 200, fc_c: 198, drop_c: 213,
    total_time_min: '10:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: 'City+でフルーティ寄り。中庸火力、FC+45-60秒で止めてヘーゼルナッツの甘味を引き出す。',
    pro_tip: 'soft beanなのでベイク注意。10:30以内で落とす。',
    soak: 'none',
  },
  {
    bean_id: 'BRA_SANTA_ALINA', roast_level: 'dark',
    group: 'Traditional', flavor: 'Dark Chocolate / Caramel / Walnut / Heavy Body',
    charge_1kg_c: 188, charge_3kg_c: 200, fc_c: 198, drop_c: 222,
    total_time_min: '11:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: '深煎りでエスプレッソベース。Full City+〜Vienna手前。ナッツ→ダークチョコの遷移を引き出す。',
    pro_tip: 'Vienna超えると油っぽくbitter。222°Cで止めて甘味とビター感のバランスを取る。',
    soak: 'none',
  },

  // ═══════════════════ BRAZIL CERRADO ═══════════════════
  {
    bean_id: 'BRA_CERRADO', roast_level: 'city',
    group: 'Traditional', flavor: 'Peanut / Brown Sugar / Mild Cocoa / Round',
    charge_1kg_c: 189, charge_3kg_c: 201, fc_c: 199, drop_c: 214,
    total_time_min: '10:45', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: 'City+で素直な甘味。ナチュラルチャフを排気で逃しつつ、ピーナッツ→ブラウンシュガーの遷移を引き出す。',
    pro_tip: '排気を1段強めに。チャフによる雑味を防ぐ。',
    soak: 'none',
  },
  {
    bean_id: 'BRA_CERRADO', roast_level: 'dark',
    group: 'Traditional', flavor: 'Cocoa / Caramel / Dark Toast / Full Body',
    charge_1kg_c: 189, charge_3kg_c: 201, fc_c: 199, drop_c: 222,
    total_time_min: '11:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: 'ブレンドベース向け深煎り。Full City+でカカオとキャラメルが融合、ボディしっかり。',
    pro_tip: 'FC後の伸び方を観察。チャフが急に増えたら火を絞る。',
    soak: 'none',
  },

  // ═══════════════════ BRAZIL SANTOS ═══════════════════
  {
    bean_id: 'BRA_SANTOS', roast_level: 'city',
    group: 'Traditional', flavor: 'Nutty / Mild / Low Acidity / Easy Drinking',
    charge_1kg_c: 186, charge_3kg_c: 197, fc_c: 197, drop_c: 215,
    total_time_min: '10:00', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: 'City+のナッツ寄り。短時間で素直に。コモディティなのでベイク絶対回避。',
    pro_tip: '10:00以内で落とす。長く取ると紙臭くなる。',
    soak: 'none',
  },
  {
    bean_id: 'BRA_SANTOS', roast_level: 'dark',
    group: 'Traditional', flavor: 'Dark Chocolate / Smoke / Heavy Body',
    charge_1kg_c: 186, charge_3kg_c: 197, fc_c: 197, drop_c: 222,
    total_time_min: '11:00', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'steady-medium',
    strategy: 'ブレンドのボディ要員。Full City+でしっかり苦味と甘味を出す。',
    pro_tip: 'Vienna超えるとスモーキーになりすぎ。222°Cまで。',
    soak: 'none',
  },

  // ═══════════════════ GUATEMALA LA CUPULA ═══════════════════
  {
    bean_id: 'GTM_LA_CUPULA', roast_level: 'medium',
    group: 'Traditional', flavor: 'Chocolate / Molasses / Bourbon Sweetness',
    charge_1kg_c: 196, charge_3kg_c: 210, fc_c: 203, drop_c: 218,
    total_time_min: '11:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'aggressive-steady',
    strategy: 'Antigua SHB。密度高いので本群では最も高めのチャージ可。Full Cityでバランス、set & forgetで火を緩めない。',
    pro_tip: 'FC後だけ2段ガス減。途中で絞ると逆にストール。投入直後だけ短ソーク(20-30秒)で芯を均一化。',
    soak: 'short',
  },
  {
    bean_id: 'GTM_LA_CUPULA', roast_level: 'dark',
    group: 'Traditional', flavor: 'Deep Chocolate / Molasses / Smoky / Heavy Bourbon',
    charge_1kg_c: 196, charge_3kg_c: 210, fc_c: 203, drop_c: 225,
    total_time_min: '12:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'aggressive-steady',
    strategy: 'エスプレッソ向け深煎り。Vienna手前で甘さと深みのピーク。',
    pro_tip: '密度高いのでVienna越えてもストール無いが、225°Cで止めないと焦げる。投入直後だけ短ソーク(20-30秒)。',
    soak: 'short',
  },

  // ═══════════════════ GUATEMALA GUALVADOR (Anaerobic) ═══════════════════
  {
    bean_id: 'GTM_GUALVADOR', roast_level: 'medium',
    group: 'Experimental', flavor: 'Strawberry Jam / Red Wine / Cacao Nibs / Winey',
    charge_1kg_c: 190, charge_3kg_c: 202, fc_c: 200, drop_c: 213,
    total_time_min: '11:30', drum_rpm: 64, drum_note: 'NATURAL - 高RPMで接触スコーチ回避(空中時間↑)',
    heat_method: 'gradual-ramp',
    strategy: 'City+で発酵フレーバー最大。緩やかなランプでアナエロビック特有のいちごジャム感を保護。',
    pro_tip: 'FC開始時に体感より1段早めにガス切り。',
    soak: 'none',
  },
  {
    bean_id: 'GTM_GUALVADOR', roast_level: 'dark',
    group: 'Experimental', flavor: 'Dark Cacao / Molasses / Wine-finish / Deep Berry',
    charge_1kg_c: 190, charge_3kg_c: 202, fc_c: 200, drop_c: 220,
    total_time_min: '12:30', drum_rpm: 64, drum_note: 'NATURAL - 高RPMで接触スコーチ回避(空中時間↑)',
    heat_method: 'gradual-ramp',
    strategy: 'Vienna手前で深いチョコ＋発酵香の融合。発酵がモラセスに化ける狙い。',
    pro_tip: '⚠ 220°Cを絶対超えない事 — 発酵香がアセトン/medicinalに化ける。FC+120秒以内で必ず判定。',
    soak: 'none',
  },

  // ═══════════════════ ETHIOPIA YIRGACHEFFE G-1 NATURAL ═══════════════════
  {
    bean_id: 'ETH_YIRGACHEFFE_G1', roast_level: 'light',
    group: 'Filter', flavor: 'Blueberry / Jasmine / Bergamot / Wine / Syrupy',
    charge_1kg_c: 184, charge_3kg_c: 192, fc_c: 196, drop_c: 205,
    total_time_min: '10:00', drum_rpm: 64, drum_note: 'NATURAL - 高RPMで接触スコーチ回避(空中時間↑)',
    heat_method: 'gentle-controlled',
    strategy: '浅煎りで果実香最大化。SOAK 60秒、FC+45-60秒で即ドロップ。フィルター用。',
    pro_tip: 'FC開始から60秒以内必ず。1秒の遅れがフローラルを破壊。',
    soak: 'full',
  },
  {
    bean_id: 'ETH_YIRGACHEFFE_G1', roast_level: 'medium',
    group: 'Filter', flavor: 'Berry Jam / Honey / Mild Floral / Round Body',
    charge_1kg_c: 184, charge_3kg_c: 192, fc_c: 196, drop_c: 213,
    total_time_min: '11:00', drum_rpm: 64, drum_note: 'NATURAL - 高RPMで接触スコーチ回避(空中時間↑)',
    heat_method: 'gentle-controlled',
    strategy: '中煎りでベリージャムと甘さのバランス。フィルター/エスプレッソ両用。',
    pro_tip: '213°C超えると焙煎香でフローラル消える。FC+120秒以内で判定。',
    soak: 'full',
  },

  // ═══════════════════ ETHIOPIA BANKO GOTITI ═══════════════════
  // ※ 次回ロットから ETHIOPIA GUJI へ切替予定(GOTITI終売)。切替時にbean_id追加。
  {
    bean_id: 'ETH_BANKO_GOTITI', roast_level: 'light',
    group: 'Filter', flavor: 'Lemon / Jasmine / White Peach / Black Tea',
    charge_1kg_c: 185, charge_3kg_c: 193, fc_c: 197, drop_c: 204,
    total_time_min: '9:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-controlled',
    strategy: 'Light で透明感最大。FC直後即ドロップ。レモンと紅茶が立つ。',
    pro_tip: 'DTR 17-19%。長くするとレモン酸が紙臭に。',
    soak: 'full',
  },
  {
    bean_id: 'ETH_BANKO_GOTITI', roast_level: 'medium',
    group: 'Filter', flavor: 'Stone Fruit / Honey / Mild Tea / Round',
    charge_1kg_c: 185, charge_3kg_c: 193, fc_c: 197, drop_c: 211,
    total_time_min: '10:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-controlled',
    strategy: '中煎りで桃感と甘味を引き出す。City+でフィルターのスイートスポット。',
    pro_tip: 'FC+90-120秒で判定。211°C超えると鋭さ消える。',
    soak: 'full',
  },

  // ═══════════════════ COLOMBIA DECAFE ═══════════════════
  {
    bean_id: 'COL_DECAFE', roast_level: 'medium',
    group: 'Decaf', flavor: 'Brown Sugar / Cocoa / Smooth / Round',
    charge_1kg_c: 180, charge_3kg_c: 188, fc_c: 192, drop_c: 212,
    total_time_min: '11:30', drum_rpm: 64, drum_note: 'First crack quieter than usual',
    heat_method: 'very-gentle',
    strategy: 'EA処理で細胞壁脆い。本群で最も低いチャージ＋SOAK、Maillard伸ばしてボディ補強。',
    pro_tip: 'FCの音/視覚共に弱い。豆色とRORで判断。Full City+で甘味とボディ。',
    soak: 'full',
  },
  {
    bean_id: 'COL_DECAFE', roast_level: 'dark',
    group: 'Decaf', flavor: 'Dark Cocoa / Caramelized Sugar / Heavy Body',
    charge_1kg_c: 180, charge_3kg_c: 188, fc_c: 192, drop_c: 220,
    total_time_min: '12:30', drum_rpm: 64, drum_note: 'First crack quieter than usual',
    heat_method: 'very-gentle',
    strategy: '深煎りでもデカフェなのでgentle継続。220°Cでビター感とボディが整う。',
    pro_tip: 'Vienna超えると豆が崩れる。220°Cで必ず止める。',
    soak: 'full',
  },

  // ═══════════════════ TANZANIA AA/AB MWIKA ═══════════════════
  {
    bean_id: 'TZA_MWIKA', roast_level: 'light',
    group: 'Filter', flavor: 'Black Currant / Lemon / Black Tea / Juicy',
    charge_1kg_c: 193, charge_3kg_c: 205, fc_c: 201, drop_c: 208,
    total_time_min: '10:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-balanced',
    strategy: 'Lightでカシスとレモンの酸を保つ。FC+45秒で即ドロップ。',
    pro_tip: '208°C超えると黒胡椒の刺激が出始める。',
    soak: 'full',
  },
  {
    bean_id: 'TZA_MWIKA', roast_level: 'medium',
    group: 'Filter', flavor: 'Berry / Cocoa / Black Tea / Balanced',
    charge_1kg_c: 193, charge_3kg_c: 205, fc_c: 201, drop_c: 213,
    total_time_min: '11:00', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-balanced',
    strategy: '中煎りでベリーとカカオが融合。フィルター/エスプレッソ両用。',
    pro_tip: 'Vienna以上にしない。ジューシーさが消える。',
    soak: 'full',
  },

  // ═══════════════════ INDIA ATTIKAN (Anaerobic) ═══════════════════
  {
    bean_id: 'IND_ATTIKAN', roast_level: 'medium',
    group: 'Experimental', flavor: 'Tropical Fruit / Cinnamon / Dark Chocolate / Spiced',
    charge_1kg_c: 190, charge_3kg_c: 202, fc_c: 199, drop_c: 214,
    total_time_min: '11:30', drum_rpm: 64, drum_note: 'NATURAL - 高RPMで接触スコーチ回避(空中時間↑)',
    heat_method: 'gradual-ramp',
    strategy: 'インド産アナエロビック。City+で発酵香とスパイス感を両立。',
    pro_tip: 'チャフ多め、排気管理重要。FC直前1段ガス減。アナエロの発酵香保護に投入直後だけ短ソーク(20-30秒)。',
    soak: 'short',
  },
  {
    bean_id: 'IND_ATTIKAN', roast_level: 'dark',
    group: 'Experimental', flavor: 'Dark Spice / Caramel / Wine-finish / Heavy Body',
    charge_1kg_c: 190, charge_3kg_c: 202, fc_c: 199, drop_c: 221,
    total_time_min: '12:30', drum_rpm: 64, drum_note: 'NATURAL - 高RPMで接触スコーチ回避(空中時間↑)',
    heat_method: 'gradual-ramp',
    strategy: '深煎りでスパイス感が前面、発酵が深いカラメル化。',
    pro_tip: '⚠ 221°Cまで。超えると発酵香がmedicinalに化ける。投入直後だけ短ソーク(20-30秒)。',
    soak: 'short',
  },

  // ═══════════════════ YEMEN WHITE CAMEL ═══════════════════
  {
    bean_id: 'YEM_WHITE_CAMEL', roast_level: 'medium',
    group: 'Premium Rare', flavor: 'Dried Apricot / Cardamom / Red Wine / Earthy',
    charge_1kg_c: 183, charge_3kg_c: 191, fc_c: 196, drop_c: 210,
    total_time_min: '11:30', drum_rpm: 64, drum_note: 'NATURAL - 高RPMで接触スコーチ回避(空中時間↑)',
    heat_method: 'gentle-controlled',
    strategy: 'サイズ不揃いで焦げやすい。低チャージ＋SOAKで均一加熱。City+でアプリコットとワイン感。',
    pro_tip: 'チップ/スコーチ警戒最優先。3分間は窓を覗いて色ムラ監視。',
    soak: 'full',
  },

  // ═══════════════════ JAMAICA BLUE MOUNTAIN ═══════════════════
  {
    bean_id: 'JAM_BLUE_MOUNTAIN', roast_level: 'medium',
    group: 'Premium Rare', flavor: 'Hazelnut / Maple Syrup / Mild Citrus / Elegant',
    charge_1kg_c: 186, charge_3kg_c: 194, fc_c: 198, drop_c: 213,
    total_time_min: '11:00', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-balanced',
    strategy: '高額豆、Mediumのみ。バランス重視のジェントルランプ。',
    pro_tip: '深煎り絶対NG。FC+60-75秒で必ずドロップ。',
    soak: 'full',
  },

  // ═══════════════════ EL SALVADOR FANY ═══════════════════
  {
    bean_id: 'SLV_FANY', roast_level: 'light',
    group: 'Filter', flavor: 'Red Apple / Floral / Honey / Bright',
    charge_1kg_c: 192, charge_3kg_c: 204, fc_c: 200, drop_c: 208,
    total_time_min: '10:30', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-balanced',
    strategy: 'Lightでリンゴの酸とフローラル。フィルター用。',
    pro_tip: 'FC+45-60秒。Red Bourbonの繊細さを保つ。高密度なので投入直後だけ短ソーク(20-30秒)。',
    soak: 'short',
  },
  {
    bean_id: 'SLV_FANY', roast_level: 'medium',
    group: 'Filter', flavor: 'Red Apple / Honey / Milk Chocolate / Almond',
    charge_1kg_c: 192, charge_3kg_c: 204, fc_c: 200, drop_c: 213,
    total_time_min: '11:00', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-balanced',
    strategy: 'Red Bourbonの古典的甘さ。中庸火力でリンゴ酸とハチミツのバランス。',
    pro_tip: 'DTR 20-22%で甘味ピーク。高密度なので投入直後だけ短ソーク(20-30秒)。',
    soak: 'short',
  },

  // ═══════════════════ PANAMA GEISHA ═══════════════════
  {
    bean_id: 'PAN_GEISHA', roast_level: 'light',
    group: 'Premium Rare', flavor: 'Jasmine / Bergamot / Peach / Tea-like',
    charge_1kg_c: 182, charge_3kg_c: 190, fc_c: 195, drop_c: 204,
    total_time_min: '10:00', drum_rpm: 62, drum_note: 'standard',
    heat_method: 'gentle-controlled',
    strategy: '最も繊細。本群で最低チャージ＋SOAKで香り保護、FC+45-60秒即ドロップ。Light厳守。',
    pro_tip: 'FC+60秒超えると花香消える。短いDTR(17-19%)が正解。',
    soak: 'full',
  },
]


/** 指定豆の利用可能なプロファイル(レベル順). */
export function profilesForBean(beanId: string): RoastProfile[] {
  const order: Record<RoastLevel, number> = { light: 0, city: 1, medium: 2, dark: 3 }
  return PROFILES
    .filter((p) => p.bean_id === beanId)
    .sort((a, b) => order[a.roast_level] - order[b.roast_level])
}

/** 指定豆×レベルのプロファイル。レベル無指定なら最初の利用可能なもの。 */
export function profileFor(beanId: string, level?: RoastLevel): RoastProfile | undefined {
  const all = profilesForBean(beanId)
  if (!level) return all[0]
  return all.find((p) => p.roast_level === level) ?? all[0]
}

/** バッチサイズに応じた charge 温度。
 *  1kg は charge_1kg_c、3kg以上は charge_3kg_c。
 *  中間(1.5〜3kg未満)は線形補完。3.6kgは3kg値を流用(必要なら実機で+2〜3°C)。 */
export function chargeTempFor(p: RoastProfile, batchKg: number): number {
  const c1 = p.charge_1kg_c
  const c3 = p.charge_3kg_c
  if (!c3 || batchKg <= 1) return c1
  if (batchKg >= 3) return c3
  // 1kg → 3kg を線形補完
  const t = (batchKg - 1) / 2
  return Math.round(c1 + (c3 - c1) * t)
}

/** ヒートメソッドの日本語ラベル */
export function heatMethodJa(m: RoastProfile['heat_method']): string {
  switch (m) {
    case 'fast-ramp':         return '速い昇温'
    case 'aggressive-steady': return '高熱維持'
    case 'gradual-ramp':      return 'ゆるやか昇温'
    case 'steady-medium':     return '中熱安定'
    case 'gentle-controlled': return 'やさしく制御'
    case 'gentle-balanced':   return 'やさしくバランス'
    case 'very-gentle':       return 'とてもやさしく'
  }
}
