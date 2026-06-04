import { createClient } from '@/lib/supabase/server'

export type ExpenseRule = {
  keyword: string
  category_id: string
  tax_rate: number
  priority: number
  category_name?: string
}

export type ClassificationContext = {
  rules: ExpenseRule[]
  categoryByName: Map<string, string>
}

const EQUIPMENT_CATEGORIES = new Set([
  '工具器具備品',
  '一括償却資産',
  '少額減価償却資産',
])

export async function loadClassificationContext(): Promise<ClassificationContext> {
  const sb = await createClient()
  const [rulesRes, catsRes] = await Promise.all([
    sb
      .from('keiri_expense_rules')
      .select('keyword, category_id, tax_rate, priority, keiri_categories(name)')
      .eq('active', true)
      .order('priority', { ascending: true }),
    sb
      .from('keiri_categories')
      .select('id, name')
      .eq('type', 'expense')
      .eq('active', true),
  ])
  const rules = (rulesRes.data ?? []).map(r => {
    const cat = (r as { keiri_categories?: { name?: string } | { name?: string }[] }).keiri_categories
    const catName = Array.isArray(cat) ? cat[0]?.name : cat?.name
    return {
      keyword: r.keyword as string,
      category_id: r.category_id as string,
      tax_rate: Number(r.tax_rate ?? 10),
      priority: r.priority as number,
      category_name: catName,
    } as ExpenseRule
  })
  const map = new Map<string, string>()
  for (const c of (catsRes.data ?? []) as Array<{ id: string; name: string }>) {
    map.set(c.name, c.id)
  }
  return { rules, categoryByName: map }
}

export async function loadExpenseRules(): Promise<ExpenseRule[]> {
  const ctx = await loadClassificationContext()
  return ctx.rules
}

function applyEquipmentTier(
  categoryName: string | undefined,
  amount: number,
  ctx: ClassificationContext,
): string | null {
  if (!categoryName || !EQUIPMENT_CATEGORIES.has(categoryName)) return null
  const consum = ctx.categoryByName.get('消耗品費')
  const ikkatsu = ctx.categoryByName.get('一括償却資産')
  const shougaku = ctx.categoryByName.get('少額減価償却資産')
  const koguki = ctx.categoryByName.get('工具器具備品')
  if (amount < 100_000) return consum ?? null
  if (amount < 200_000) return ikkatsu ?? null
  if (amount < 300_000) return shougaku ?? null
  return koguki ?? null
}

export function classifyExpenseItem(
  itemName: string,
  rules: ExpenseRule[],
): { category_id: string; tax_rate: number; matched_keyword: string } | null {
  const lower = (itemName || '').toLowerCase()
  for (const r of rules) {
    if (lower.includes(r.keyword.toLowerCase())) {
      return { category_id: r.category_id, tax_rate: r.tax_rate, matched_keyword: r.keyword }
    }
  }
  return null
}

export function classifyExpenseItemWithAmount(
  itemName: string,
  amount: number,
  ctx: ClassificationContext,
): { category_id: string; tax_rate: number; matched_keyword: string; tier_applied?: boolean } | null {
  const base = classifyExpenseItem(itemName, ctx.rules)
  if (!base) return null
  const matchedRule = ctx.rules.find(r => r.keyword === base.matched_keyword)
  const tierId = applyEquipmentTier(matchedRule?.category_name, amount, ctx)
  if (tierId && tierId !== base.category_id) {
    return { ...base, category_id: tierId, tier_applied: true }
  }
  return base
}
