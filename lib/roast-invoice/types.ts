/**
 * FCR月次請求書(焙煎ログベース)関連の型定義。
 */

export type RoastLogRow = {
  id: string
  roasted_at: string // ISO with TZ
  bean_id: string
  green_kg: number
  bean_raw?: string | null
}

export type BeanRow = {
  id: string
  display_name: string
}

export type BeanPriceRow = {
  bean_id: string
  effective_from: string // YYYY-MM-DD
  yen_per_kg: number
}

export type InvoiceLineItem = {
  product: string
  bean_id: string
  batches: number
  kg: number
  green_unit_price: number
  green_amount: number
  roast_amount: number
}

export type MonthlyInvoiceData = {
  year: number
  month: number
  items: InvoiceLineItem[]
  bean_subtotal: number
  roast_subtotal: number
  subtotal: number      // 税抜
  tax: number           // 8%
  total: number         // 税込
}

export const ROASTING_FEE_YEN_PER_KG = 1000
export const TAX_RATE = 0.08

export const ISSUER = {
  name: 'FELICITY COFFEE ROASTERS',
  address_lines: ['〒240-0115', '神奈川県三浦郡葉山町上山口2432-3'],
  tel: 'TEL: 090-8879-1313',
  tax_id: '登録番号: T1013201015120',
  bank: [
    'お振込先: PayPay銀行(0033) ビジネス営業部(005)',
    '　　　　 普通預金 1818786',
    '口座名義: カ）フェリシティコーヒーロースターズ',
  ],
} as const

export const FELICITY_CLIENT_ID = 'ebf8663d-5442-4f7f-9112-394fb2ceb60b' // keiri_clients(株式会社FELICITY)
