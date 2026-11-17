import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import { sendTelegramMessage } from '@/lib/telegram'
import {
  fetchPrintLabelItems,
  PrintLabelCatalogError,
  type SquareItem,
  type SquareVariation,
} from '@/lib/square/print-label'

// レジ(Square POS)で豆が売れたら、ラベル印刷キューに自動投入する (1分ごと)。
//
// 以前は Square webhook → Cloudflare Tunnel → Pi の Flask が直接受けて印刷していたが、
// 2026-11 にこの経路が止まり (11/15 の El Salvador はスタッフが手で刷り直した)、
// Square 側の webhook 設定は今の権限では見えない。Square は失敗が続くと購読を
// 自動停止するし、トンネルや Pi の受信口が落ちても気づけない。
//
// そこで「こちらから取りに行く」形にする: Square の売上 (Orders) を直近 LOOKBACK
// ぶん検索し、print_label 対象の豆の明細を label_print_jobs に入れる。印刷は
// スタッフ画面と同じ Pi のキューポーラーが行うので、入口がトンネルに依存しない。
// cron が数回落ちても LOOKBACK 内なら次の実行で拾い直す。
//
// 二重印刷防止: dedupe_key = pos:{order_id}:{line_item_uid} を UNIQUE にして
// ON CONFLICT DO NOTHING。同じ明細を何度見ても1回しか入らない。
// EC (felicity.cafe) の注文も Square に同期されるが、そちらは label-print-by-name が
// 刷るので、source.name が POS のものだけを対象にする。

export const maxDuration = 60

const LOOKBACK_MS = 20 * 60 * 1000
const LOCATION_ID = 'L490B21JFZZNG'
const POS_SOURCE = 'Point of Sale'
const SQUARE_ORDERS_URL = 'https://connect.squareup.com/v2/orders/search'

type OrderLineItem = {
  uid: string
  name?: string
  variation_name?: string
  catalog_object_id?: string
  quantity: string
  modifiers?: Array<{ name?: string }>
}

type Order = {
  id: string
  closed_at?: string
  source?: { name?: string }
  line_items?: OrderLineItem[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// label-items / label-print-by-name と同じ表示名・擬似UPCの作り方に揃える
function normalizeName(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pseudoUpc(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return '200' + Math.abs(h).toString().padStart(9, '0').slice(0, 9)
}

function sizeToGrams(size: string): number {
  const m = size.match(/(\d+(?:\.\d+)?)\s*(kg|g)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  return m[2].toLowerCase() === 'kg' ? n * 1000 : n
}

async function searchRecentPosOrders(token: string, since: Date): Promise<Order[]> {
  const orders: Order[] = []
  let cursor: string | undefined
  do {
    const res = await fetch(SQUARE_ORDERS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-01-18',
      },
      body: JSON.stringify({
        location_ids: [LOCATION_ID],
        cursor,
        limit: 100,
        query: {
          filter: {
            state_filter: { states: ['COMPLETED'] },
            date_time_filter: { closed_at: { start_at: since.toISOString() } },
          },
          sort: { sort_field: 'CLOSED_AT', sort_order: 'ASC' },
        },
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Square orders search failed: ${res.status} ${JSON.stringify(err).slice(0, 300)}`)
    }
    const data = await res.json()
    orders.push(...((data.orders ?? []) as Order[]))
    cursor = data.cursor || undefined
  } while (cursor)
  return orders.filter(o => o.source?.name === POS_SOURCE)
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.SQUARE_ACCESS_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not configured' }, { status: 503 })
  }

  const since = new Date(Date.now() - LOOKBACK_MS)
  let orders: Order[]
  try {
    orders = await searchRecentPosOrders(token, since)
  } catch (err) {
    console.error('[pos-label-poll]', err)
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  // 豆の明細が無ければカタログは引かない (毎分のSquare呼び出しを1回に抑える)
  const candidates = orders.flatMap(o =>
    (o.line_items ?? [])
      .filter(li => li.catalog_object_id && sizeToGrams(li.variation_name ?? '') > 0)
      .map(li => ({ order: o, li })),
  )
  if (candidates.length === 0) {
    return NextResponse.json({ orders: orders.length, queued: 0 })
  }

  let catalog: SquareItem[]
  try {
    catalog = await fetchPrintLabelItems(token)
  } catch (err) {
    const detail = err instanceof PrintLabelCatalogError ? JSON.stringify(err.detail) : String(err)
    console.error('[pos-label-poll] catalog query failed:', detail)
    return NextResponse.json({ error: 'Square catalog query failed' }, { status: 502 })
  }

  const byVariation = new Map<string, { item: SquareItem; variation: SquareVariation }>()
  for (const item of catalog) {
    if (item.is_deleted || item.is_archived) continue
    for (const v of item.item_data?.variations ?? []) {
      if (!v.is_deleted) byVariation.set(v.id, { item, variation: v })
    }
  }

  const rows = []
  for (const { order, li } of candidates) {
    const hit = byVariation.get(li.catalog_object_id!)
    // print_label 対象外 (ドリップパック等以外の物販) は印刷しない。
    // 豆なのに属性が抜けているケースは label-catalog-audit が通知する。
    if (!hit) continue
    const size = hit.variation.item_variation_data?.name ?? li.variation_name ?? ''
    const grams = sizeToGrams(size)
    const ground = (li.modifiers ?? []).some(m => m.name === '粉')
    rows.push({
      dedupe_key: `pos:${order.id}:${li.uid}`,
      source: 'staff',
      payload: {
        product_name: normalizeName(hit.item.item_data?.name ?? li.name ?? ''),
        size,
        // 挽き方モディファイア「粉」→ 粉 (賞味期限2ヶ月)、それ以外は豆 (4ヶ月)
        type: ground ? 'ground' : 'bean',
        gtin: hit.variation.item_variation_data?.upc || pseudoUpc(hit.variation.id),
        quantity: Math.max(1, Math.min(99, parseInt(li.quantity, 10) || 1)),
        category: grams <= 10 ? 'drip' : grams >= 1000 ? 'wholesale' : 'retail',
        pos_order_id: order.id,
      },
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ orders: orders.length, queued: 0 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('label_print_jobs')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('dedupe_key')
  if (error) {
    console.error('[pos-label-poll] queue insert failed:', error)
    await sendTelegramMessage({
      text: `🏷❌ レジで売れた豆のラベルをキューに入れられませんでした\n${esc(error.message)}`,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ orders: orders.length, queued: data?.length ?? 0 })
}
