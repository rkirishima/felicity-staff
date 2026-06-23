// 0% = 非課税・不課税・経費立替（高速代等）。消費税は付かないが請求総額には含む。
export type TaxRate = 10 | 8 | 0

export type TaxLine = {
  quantity: number
  unit_price: number
  tax_rate: TaxRate
}

export type TaxSummary = {
  subtotal_10: number
  subtotal_8: number
  tax_10: number
  tax_8: number
  total: number
}

export function lineAmount(line: TaxLine): number {
  return Math.trunc(line.quantity) * Math.trunc(line.unit_price)
}

export function groupByTaxRate(lines: TaxLine[]): TaxSummary {
  let subtotal_10 = 0
  let subtotal_8 = 0
  let subtotal_0 = 0
  for (const l of lines) {
    const amt = lineAmount(l)
    if (l.tax_rate === 10) subtotal_10 += amt
    else if (l.tax_rate === 8) subtotal_8 += amt
    else subtotal_0 += amt
  }
  const tax_10 = Math.round(subtotal_10 * 0.10)
  const tax_8 = Math.round(subtotal_8 * 0.08)
  // 0%対象は専用列を持たず total に含める。内訳が必要な箇所では
  // subtotal_0 = total - subtotal_10 - tax_10 - subtotal_8 - tax_8 で復元できる。
  const total = subtotal_10 + tax_10 + subtotal_8 + tax_8 + subtotal_0
  return { subtotal_10, subtotal_8, tax_10, tax_8, total }
}

export function backCalcTax(amountIncTax: number, rate: TaxRate): { exclTax: number; tax: number } {
  const amt = Math.trunc(amountIncTax)
  const exclTax = Math.round(amt / (1 + rate / 100))
  const tax = amt - exclTax
  return { exclTax, tax }
}
