// Square カタログの税割り当てを監査・一括修正する API。
//
// GET  : 税一覧 + 全商品の現在の税割り当てと推奨区分(標準10% / 軽減8%)を返す
// POST : { action: 'apply', std10TaxId, red8TaxId, assignments: [{ itemId, target }] }
//          → 各商品の税を target 1つだけに揃える(他の消費税は全て外す)
//        { action: 'custom_flags', onTaxId }
//          → 「任意の金額に税金を適用」を onTaxId のみ ON に揃える
import { requireKeiri } from '@/lib/auth/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { effectiveRevenueCategory } from '@/lib/keiri/classifyRevenue'
import { loadSquareOverrides } from '@/lib/keiri/loadSquareOverrides'
import { fetchCatalog, setCustomAmountFlags, updateItemTaxes } from '@/lib/keiri/squareCatalog'

export const runtime = 'nodejs'
export const maxDuration = 60

type TaxTarget = 'std10' | 'red8'

function requireToken(): string | null {
  return process.env.SQUARE_ACCESS_TOKEN ?? null
}

export async function GET(): Promise<Response> {
  const denied = await requireKeiri()
  if (denied) return denied
  const token = requireToken()
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not set' }, { status: 503 })
  }

  try {
    const { taxes, items } = await fetchCatalog(token)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const overrides =
      supabaseUrl && serviceKey
        ? await loadSquareOverrides(createClient(supabaseUrl, serviceKey))
        : undefined

    const rateByTaxId = new Map<string, number | null>()
    for (const t of taxes) rateByTaxId.set(t.id, t.rate)

    const out = items.map(item => {
      const rates = Array.from(
        new Set(item.taxIds.map(id => rateByTaxId.get(id)).filter((r): r is number => r != null)),
      )
      const currentRate = rates.length === 1 ? rates[0] : null
      const rc = effectiveRevenueCategory(
        { tax_rate: currentRate, item_name: item.name, category: item.categoryName },
        overrides,
      )
      const proposal: TaxTarget | null =
        rc === 'dine_in_10' || rc === 'goods_10'
          ? 'std10'
          : rc === 'beans_8' || rc === 'takeout_8'
            ? 'red8'
            : null
      return {
        id: item.id,
        name: item.name,
        category: item.categoryName,
        tax_ids: item.taxIds,
        revenue_category: rc,
        proposal,
      }
    })

    return NextResponse.json({ taxes, items: out })
  } catch (e) {
    return NextResponse.json(
      { error: 'Square catalog audit failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

type ApplyBody = {
  action?: string
  std10TaxId?: string
  red8TaxId?: string
  assignments?: Array<{ itemId?: string; target?: string }>
  onTaxId?: string
}

export async function POST(req: Request): Promise<Response> {
  const denied = await requireKeiri()
  if (denied) return denied
  const token = requireToken()
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not set' }, { status: 503 })
  }

  let body: ApplyBody
  try {
    body = (await req.json()) as ApplyBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  try {
    if (body.action === 'custom_flags') {
      if (!body.onTaxId) {
        return NextResponse.json({ error: 'onTaxId required' }, { status: 400 })
      }
      const changed = await setCustomAmountFlags(token, body.onTaxId)
      return NextResponse.json({ ok: true, changed })
    }

    if (body.action === 'apply') {
      const { std10TaxId, red8TaxId } = body
      if (!std10TaxId || !red8TaxId || std10TaxId === red8TaxId) {
        return NextResponse.json({ error: 'std10TaxId / red8TaxId required and must differ' }, { status: 400 })
      }
      const assignments = (body.assignments ?? []).filter(
        (a): a is { itemId: string; target: TaxTarget } =>
          typeof a.itemId === 'string' && (a.target === 'std10' || a.target === 'red8'),
      )
      if (assignments.length === 0) {
        return NextResponse.json({ error: 'assignments empty' }, { status: 400 })
      }

      // 存在する全消費税IDを取得し、target 以外は全て外す(重複税の掃除も兼ねる)
      const { taxes } = await fetchCatalog(token)
      const allTaxIds = taxes.map(t => t.id)

      const std10Items = assignments.filter(a => a.target === 'std10').map(a => a.itemId)
      const red8Items = assignments.filter(a => a.target === 'red8').map(a => a.itemId)

      if (std10Items.length > 0) {
        await updateItemTaxes(token, std10Items, [std10TaxId], allTaxIds.filter(id => id !== std10TaxId))
      }
      if (red8Items.length > 0) {
        await updateItemTaxes(token, red8Items, [red8TaxId], allTaxIds.filter(id => id !== red8TaxId))
      }

      return NextResponse.json({ ok: true, std10: std10Items.length, red8: red8Items.length })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: 'Square catalog update failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
