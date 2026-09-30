// Square カタログから「ラベル印刷対象」の商品を取る共通処理。
// スタッフのラベル印刷UI (/api/catalog/label-items) と EC 自動印刷
// (/api/label-print-by-name) の両方がここを通る — 同じバグを2箇所で踏まないため。
//
// 【重要】custom_attribute_filters.string_filter に渡すのは「値」であって
// 「print_label = yes」という式ではない。Square 側の照合がいつからか厳格になり、
// 式を渡すと 0件 になる (2026-09 に発覚。それまでは通っていた)。
// 値だけで絞ったうえで、返ってきた custom_attribute_values を自前で再検証する。

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

/** print_label=yes の商品を取得する。削除/アーカイブ済みは除外しない (呼び出し側の責務)。 */
export async function fetchPrintLabelItems(token: string): Promise<SquareItem[]> {
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
        string_filter: 'yes',
      }],
      limit: 100,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new PrintLabelCatalogError('Square catalog query failed', err)
  }

  const data = await res.json()
  return ((data.items ?? []) as SquareItem[]).filter(hasPrintLabelYes)
}
