import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'

// Resolves EC order item names (e.g. "El Salvador Finca La Fany 200g") to
// Square catalog GTINs, then prints each via the Raspberry Pi. Called by the
// felicity-web EC confirm-order flow so labels print the moment a payment
// clears — same as ringing up a sale on POS.
//
// Input:  { items: [{ name: string, qty: number, grind?: 'whole'|'drip'|'espresso' }] }
// Output: { printed: [...], skipped: [...] }
//
// grind controls the printed label type / expiry: whole bean → 'bean' (4-month
// expiry), drip/espresso → 'powder' (2-month expiry). Same distinction the
// in-store Square POS "挽き方" modifier feeds to the Pi.

const PRINT_LABEL_ATTR_ID = 'X3QZMB3JYOIRV65E4ASKJQJF'

// Shared auth: EC app sends this header; we check it against LABEL_PRINT_SECRET.
const PRINT_SECRET_HEADER = 'x-label-print-secret'

function normalize(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .trim()
}

// Parse "El Salvador Finca La Fany 200g" into { baseName, size }
function parseItemName(fullName: string): { baseName: string; size: string | null } {
  const m = fullName.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:kg|g))\s*$/i)
  if (m) return { baseName: m[1].trim(), size: m[2].replace(/\s+/g, '').toLowerCase() }
  return { baseName: fullName.trim(), size: null }
}

function sizesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  return norm(a) === norm(b)
}

export async function POST(request: Request) {
  const secret = process.env.LABEL_PRINT_SECRET
  if (secret) {
    const provided = request.headers.get(PRINT_SECRET_HEADER)
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const squareToken = process.env.SQUARE_ACCESS_TOKEN
  if (!squareToken) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not configured' }, { status: 503 })
  }

  let body: { items?: Array<{ name: string; qty: number; grind?: 'whole' | 'drip' | 'espresso' }> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 })
  }

  // Fetch catalog once
  const catalogRes = await fetch('https://connect.squareup.com/v2/catalog/search-catalog-items', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${squareToken}`,
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

  if (!catalogRes.ok) {
    const err = await catalogRes.json().catch(() => ({}))
    console.error('Square catalog query failed:', err)
    return NextResponse.json({ error: 'Square catalog query failed' }, { status: 502 })
  }

  const catalog = await catalogRes.json()
  const squareItems = (catalog.items ?? []) as Array<{
    id: string
    is_deleted?: boolean
    is_archived?: boolean
    item_data?: {
      name?: string
      variations?: Array<{
        id: string
        is_deleted?: boolean
        item_variation_data?: {
          name?: string
          sku?: string
          upc?: string
        }
      }>
    }
  }>

  const printed: Array<{ name: string; gtin: string; qty: number }> = []
  const skipped: Array<{ name: string; reason: string }> = []

  for (const item of body.items) {
    const qty = Math.max(1, Math.floor(item.qty || 1))
    const { baseName, size } = parseItemName(item.name)
    if (!size) {
      skipped.push({ name: item.name, reason: 'no size suffix (e.g. " 200g") in name' })
      continue
    }

    const normBase = normalize(baseName)

    // Find a Square item whose normalized name contains — or is contained in —
    // the normalized base name. This handles:
    //   EC: "El Salvador Finca La Fany"  ↔  Square: "Ｅｌ Ｓａｌｖａｄｏｒ Ｆｉｎｃａ Ｌａ Ｆａｎｙ"
    //   EC: "Papua New Guinea"           ↔  Square: "Ｐａｐｕａ Ｎｅｗ Ｇｕｉｎｅａ Ｂａｒｏｉｄａ"
    let matchedItem: typeof squareItems[number] | null = null
    let matchedVariation: NonNullable<NonNullable<typeof squareItems[number]['item_data']>['variations']>[number] | null = null

    for (const sq of squareItems) {
      if (sq.is_deleted || sq.is_archived) continue
      const sqName = normalize(sq.item_data?.name ?? '')
      if (!sqName) continue
      // Match if either name contains the other (handles suffix variations)
      if (!sqName.includes(normBase) && !normBase.includes(sqName)) continue

      // Find the variation with matching size
      for (const v of (sq.item_data?.variations ?? [])) {
        if (v.is_deleted) continue
        const vSize = v.item_variation_data?.name ?? ''
        if (!sizesMatch(vSize, size)) continue
        matchedItem = sq
        matchedVariation = v
        break
      }
      if (matchedVariation) break
    }

    if (!matchedItem || !matchedVariation) {
      skipped.push({ name: item.name, reason: 'no Square catalog match' })
      continue
    }

    // Use real UPC if present, else synthesize a deterministic pseudo-UPC from
    // the variation ID (non-POS — label-use only, matches catalog/label-items).
    function pseudoUpc(seed: string): string {
      let h = 0
      for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
      return '200' + Math.abs(h).toString().padStart(9, '0').slice(0, 9)
    }
    const realUpc = matchedVariation.item_variation_data?.upc ?? ''
    const gtin = realUpc || pseudoUpc(matchedVariation.id!)
    const grams = parseFloat(size) * (/kg/i.test(size) ? 1000 : 1)
    const category: 'drip' | 'retail' | 'wholesale' =
      grams <= 10 ? 'drip' : grams >= 1000 ? 'wholesale' : 'retail'

    // Normalize Square name to half-width for the label
    const displayName = (matchedItem.item_data?.name ?? '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ')
      .trim()

    // Supabase キューへ投入 — Pi の felicity-queue poller が印刷する。
    // "printed" のキー名は felicity-web (EC) 側の互換のため維持 (実態は queued)。
    try {
      const supabase = createServiceClient()
      const { error } = await supabase.from('label_print_jobs').insert({
        payload: {
          product_name: displayName,
          // whole bean → 'bean' (4-month expiry); ground → 'powder' (2-month).
          type: item.grind && item.grind !== 'whole' ? 'powder' : 'bean',
          size,
          gtin,
          quantity: qty,
          category,
        },
        source: 'ec',
      })
      if (error) throw error
      printed.push({ name: item.name, gtin, qty })
    } catch (err) {
      skipped.push({ name: item.name, reason: `queue insert failed: ${String(err)}` })
    }
  }

  return NextResponse.json({ printed, skipped })
}
