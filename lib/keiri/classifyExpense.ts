import { createClient } from '@/lib/supabase/server'

export type ExpenseRule = {
  keyword: string
  category_id: string
  tax_rate: number
  priority: number
  category_name?: string
}

export async function loadExpenseRules(): Promise<ExpenseRule[]> {
  const sb = await createClient()
  const { data, error } = await sb
    .from('keiri_expense_rules')
    .select('keyword, category_id, tax_rate, priority, keiri_categories(name)')
    .eq('active', true)
    .order('priority', { ascending: true })
  if (error) return []
  return (data ?? []).map(r => {
    const cat = (r as { keiri_categories?: { name?: string } | { name?: string }[] }).keiri_categories
    const catName = Array.isArray(cat) ? cat[0]?.name : cat?.name
    return {
      keyword: r.keyword as string,
      category_id: r.category_id as string,
      tax_rate: Number(r.tax_rate ?? 10),
      priority: r.priority as number,
      category_name: catName,
    }
  })
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
