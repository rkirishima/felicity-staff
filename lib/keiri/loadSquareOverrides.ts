import type { RevenueCategory } from './classifyRevenue'

// Loose interface — accepts both @supabase/supabase-js and SSR clients.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaLike = { from: (table: string) => any }

export async function loadSquareOverrides(sb: SupaLike): Promise<Map<string, RevenueCategory>> {
  const out = new Map<string, RevenueCategory>()
  try {
    const res = await sb
      .from('keiri_square_item_overrides')
      .select('item_name, revenue_category')
    if (res?.error || !res?.data) return out
    for (const r of res.data as Array<{ item_name: string; revenue_category: string }>) {
      out.set(r.item_name, r.revenue_category as RevenueCategory)
    }
  } catch {
    // table may not exist yet (migration 005 not applied) — return empty map
  }
  return out
}
