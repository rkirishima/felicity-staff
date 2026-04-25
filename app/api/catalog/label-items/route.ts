import { NextResponse } from 'next/server'

// Returns all Square catalog items tagged with print_label=yes, normalized
// for label printing. Used by both the staff label UI and the EC confirm-order
// auto-print flow, so there's a single source of truth: Square.

const PRINT_LABEL_ATTR_ID = 'X3QZMB3JYOIRV65E4ASKJQJF'

// Hardcoded drip pack 10g items — Square print_label属性に依存しない。
// POSもGTINも登録済みなので、これらは固定で常時表示する。
const HARDCODED_DRIP_PACKS: LabelItem[] = [
  {
    itemId: 'QDQAUC3UUIT7RQXJQ6YFFLUD',
    name: 'コーヒードリップパック エチオピア',
    rawName: 'コーヒードリップパック　Ｅｔｈｉｏｐｉａ',
    category: 'drip',
    variations: [{
      variationId: 'YYMP3FC6UWIKQWPJYOSQNF45',
      sku: 'DPE-10',
      upc: '4595433537514',
      size: '10g',
      price: 220,
      type: 'ground',
    }],
  },
  {
    itemId: 'HM54ODEK23LASACBWONYFMLK',
    name: 'コーヒードリップパック グアテマラ',
    rawName: 'コーヒードリップパック　Ｇｕａｔｅｍａｌａ',
    category: 'drip',
    variations: [{
      variationId: 'D4QWGU44SVGW4KDMOUDEROHW',
      sku: 'GDP-10',
      upc: '4595433537521',
      size: '10g',
      price: 230,
      type: 'ground',
    }],
  },
  {
    itemId: '4DCQ4BZAARJEGAYFFWEAGYS3',
    name: 'コーヒードリップパック パプアニューギニア',
    rawName: 'コーヒードリップパック　Ｐａｐｕａ　Ｎｅｗ　Ｇｕｉｎｅａ',
    category: 'drip',
    variations: [{
      variationId: 'L4S4V7E22ODQGZQX2RTPK6A6',
      sku: 'PNG-DP-10',
      upc: '4595433537507',
      size: '10g',
      price: 250,
      type: 'ground',
    }],
  },
]


type Variation = {
  variationId: string
  sku: string
  upc: string
  size: string         // "10g" | "100g" | "200g" | "500g" | "1kg" etc.
  price: number        // JPY
  type: 'bean' | 'ground'
}

type LabelItem = {
  itemId: string
  name: string         // normalized display name (half-width)
  rawName: string      // Square's full-width name as stored
  category: 'drip' | 'retail' | 'wholesale'
  variations: Variation[]
}

// Square uses full-width characters. Normalize to ASCII for display/matching.
function normalizeName(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .trim()
}

// Generate a deterministic 12-digit pseudo-UPC from any string (for items
// without a real GTIN in Square). The printer's EAN-13 generator adds the
// check digit. Not POS-scannable — only for visual label barcodes.
function pseudoUpc(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  // Felicity prefix "200" (in-store use, EAN GS1 reserved range) + 9-digit hash
  const tail = Math.abs(h).toString().padStart(9, '0').slice(0, 9)
  return '200' + tail
}

function sizeToGrams(size: string): number {
  const m = size.match(/(\d+(?:\.\d+)?)\s*(kg|g)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  return m[2].toLowerCase() === 'kg' ? n * 1000 : n
}

function classifyCategory(grams: number, itemName: string): LabelItem['category'] {
  // Drip pack if 10g and name includes "drip" indicator (actually drips are
  // usually separate items — but to be safe, treat <=10g as drip)
  if (grams <= 10) return 'drip'
  if (grams >= 1000) return 'wholesale'
  return 'retail'
}

// Ground vs bean is encoded in Square either via SKU suffix or modifier.
// Default: retail 100g/200g/500g are beans. Drip 10g is ground. 1kg has both.
function inferType(sku: string, size: string): 'bean' | 'ground' {
  const s = sku.toLowerCase()
  if (s.includes('-g') || s.includes('ground')) return 'ground'
  if (size.match(/\b10g\b/i)) return 'ground'  // drip packs
  return 'bean'
}

export async function GET(request: Request) {
  const token = process.env.SQUARE_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not configured' }, { status: 503 })
  }

  const debug = new URL(request.url).searchParams.get('debug') === '1'

  try {
    const res = await fetch('https://connect.squareup.com/v2/catalog/search-catalog-items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18',
      },
      body: JSON.stringify({
        custom_attribute_filters: [{
          custom_attribute_definition_id: PRINT_LABEL_ATTR_ID,
          string_filter: 'print_label = yes',
        }],
        limit: 100,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Square catalog search failed:', err)
      return NextResponse.json({ error: 'Square catalog query failed' }, { status: 502 })
    }

    const data = await res.json()
    const items: LabelItem[] = []
    const skipped: Array<{ item: string; variation: string; reason: string }> = []

    for (const item of (data.items ?? [])) {
      if (item.is_deleted || item.is_archived) {
        skipped.push({ item: item.item_data?.name ?? item.id, variation: '-', reason: 'item deleted/archived' })
        continue
      }
      const rawName = item.item_data?.name ?? ''
      const name = normalizeName(rawName)

      const variations: Variation[] = []
      for (const v of (item.item_data?.variations ?? [])) {
        const vd = v.item_variation_data
        if (!vd || v.is_deleted) {
          skipped.push({ item: name, variation: vd?.name ?? v.id, reason: 'variation deleted' })
          continue
        }
        const size = vd.name ?? ''
        const realUpc = vd.upc ?? ''
        const sku = vd.sku ?? ''
        // Fall back to a deterministic pseudo-UPC (non-POS) for items without a real GTIN
        const upc = realUpc || pseudoUpc(v.id)
        if (!realUpc) {
          skipped.push({ item: name, variation: size || v.id, reason: `UPC未設定 → 擬似バーコード ${upc} を自動使用（ラベル印刷OK）` })
        }

        variations.push({
          variationId: v.id,
          sku,
          upc,
          size,
          price: vd.price_money?.amount ?? 0,
          type: inferType(sku, size),
        })
      }

      if (variations.length === 0) {
        skipped.push({ item: name, variation: '-', reason: 'all variations missing UPC' })
        continue
      }

      // Sort variations by gram weight ascending (100g, 200g, 500g, 1kg)
      variations.sort((a, b) => sizeToGrams(a.size) - sizeToGrams(b.size))

      // Category based on the "smallest" variation's size (or item name pattern)
      const smallestGrams = sizeToGrams(variations[0].size)
      const largestGrams = sizeToGrams(variations[variations.length - 1].size)
      const category: LabelItem['category'] =
        smallestGrams <= 10 ? 'drip' :
        largestGrams >= 1000 ? 'retail' :  // 1kg is also in "retail" here — we split by variation below
        'retail'

      items.push({
        itemId: item.id,
        name,
        rawName,
        category,
        variations,
      })
    }

    // Inject hardcoded drip pack items if not already present (Square print_label属性の有無に関わらず)
    for (const drip of HARDCODED_DRIP_PACKS) {
      if (!items.some(i => i.itemId === drip.itemId)) {
        items.push(drip)
      }
    }

    // Sort items alphabetically by display name
    items.sort((a, b) => a.name.localeCompare(b.name))

    if (debug) {
      return NextResponse.json({
        items,
        skipped,
        totalSquareItems: (data.items ?? []).length,
        tip: 'Squareで「print_label=yes」属性とUPC/GTINの両方を設定してください',
      })
    }
    return NextResponse.json({ items })
  } catch (err) {
    console.error('Catalog fetch error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
