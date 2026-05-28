// Square 売上を税理士提出用の4区分に分類する。
// - dine_in_10  : 10% 課税・イートイン（店内飲食）
// - goods_10    : 10% 課税・物販（Tシャツ・マグ・グッズ等）
// - beans_8     : 8% 軽減・豆等の物販（コーヒー豆・ドリップパック）
// - takeout_8   : 8% 軽減・テイクアウト食品（持帰り飲食料品）
// - unknown     : 分類不能（要手動オーバーライド）
//
// 判定優先度: 商品名/カテゴリ名のキーワード > 税率
export type RevenueCategory =
  | 'dine_in_10'
  | 'goods_10'
  | 'beans_8'
  | 'takeout_8'
  | 'unknown'

export const REVENUE_CATEGORY_LABEL: Record<RevenueCategory, string> = {
  dine_in_10: '10% イートイン',
  goods_10: '10% 物販（グッズ）',
  beans_8: '8% 豆等の物販',
  takeout_8: '8% テイクアウト',
  unknown: '未分類',
}

// 豆・ドリップパック等の物販キーワード
const BEANS_KEYWORDS = /豆|beans?\b|drip|ドリップ|ドリップパック|200\s?g|100\s?g|150\s?g|250\s?g|whole bean|coffee bag/i

// 8% テイクアウト食品キーワード（クッキー・焼き菓子・お菓子など）
const TAKEOUT_FOOD_KEYWORDS = /クッキー|cookie|biscuit|ビスケット|スコーン|scone|マフィン|muffin|焼き菓子|tart|タルト|cake|ケーキ|sandwich|サンドイッチ|サンド|ベーグル|bagel|brownie|ブラウニー|granola|グラノーラ/i

// 非食品グッズキーワード
const GOODS_KEYWORDS = /\bt[\s-]?shirt\b|シャツ|sweat\s?shirt|スウェット|hoodie|パーカー|mug|マグ|タンブラー|tumbler|cap\b|キャップ|帽子|グッズ|goods|merch|stainless|ボトル|エコバッグ|tote|tee|ステッカー|sticker|book|本|缶|cap\b|apron|エプロン/i

export function classifyRevenue(opts: {
  taxRate: number | null
  itemName: string | null
  category: string | null
}): RevenueCategory {
  const blob = `${opts.itemName ?? ''} ${opts.category ?? ''}`
  const rate = opts.taxRate

  // Strong food-keyword signal: classify as 8% takeout regardless of tax_rate
  // (Square POS sometimes leaves tax_rate null on custom-priced food items)
  if (TAKEOUT_FOOD_KEYWORDS.test(blob)) return 'takeout_8'

  if (rate === 8) {
    if (BEANS_KEYWORDS.test(blob)) return 'beans_8'
    return 'takeout_8'
  }
  if (rate === 10) {
    if (GOODS_KEYWORDS.test(blob)) return 'goods_10'
    return 'dine_in_10'
  }
  return 'unknown'
}

// Manual overrides loaded from keiri_square_item_overrides keyed by item_name.
// Used by sync route, Square page, and tax report endpoints.
export function effectiveRevenueCategory(
  line: { tax_rate: number | null; item_name: string | null; category: string | null },
  overrides?: Map<string, RevenueCategory> | Record<string, RevenueCategory>,
): RevenueCategory {
  if (line.item_name && overrides) {
    const fromMap =
      overrides instanceof Map ? overrides.get(line.item_name) : overrides[line.item_name]
    if (fromMap) return fromMap
  }
  return classifyRevenue({
    taxRate: line.tax_rate,
    itemName: line.item_name,
    category: line.category,
  })
}
