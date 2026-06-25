// WEB(felicity-web ECサイト)の物販 variant 一覧。
//
// 出所: felicity-web リポジトリの messages/ja.json → homepage.merch.apparel
//   各 variant の id がカート CartItem.id となり、orders.items[].id まで流れる。
//   → これが「WEB側の在庫キー」。channel='web' の external_id に対応する。
//
// ★ 注意: ここは静的コピー。felicity-web 側で商品/variant を増減したら手動で同期すること。
//   (将来的には felicity-web から API/共有テーブルで配信するのが望ましい。STEP 1 では静的で十分)
//
// 物販(apparel/goods)のみ。コーヒー豆は対象外。

export type WebVariant = {
  variant_id: string   // カートに乗る id = inv_sku_channel_map.external_id (channel='web')
  product_id: string   // 親商品 id
  category: string     // tshirts / caps / hoodie / sweatshirt / beanie / tumbler / pantry
  name: string         // 商品名(色/サイズ抜き)
  color: string | null
  size: string | null
}

export const WEB_VARIANTS: WebVariant[] = [
  { variant_id: 'tshirt-drive-date-m', product_id: 'tshirt-drive-date', category: 'tshirts', name: 'Drive Date', color: 'White', size: 'M' },
  { variant_id: 'tshirt-drive-date-l', product_id: 'tshirt-drive-date', category: 'tshirts', name: 'Drive Date', color: 'White', size: 'L' },
  { variant_id: 'tshirt-drive-date-xl', product_id: 'tshirt-drive-date', category: 'tshirts', name: 'Drive Date', color: 'White', size: 'XL' },
  { variant_id: 'tshirt-peace-biker-m', product_id: 'tshirt-peace-biker', category: 'tshirts', name: 'Peace Biker', color: 'White', size: 'M' },
  { variant_id: 'tshirt-peace-biker-l', product_id: 'tshirt-peace-biker', category: 'tshirts', name: 'Peace Biker', color: 'White', size: 'L' },
  { variant_id: 'tshirt-peace-biker-xl', product_id: 'tshirt-peace-biker', category: 'tshirts', name: 'Peace Biker', color: 'White', size: 'XL' },
  { variant_id: 'tshirt-peace-biker-xxl', product_id: 'tshirt-peace-biker', category: 'tshirts', name: 'Peace Biker', color: 'White', size: 'XXL' },
  { variant_id: 'tshirt-la-motarde-m', product_id: 'tshirt-la-motarde', category: 'tshirts', name: 'La Motarde', color: 'Grey', size: 'M' },
  { variant_id: 'tshirt-la-motarde-l', product_id: 'tshirt-la-motarde', category: 'tshirts', name: 'La Motarde', color: 'Grey', size: 'L' },
  { variant_id: 'tshirt-la-motarde-xl', product_id: 'tshirt-la-motarde', category: 'tshirts', name: 'La Motarde', color: 'Grey', size: 'XL' },
  { variant_id: 'tshirt-la-motarde-xxl', product_id: 'tshirt-la-motarde', category: 'tshirts', name: 'La Motarde', color: 'Grey', size: 'XXL' },
  { variant_id: 'cap-grey-regular', product_id: 'cap-grey', category: 'caps', name: 'Staff Cap', color: 'Grey', size: 'Regular' },
  { variant_id: 'cap-black-regular', product_id: 'cap-black', category: 'caps', name: 'Staff Cap', color: 'Black', size: 'Regular' },
  { variant_id: 'cap-beige-regular', product_id: 'cap-beige', category: 'caps', name: 'Staff Cap', color: 'Beige', size: 'Regular' },
  { variant_id: 'hoodie-m', product_id: 'hoodie', category: 'hoodie', name: 'Pullover Hoodie', color: null, size: 'M' },
  { variant_id: 'hoodie-l', product_id: 'hoodie', category: 'hoodie', name: 'Pullover Hoodie', color: null, size: 'L' },
  { variant_id: 'hoodie-xl', product_id: 'hoodie', category: 'hoodie', name: 'Pullover Hoodie', color: null, size: 'XL' },
  { variant_id: 'hoodie-xxl', product_id: 'hoodie', category: 'hoodie', name: 'Pullover Hoodie', color: null, size: 'XXL' },
  { variant_id: 'sweatshirt-m', product_id: 'sweatshirt', category: 'sweatshirt', name: 'College Sweatshirt', color: null, size: 'M' },
  { variant_id: 'sweatshirt-l', product_id: 'sweatshirt', category: 'sweatshirt', name: 'College Sweatshirt', color: null, size: 'L' },
  { variant_id: 'sweatshirt-xl', product_id: 'sweatshirt', category: 'sweatshirt', name: 'College Sweatshirt', color: null, size: 'XL' },
  { variant_id: 'sweatshirt-xxl', product_id: 'sweatshirt', category: 'sweatshirt', name: 'College Sweatshirt', color: null, size: 'XXL' },
  { variant_id: 'beanie-staff-grey', product_id: 'beanie-staff', category: 'beanie', name: 'Staff Beanie — Grey Only', color: 'Grey', size: null },
  { variant_id: 'tumbler-regular', product_id: 'tumbler', category: 'tumbler', name: 'Rivers Tumbler', color: null, size: null },
  { variant_id: 'maple-syrup-cosman-webb-250ml', product_id: 'maple-syrup-cosman-webb', category: 'pantry', name: 'Cosman & Webb Pure Maple Syrup', color: null, size: null },
]

// variant の表示ラベル(商品名 + 色 + サイズ)
export function webVariantLabel(v: WebVariant): string {
  const parts = [v.name]
  if (v.color) parts.push(v.color)
  if (v.size) parts.push(v.size)
  return parts.join(' — ')
}
