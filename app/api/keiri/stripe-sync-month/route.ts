import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

type OrderItem = {
  id?: string | null
  name?: string | null
  qty?: number | null
  quantity?: number | null
  price?: number | null
}

type Order = {
  id: string
  amount: number
  status: string
  items: OrderItem[] | null
  payment_method: string | null
  created_at: string
}

type SkuMaster = {
  sku_id: string
  name: string
  price: number
  tax_rate: number
  classification: string
}

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

function classifyByName(id: string | null | undefined, name: string | null | undefined): { tax_rate: number | null; classification: string } {
  const idLower = (id ?? '').toLowerCase()
  const nameLower = (name ?? '').toLowerCase()
  const blob = `${idLower} ${nameLower}`
  if (idLower.startsWith('drip-') || blob.includes('drip pack') || blob.includes('ドリップパック')) {
    return { tax_rate: 8, classification: 'drip_pack' }
  }
  // ペットフードは人の食用でないため軽減税率対象外 (10%) — 食品判定より先に見る
  if (blob.includes('jerky') || blob.includes('ジャーキー')) {
    return { tax_rate: 10, classification: 'pet_food' }
  }
  if (idLower.startsWith('coffee-') || /\b\d+g\b/.test(nameLower) || nameLower.includes('coffee')) {
    return { tax_rate: 8, classification: 'coffee_beans' }
  }
  if (blob.includes('maple') || blob.includes('syrup') || blob.includes('メープル') ||
      blob.includes('honey') || blob.includes('はちみつ')) {
    return { tax_rate: 8, classification: 'food_other' }
  }
  if (idLower.startsWith('tshirt-') || idLower.startsWith('sweatshirt-') ||
      blob.includes('shirt') || blob.includes('hoodie') || blob.includes('パーカー') ||
      blob.includes('beanie') || blob.includes('ビーニー') || blob.includes('スウェット')) {
    return { tax_rate: 10, classification: 'apparel' }
  }
  if (blob.includes('tumbler') || blob.includes('cap') || blob.includes('mug') ||
      blob.includes('タンブラー') || blob.includes('キャップ') || blob.includes('マグ')) {
    return { tax_rate: 10, classification: 'goods' }
  }
  return { tax_rate: null, classification: 'other' }
}

export async function GET(req: Request): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }

  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? thisMonthJST()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const beginIso = new Date(`${month}-01T00:00:00+09:00`).toISOString()
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const endIso = new Date(`${nextMonth}-01T00:00:00+09:00`).toISOString()

  const sb = createClient(supabaseUrl, serviceKey)

  const { data: orders, error: ordErr } = await sb
    .from('orders')
    .select('id, amount, status, items, payment_method, created_at')
    .in('status', ['paid', 'shipped', 'completed'])
    .gte('created_at', beginIso)
    .lt('created_at', endIso)
  if (ordErr) {
    return NextResponse.json({ error: ordErr.message, detail: 'orders fetch failed' }, { status: 500 })
  }

  const { data: masterRows, error: mErr } = await sb
    .from('keiri_sku_master')
    .select('sku_id, name, price, tax_rate, classification')
    .eq('active', true)
  if (mErr) {
    return NextResponse.json({ error: mErr.message, detail: 'sku master fetch failed' }, { status: 500 })
  }
  const master = new Map<string, SkuMaster>()
  for (const r of (masterRows ?? []) as SkuMaster[]) master.set(r.sku_id, r)

  const lineRows: Record<string, unknown>[] = []
  const taxBreakdown: Record<string, { gross: number; count: number }> = {}
  let unmatched = 0
  let mixedSplit = 0

  for (const o of (orders ?? []) as Order[]) {
    const createdJst = new Date(new Date(o.created_at).getTime() + 9 * 60 * 60 * 1000)
    const dateJst = createdJst.toISOString().slice(0, 10)
    const items = o.items ?? []
    if (items.length === 0) continue

    const enriched = items.map((it, idx) => {
      const sku = it.id ?? null
      const master_match = sku ? master.get(sku) : undefined
      const qty = (it.qty ?? it.quantity ?? 1) as number
      const unit = master_match?.price ?? (it.price ?? null)
      let tax_rate = master_match?.tax_rate ?? null
      let classification = master_match?.classification ?? null
      if (tax_rate === null) {
        const guessed = classifyByName(sku, it.name)
        tax_rate = guessed.tax_rate
        classification = guessed.classification
      }
      return { idx, sku, name: it.name ?? null, qty, unit, tax_rate, classification }
    })

    // Compute line amount
    const knownTotal = enriched.reduce((s, e) => s + (e.unit ? e.unit * e.qty : 0), 0)
    let totalForLines = o.amount
    let scale = 1
    if (knownTotal > 0 && Math.abs(knownTotal - o.amount) > 1) {
      scale = o.amount / knownTotal
    }

    for (const e of enriched) {
      let lineAmount: number
      if (e.unit !== null && e.unit !== undefined) {
        lineAmount = Math.round(e.unit * e.qty * scale)
      } else {
        const knownLineTotal = enriched
          .filter(x => x.unit !== null && x.unit !== undefined)
          .reduce((s, x) => s + (x.unit as number) * x.qty * scale, 0)
        const remaining = Math.max(0, o.amount - Math.round(knownLineTotal))
        const unknownCount = enriched.filter(x => x.unit === null || x.unit === undefined).length
        lineAmount = unknownCount > 0 ? Math.round(remaining / unknownCount) : 0
        unmatched++
      }

      if (e.tax_rate !== null) {
        const key = String(e.tax_rate)
        const cur = taxBreakdown[key] ?? { gross: 0, count: 0 }
        cur.gross += lineAmount
        cur.count += 1
        taxBreakdown[key] = cur
      } else {
        const cur = taxBreakdown['unknown'] ?? { gross: 0, count: 0 }
        cur.gross += lineAmount
        cur.count += 1
        taxBreakdown['unknown'] = cur
      }

      lineRows.push({
        order_id: o.id,
        session_id: o.id,
        line_index: e.idx,
        product_id: e.sku,
        product_name: e.name,
        quantity: e.qty,
        amount: lineAmount,
        tax_rate: e.tax_rate,
        classification: e.classification,
        date: dateJst,
        created_at_jst: o.created_at,
        raw: { source_item: items[e.idx], scaled: scale !== 1 },
        synced_at: new Date().toISOString(),
      })
    }
    if (scale !== 1) mixedSplit++
  }

  if (lineRows.length > 0) {
    const { error: upErr } = await sb
      .from('keiri_stripe_line_items')
      .upsert(lineRows, { onConflict: 'session_id,line_index' })
    if (upErr) {
      return NextResponse.json({ error: upErr.message, detail: 'line items upsert failed' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    month,
    orders: orders?.length ?? 0,
    lineItemsWritten: lineRows.length,
    unmatched,
    mixedSplit,
    taxBreakdown,
  })
}
