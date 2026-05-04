export type TaxRate = 10 | 8

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
  for (const l of lines) {
    const amt = lineAmount(l)
    if (l.tax_rate === 10) subtotal_10 += amt
    else if (l.tax_rate === 8) subtotal_8 += amt
  }
  const tax_10 = Math.round(subtotal_10 * 0.10)
  const tax_8 = Math.round(subtotal_8 * 0.08)
  const total = subtotal_10 + tax_10 + subtotal_8 + tax_8
  return { subtotal_10, subtotal_8, tax_10, tax_8, total }
}

export function backCalcTax(amountIncTax: number, rate: TaxRate): { exclTax: number; tax: number } {
  const amt = Math.trunc(amountIncTax)
  const exclTax = Math.round(amt / (1 + rate / 100))
  const tax = amt - exclTax
  return { exclTax, tax }
}
