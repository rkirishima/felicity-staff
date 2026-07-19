// Square Catalog API ヘルパー(税一括設定用)。
// SQUARE_ACCESS_TOKEN を使うため server(route handler)からのみ import すること。

const SQUARE_BASE = 'https://connect.squareup.com/v2'
const SQUARE_VERSION = '2024-01-18'

function squareHeaders(token: string): Record<string, string> {
  return {
    'Square-Version': SQUARE_VERSION,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

export type CatalogTax = {
  id: string
  name: string
  // Square は percentage を文字列("10.0")で返す。丸めた整数(10/8)も持つ。
  percentage: string
  rate: number | null
  inclusionType: string | null
  appliesToCustomAmounts: boolean
  enabled: boolean
  version: number
}

export type CatalogItem = {
  id: string
  name: string
  categoryName: string | null
  taxIds: string[]
}

type RawCatalogObject = {
  type: string
  id: string
  version?: number
  is_deleted?: boolean
  tax_data?: {
    name?: string
    percentage?: string
    inclusion_type?: string
    applies_to_custom_amounts?: boolean
    enabled?: boolean
  }
  category_data?: { name?: string }
  item_data?: {
    name?: string
    is_archived?: boolean
    category_id?: string
    categories?: Array<{ id?: string }>
    tax_ids?: string[]
  }
}

export async function fetchCatalog(token: string): Promise<{ taxes: CatalogTax[]; items: CatalogItem[] }> {
  const objects: RawCatalogObject[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const u = new URL(`${SQUARE_BASE}/catalog/list`)
    u.searchParams.set('types', 'ITEM,CATEGORY,TAX')
    if (cursor) u.searchParams.set('cursor', cursor)
    const res = await fetch(u.toString(), { headers: squareHeaders(token) })
    if (!res.ok) {
      throw new Error(`Square catalog list failed: ${await res.text()}`)
    }
    const data = (await res.json()) as { objects?: RawCatalogObject[]; cursor?: string }
    if (data.objects) objects.push(...data.objects)
    cursor = data.cursor
    pages++
    if (pages > 50) break
  } while (cursor)

  const categoryName = new Map<string, string>()
  for (const o of objects) {
    if (o.type === 'CATEGORY' && !o.is_deleted && o.category_data?.name) {
      categoryName.set(o.id, o.category_data.name)
    }
  }

  const taxes: CatalogTax[] = []
  for (const o of objects) {
    if (o.type !== 'TAX' || o.is_deleted) continue
    const pct = o.tax_data?.percentage ?? ''
    const parsed = parseInt(pct, 10)
    taxes.push({
      id: o.id,
      name: o.tax_data?.name ?? '(無名)',
      percentage: pct,
      rate: Number.isNaN(parsed) ? null : parsed,
      inclusionType: o.tax_data?.inclusion_type ?? null,
      appliesToCustomAmounts: o.tax_data?.applies_to_custom_amounts ?? false,
      enabled: o.tax_data?.enabled ?? false,
      version: o.version ?? 0,
    })
  }

  const items: CatalogItem[] = []
  for (const o of objects) {
    if (o.type !== 'ITEM' || o.is_deleted) continue
    if (o.item_data?.is_archived) continue
    const catId = o.item_data?.categories?.[0]?.id ?? o.item_data?.category_id ?? null
    items.push({
      id: o.id,
      name: o.item_data?.name ?? '(無名)',
      categoryName: catId ? categoryName.get(catId) ?? null : null,
      taxIds: o.item_data?.tax_ids ?? [],
    })
  }

  return { taxes, items }
}

// 商品の税割り当てを一括変更する。item_ids は 1 リクエスト最大 1000 件。
export async function updateItemTaxes(
  token: string,
  itemIds: string[],
  taxesToEnable: string[],
  taxesToDisable: string[],
): Promise<void> {
  for (let i = 0; i < itemIds.length; i += 1000) {
    const chunk = itemIds.slice(i, i + 1000)
    const res = await fetch(`${SQUARE_BASE}/catalog/update-item-taxes`, {
      method: 'POST',
      headers: squareHeaders(token),
      body: JSON.stringify({
        item_ids: chunk,
        taxes_to_enable: taxesToEnable,
        taxes_to_disable: taxesToDisable,
      }),
    })
    if (!res.ok) {
      throw new Error(`Square update-item-taxes failed: ${await res.text()}`)
    }
  }
}

// 「任意の金額に税金を適用」フラグを、onTaxId のみ ON・他は OFF に揃える。
// 返り値は実際に変更した税の名前。
export async function setCustomAmountFlags(token: string, onTaxId: string): Promise<string[]> {
  const listRes = await fetch(`${SQUARE_BASE}/catalog/list?types=TAX`, {
    headers: squareHeaders(token),
  })
  if (!listRes.ok) {
    throw new Error(`Square tax list failed: ${await listRes.text()}`)
  }
  const data = (await listRes.json()) as { objects?: RawCatalogObject[] }
  const changed: string[] = []
  for (const o of data.objects ?? []) {
    if (o.type !== 'TAX' || o.is_deleted || !o.tax_data) continue
    const want = o.id === onTaxId
    if ((o.tax_data.applies_to_custom_amounts ?? false) === want) continue
    const res = await fetch(`${SQUARE_BASE}/catalog/object`, {
      method: 'POST',
      headers: squareHeaders(token),
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        object: {
          ...o,
          tax_data: { ...o.tax_data, applies_to_custom_amounts: want },
        },
      }),
    })
    if (!res.ok) {
      throw new Error(`Square tax upsert failed (${o.tax_data.name}): ${await res.text()}`)
    }
    changed.push(o.tax_data.name ?? o.id)
  }
  return changed
}
