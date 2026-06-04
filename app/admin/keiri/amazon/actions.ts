'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { loadClassificationContext, classifyExpenseItemWithAmount } from '@/lib/keiri/classifyExpense'

type ParsedItem = {
  order_id: string
  order_date: string
  item_name: string
  asin: string | null
  category: string | null
  quantity: number
  unit_price: number
  total_amount: number
  tax_amount: number | null
  total_charged: number | null
  payment_instrument: string | null
  buyer: string | null
  account_user: string | null
}

function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return 'utf-8'
  } catch {
    return 'shift_jis'
  }
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        cur += c
      }
    } else {
      if (c === ',') {
        cells.push(cur)
        cur = ''
      } else if (c === '"' && cur === '') {
        inQuotes = true
      } else {
        cur += c
      }
    }
  }
  cells.push(cur)
  return cells.map(c => c.trim())
}

function parseNum(s: string | undefined): number {
  if (!s) return 0
  const cleaned = s.replace(/[,¥$\s　]/g, '')
  if (!cleaned || cleaned === '-') return 0
  const n = parseFloat(cleaned)
  if (isNaN(n)) return 0
  return Math.round(n)
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function parseAmazonCsv(text: string): ParsedItem[] {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV にデータがありません')

  const rows = lines.map(parseCsvLine)
  const header = rows[0]
  const lowerHeader = header.map(h => h.toLowerCase())

  function findCol(...keywords: string[]): number {
    for (let i = 0; i < header.length; i++) {
      const h = header[i]
      const lh = lowerHeader[i]
      if (keywords.some(k => h.includes(k) || lh.includes(k.toLowerCase()))) return i
    }
    return -1
  }

  const colOrderId = findCol('Order ID', 'order id', '注文番号', 'order-id')
  const colOrderDate = findCol('Order Date', 'order date', '注文日', 'purchase date')
  const colItemName = findCol('Title', 'Product Title', 'Item Name', '商品名', 'description')
  const colAsin = findCol('ASIN', 'asin')
  const colQty = findCol('Quantity', 'Item Quantity', '数量', 'qty')
  const colUnit = findCol('Item Subtotal', 'Item Price', 'Item Unit Price', '商品小計', 'unit price')
  const colTotal = findCol('Item Total', 'Total Charged', 'Total', '合計', 'item subtotal')
  const colTaxAmt = findCol('Item Subtotal Tax', 'Tax', '税金', '消費税', 'item tax')
  const colCategory = findCol('Category', 'カテゴリ')
  const colPayment = findCol('Payment Instrument Type', '支払い方法', 'payment')
  const colBuyer = findCol('Buyer Name', '注文者', 'buyer')
  const colAccount = findCol('Account User', 'ユーザー', 'account')

  if (colOrderId < 0) throw new Error(`Order ID カラムが見つかりません。検出ヘッダ: [${header.join(' | ')}]`)
  if (colOrderDate < 0) throw new Error(`Order Date カラムが見つかりません。検出ヘッダ: [${header.join(' | ')}]`)
  if (colItemName < 0) throw new Error(`Title カラムが見つかりません。検出ヘッダ: [${header.join(' | ')}]`)

  const items: ParsedItem[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(c => !c.trim())) continue
    const order_id = row[colOrderId]?.trim()
    const order_date = parseDate(row[colOrderDate])
    const item_name = row[colItemName]?.trim()
    if (!order_id || !order_date || !item_name) continue

    const qty = colQty >= 0 ? Math.max(1, parseNum(row[colQty])) : 1
    const unit = colUnit >= 0 ? parseNum(row[colUnit]) : 0
    const total = colTotal >= 0 ? parseNum(row[colTotal]) : unit * qty
    const tax_amount = colTaxAmt >= 0 ? parseNum(row[colTaxAmt]) : null

    items.push({
      order_id,
      order_date,
      item_name,
      asin: colAsin >= 0 ? (row[colAsin]?.trim() || null) : null,
      category: colCategory >= 0 ? (row[colCategory]?.trim() || null) : null,
      quantity: qty,
      unit_price: unit > 0 ? unit : (total > 0 ? Math.round(total / qty) : 0),
      total_amount: total > 0 ? total : unit * qty,
      tax_amount,
      total_charged: null,
      payment_instrument: colPayment >= 0 ? (row[colPayment]?.trim() || null) : null,
      buyer: colBuyer >= 0 ? (row[colBuyer]?.trim() || null) : null,
      account_user: colAccount >= 0 ? (row[colAccount]?.trim() || null) : null,
    })
  }
  return items
}

export async function importAmazonCsv(formData: FormData): Promise<{
  inserted_orders: number
  inserted_items: number
  skipped_orders: number
  unclassified: number
  total_items: number
  bank_matched: number
}> {
  const file = formData.get('file') as File | null
  if (!file) throw new Error('ファイルがありません')

  const buffer = await file.arrayBuffer()
  const encoding = detectEncoding(buffer)
  const text = new TextDecoder(encoding).decode(buffer)
  const items = parseAmazonCsv(text)
  if (items.length === 0) throw new Error('取込可能な明細がありません')

  const sb = await createClient()
  const ctx = await loadClassificationContext()

  // Load learned overrides (manually-categorized items remembered for future imports)
  const { data: overrideRows } = await sb
    .from('keiri_amazon_item_overrides')
    .select('item_name, asin, category_id, tax_rate')
  const overrideByName = new Map<string, { category_id: string; tax_rate: number | null }>()
  const overrideByAsin = new Map<string, { category_id: string; tax_rate: number | null }>()
  for (const o of (overrideRows ?? []) as Array<{ item_name: string; asin: string | null; category_id: string; tax_rate: number | null }>) {
    overrideByName.set(o.item_name, { category_id: o.category_id, tax_rate: o.tax_rate })
    if (o.asin) overrideByAsin.set(o.asin, { category_id: o.category_id, tax_rate: o.tax_rate })
  }

  // Group by order_id
  const orderMap = new Map<string, ParsedItem[]>()
  for (const it of items) {
    const arr = orderMap.get(it.order_id) ?? []
    arr.push(it)
    orderMap.set(it.order_id, arr)
  }

  // Check existing orders
  const orderIds = Array.from(orderMap.keys())
  const { data: existing } = await sb
    .from('keiri_amazon_orders')
    .select('order_id')
    .in('order_id', orderIds)
  const existingIds = new Set((existing ?? []).map(r => r.order_id as string))

  let insertedOrders = 0
  let insertedItems = 0
  let skippedOrders = 0
  let unclassified = 0
  let bankMatched = 0

  for (const [orderId, lineItems] of orderMap) {
    if (existingIds.has(orderId)) {
      skippedOrders++
      continue
    }
    const first = lineItems[0]
    const orderTotal = lineItems.reduce((s, it) => s + it.total_amount, 0)
    const orderTax = lineItems.reduce((s, it) => s + (it.tax_amount ?? 0), 0)

    const { error: orderErr } = await sb.from('keiri_amazon_orders').insert({
      order_id: orderId,
      order_date: first.order_date,
      total_amount: orderTotal,
      tax_amount: orderTax || null,
      payment_instrument: first.payment_instrument,
      buyer: first.buyer,
      account_user: first.account_user,
      source_file: file.name,
    })
    if (orderErr) {
      if (!orderErr.message.includes('duplicate')) throw new Error(orderErr.message)
      skippedOrders++
      continue
    }
    insertedOrders++

    const itemRows = lineItems.map(it => {
      const learned = (it.asin && overrideByAsin.get(it.asin)) || overrideByName.get(it.item_name)
      let categoryId: string | null = null
      let taxRate: number | null = null
      let source: 'auto' | 'learned' = 'auto'
      if (learned) {
        categoryId = learned.category_id
        taxRate = learned.tax_rate ?? null
        source = 'learned'
      } else {
        const cls = classifyExpenseItemWithAmount(it.item_name, it.total_amount, ctx)
        if (cls) {
          categoryId = cls.category_id
          taxRate = cls.tax_rate
        } else {
          unclassified++
        }
      }
      return {
        order_id: orderId,
        asin: it.asin,
        item_name: it.item_name,
        category: it.category,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_amount: it.total_amount,
        tax_rate: taxRate,
        tax_amount: it.tax_amount,
        expense_category_id: categoryId,
        classification_source: source,
      }
    })
    const { error: itemErr } = await sb.from('keiri_amazon_order_items').insert(itemRows)
    if (itemErr) throw new Error(itemErr.message)
    insertedItems += itemRows.length

    // Insert one keiri_transactions row per order (consolidated expense)
    const firstCategoryId = itemRows.find(r => r.expense_category_id)?.expense_category_id ?? null
    const firstTaxRate = itemRows.find(r => r.tax_rate)?.tax_rate ?? 10
    const itemSummary = lineItems.length === 1
      ? lineItems[0].item_name
      : `${lineItems[0].item_name} 他${lineItems.length - 1}点`

    const { data: txn, error: txnErr } = await sb
      .from('keiri_transactions')
      .insert({
        date: first.order_date,
        type: 'expense',
        amount: orderTotal,
        tax_amount: orderTax || null,
        tax_category: firstTaxRate === 8 ? '軽減8' : '物販10',
        category_id: firstCategoryId,
        vendor: 'Amazon Business',
        description: itemSummary,
        payment_method: first.payment_instrument || 'debit',
        source: 'amazon_business',
        source_ref: orderId,
      })
      .select('id')
      .single()
    if (txnErr) throw new Error(txnErr.message)

    // Try to match against an existing bank debit row (same amount, ±5 days)
    if (txn?.id) {
      const orderDate = first.order_date
      const windowMin = isoDate(orderDate, -2)
      const windowMax = isoDate(orderDate, +7)
      const { data: candidates } = await sb
        .from('keiri_bank_transactions')
        .select('id')
        .eq('debit', orderTotal)
        .gte('date', windowMin)
        .lte('date', windowMax)
        .is('transaction_id', null)
        .limit(1)
      const bankId = candidates?.[0]?.id
      if (bankId) {
        await sb.from('keiri_bank_transactions').update({ transaction_id: txn.id }).eq('id', bankId)
        await sb.from('keiri_transactions').update({ bank_transaction_id: bankId }).eq('id', txn.id)
        bankMatched++
      }
    }
  }

  revalidatePath('/admin/keiri/amazon')
  revalidatePath('/admin/keiri/bank')
  return {
    inserted_orders: insertedOrders,
    inserted_items: insertedItems,
    skipped_orders: skippedOrders,
    unclassified,
    total_items: items.length,
    bank_matched: bankMatched,
  }
}

function isoDate(base: string, deltaDays: number): string {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export async function updateAmazonItemCategory(
  itemId: string,
  categoryId: string | null,
): Promise<void> {
  const sb = await createClient()
  const { data: item, error: selErr } = await sb
    .from('keiri_amazon_order_items')
    .select('item_name, asin, tax_rate, order_id')
    .eq('id', itemId)
    .single()
  if (selErr) throw new Error(selErr.message)

  const { error } = await sb
    .from('keiri_amazon_order_items')
    .update({ expense_category_id: categoryId, classification_source: 'manual' })
    .eq('id', itemId)
  if (error) throw new Error(error.message)

  // Learn this assignment so future imports of the same item_name (or ASIN) auto-apply.
  if (categoryId && item) {
    await sb
      .from('keiri_amazon_item_overrides')
      .upsert(
        {
          item_name: item.item_name,
          asin: item.asin ?? null,
          category_id: categoryId,
          tax_rate: item.tax_rate ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'item_name' },
      )

    // Propagate to other order rows for the same item in the same order (consolidated transaction category)
    if (item.order_id) {
      await sb
        .from('keiri_transactions')
        .update({ category_id: categoryId })
        .eq('source', 'amazon_business')
        .eq('source_ref', item.order_id)
    }
  }

  revalidatePath('/admin/keiri/amazon')
}

export async function deleteAmazonOrder(orderId: string): Promise<void> {
  const sb = await createClient()
  const { data: order } = await sb
    .from('keiri_amazon_orders')
    .select('order_id')
    .eq('id', orderId)
    .single()
  if (!order) throw new Error('注文が見つかりません')
  await sb.from('keiri_transactions').delete().eq('source', 'amazon_business').eq('source_ref', order.order_id)
  await sb.from('keiri_amazon_orders').delete().eq('id', orderId)
  revalidatePath('/admin/keiri/amazon')
}
