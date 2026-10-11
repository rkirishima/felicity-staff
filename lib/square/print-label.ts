// Square カタログから「ラベル印刷対象」の商品を取る共通処理。
// スタッフのラベル印刷UI (/api/catalog/label-items) と EC 自動印刷
// (/api/label-print-by-name) の両方がここを通る — 同じバグを2箇所で踏まないため。
//
// 【重要】custom_attribute_filters.string_filter の照合は Square 側で挙動が揺れる。
//   - 2026-09: 保存値そのもの「print_label = yes」で 0件、「yes」で通った
//   - 2026-10-08〜: 逆に「yes」で 0件、「print_label = yes」で通る
// どちらか一方に決め打ちすると、また黙ってラベル商品が全部消える。両方で検索して
// id でマージし、返ってきた custom_attribute_values を自前で再検証する。

export const PRINT_LABEL_ATTR_ID = 'X3QZMB3JYOIRV65E4ASKJQJF'

const SQUARE_SEARCH_URL = 'https://connect.squareup.com/v2/catalog/search-catalog-items'

export type SquareVariation = {
  id: string
  is_deleted?: boolean
  item_variation_data?: {
    name?: string
    sku?: string
    upc?: string
    price_money?: { amount?: number }
  }
}

export type SquareItem = {
  id: string
  is_deleted?: boolean
  is_archived?: boolean
  custom_attribute_values?: Record<string, {
    custom_attribute_definition_id?: string
    string_value?: string
  }>
  item_data?: {
    name?: string
    is_archived?: boolean
    variations?: SquareVariation[]
  }
}

// 保存されている値は "print_label = yes" (Square UI 経由) だが、"yes" だけの
// 個体もありうる。末尾が yes かどうかで判定し、"no" を弾く。
export function hasPrintLabelYes(item: SquareItem): boolean {
  const values = Object.values(item.custom_attribute_values ?? {})
  const attr = values.find(v => v.custom_attribute_definition_id === PRINT_LABEL_ATTR_ID)
  // 属性が返ってこないケースでは検索が絞った結果を信用する (誤って全除外しない)
  if (!attr?.string_value) return true
  return /(^|[\s=])yes$/i.test(attr.string_value.trim())
}

export class PrintLabelCatalogError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message)
    this.name = 'PrintLabelCatalogError'
  }
}

// 照合が揺れても拾えるよう、保存値そのものと値だけの両方で検索する。
const PRINT_LABEL_FILTERS = ['print_label = yes', 'yes']

async function searchByFilter(token: string, stringFilter: string): Promise<SquareItem[]> {
  const res = await fetch(SQUARE_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-01-18',
    },
    body: JSON.stringify({
      custom_attribute_filters: [{
        custom_attribute_definition_id: PRINT_LABEL_ATTR_ID,
        string_filter: stringFilter,
      }],
      limit: 100,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new PrintLabelCatalogError('Square catalog query failed', err)
  }

  const data = await res.json()
  return (data.items ?? []) as SquareItem[]
}

/** print_label=yes の商品を取得する。削除/アーカイブ済みは除外しない (呼び出し側の責務)。 */
export async function fetchPrintLabelItems(token: string): Promise<SquareItem[]> {
  const results = await Promise.all(PRINT_LABEL_FILTERS.map(f => searchByFilter(token, f)))
  const byId = new Map<string, SquareItem>()
  for (const item of results.flat()) {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }
  return [...byId.values()].filter(hasPrintLabelYes)
}
