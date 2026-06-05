'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { loadClassificationContext } from '@/lib/keiri/classifyExpense'
import { aiClassifyBankRows, resolveBankCategory } from '@/lib/keiri/aiClassifyBankRow'

type ParsedRow = {
  date: string
  description: string
  debit: number
  credit: number
  balance: number | null
}

function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    decoder.decode(buffer)
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

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i]
    const text = row.join('')
    if (
      (text.includes('取引日') || text.includes('日付')) &&
      (text.includes('出金') || text.includes('入金') || text.includes('引出') || text.includes('預入') || text.includes('預り') || text.includes('支払') || text.includes('金額'))
    ) {
      return i
    }
  }
  return 0
}

function parseBankCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV にデータがありません')

  const rows = lines.map(parseCsvLine)
  const headerIdx = findHeaderRow(rows)
  const header = rows[headerIdx]

  const colMap: Record<string, number> = {}
  header.forEach((h, i) => {
    const lower = h.toLowerCase()
    if (h.includes('日付') || h.includes('取引日') || h.includes('取扱日') || h.includes('ご利用日') || lower === 'date') colMap.date = i
    else if (
      h.includes('摘要') || h.includes('内容') || h.includes('取引内容') ||
      h.includes('お取引内容') || h.includes('ご利用店舗') || h.includes('利用店舗') ||
      h.includes('店舗名') || h.includes('利用先') ||
      lower === 'description' || lower === 'memo'
    ) colMap.description = i
    else if (
      h.includes('出金') || h.includes('引出') || h.includes('支払') ||
      h.includes('お支払') || h.includes('引落') || h.includes('ご利用金額') ||
      h.includes('利用金額') || h.includes('お引出') ||
      lower === 'debit' || lower === 'withdrawal'
    ) colMap.debit = i
    else if (
      h.includes('入金') || h.includes('預入') || h.includes('預り') ||
      h.includes('お預り') || h.includes('お預入') || h.includes('振込入金') ||
      lower === 'credit' || lower === 'deposit'
    ) colMap.credit = i
    else if (h.includes('残高') || lower === 'balance') colMap.balance = i
  })

  if (colMap.date === undefined) {
    throw new Error(`日付カラムが見つかりません。検出ヘッダ: [${header.join(' | ')}]`)
  }
  if (colMap.description === undefined) {
    colMap.description = header.findIndex(h => h.includes('メモ'))
    if (colMap.description < 0) {
      throw new Error(`摘要カラムが見つかりません。検出ヘッダ: [${header.join(' | ')}]`)
    }
  }
  if (colMap.debit === undefined && colMap.credit === undefined) {
    throw new Error(`入金/出金カラムが見つかりません。検出ヘッダ: [${header.join(' | ')}]`)
  }

  const parseNum = (s: string | undefined): number => {
    if (!s) return 0
    const cleaned = s.replace(/[,¥£\s　]/g, '')
    if (!cleaned || cleaned === '-' || cleaned === '　') return 0
    const n = parseInt(cleaned, 10)
    return isNaN(n) ? 0 : n
  }

  const out: ParsedRow[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every(c => !c.trim())) continue
    const dateRaw = row[colMap.date]
    const dateMatch = dateRaw?.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)
    if (!dateMatch) continue
    const date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    out.push({
      date,
      description: row[colMap.description] || '',
      debit: colMap.debit !== undefined ? parseNum(row[colMap.debit]) : 0,
      credit: colMap.credit !== undefined ? parseNum(row[colMap.credit]) : 0,
      balance: colMap.balance !== undefined ? parseNum(row[colMap.balance]) : null,
    })
  }
  return out
}

function fingerprint(r: { date: string; description: string; debit: number; credit: number; balance: number | null }): string {
  return `${r.date}|${r.description}|${r.debit}|${r.credit}|${r.balance ?? ''}`
}

export async function importBankCsv(formData: FormData): Promise<{ inserted: number; skipped: number; total: number; payablesMatched: number; aiClassified?: number }> {
  const file = formData.get('file') as File | null
  if (!file) throw new Error('ファイルがありません')

  const buffer = await file.arrayBuffer()
  const encoding = detectEncoding(buffer)
  const text = new TextDecoder(encoding).decode(buffer)

  const rows = parseBankCsv(text)
  if (rows.length === 0) throw new Error('取り込めるデータがありません')

  const sb = await createClient()

  const dates = rows.map(r => r.date).sort()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]

  const { data: existing, error: selErr } = await sb
    .from('keiri_bank_transactions')
    .select('date, description, debit, credit, balance')
    .gte('date', minDate)
    .lte('date', maxDate)
  if (selErr) throw new Error(selErr.message)

  const existingFp = new Set((existing ?? []).map(r => fingerprint({
    date: r.date as string,
    description: (r.description as string) ?? '',
    debit: (r.debit as number) ?? 0,
    credit: (r.credit as number) ?? 0,
    balance: r.balance as number | null,
  })))

  const fresh: typeof rows = []
  const seenInBatch = new Set<string>()
  let skipped = 0
  for (const r of rows) {
    const fp = fingerprint(r)
    if (existingFp.has(fp) || seenInBatch.has(fp)) {
      skipped++
      continue
    }
    seenInBatch.add(fp)
    fresh.push(r)
  }

  const insertedIds = new Map<string, string>() // fingerprint -> bank tx id
  if (fresh.length > 0) {
    const { data: ins, error } = await sb
      .from('keiri_bank_transactions')
      .insert(
        fresh.map(r => ({
          date: r.date,
          description: r.description,
          debit: r.debit,
          credit: r.credit,
          balance: r.balance,
          source_file: file.name,
        })),
      )
      .select('id, date, description, debit, credit, balance')
    if (error) throw new Error(error.message)
    for (const row of (ins ?? []) as Array<{ id: string; date: string; description: string; debit: number; credit: number; balance: number | null }>) {
      insertedIds.set(fingerprint(row), row.id)
    }
  }

  // Auto-match debit rows (出金) to pending payables. A match requires:
  //   - bank.debit > 0
  //   - bank.debit === payable.amount (exact)
  //   - vendor token appears in bank.description (case-insensitive)
  //   - payable.due_date within ±14 days of bank.date
  // On match, mark the payable as paid and link bank_transaction_id.
  let payablesMatched = 0
  if (fresh.length > 0) {
    const debits = fresh.filter(r => r.debit > 0)
    if (debits.length > 0) {
      const debitMin = debits.reduce((min, r) => r.date < min ? r.date : min, debits[0].date)
      const debitMax = debits.reduce((max, r) => r.date > max ? r.date : max, debits[0].date)
      const minDateWindow = isoDate(debitMin, -14)
      const maxDateWindow = isoDate(debitMax, +14)
      const { data: payables } = await sb
        .from('keiri_payables')
        .select('id, vendor, amount, due_date')
        .eq('status', 'pending')
        .gte('due_date', minDateWindow)
        .lte('due_date', maxDateWindow)

      const candidates = ((payables ?? []) as Array<{ id: string; vendor: string; amount: number; due_date: string }>)
      for (const d of debits) {
        const txId = insertedIds.get(fingerprint(d))
        if (!txId) continue
        const desc = (d.description || '').toLowerCase()
        const match = candidates.find(p => {
          if (p.amount !== d.debit) return false
          const vendorLower = p.vendor.toLowerCase()
          // vendor name (or any whitespace-separated token >=2 chars) appears in description
          if (desc.includes(vendorLower)) return true
          const tokens = vendorLower.split(/\s+/).filter(t => t.length >= 2)
          return tokens.some(t => desc.includes(t))
        })
        if (match) {
          const { error: updErr } = await sb
            .from('keiri_payables')
            .update({
              status: 'paid',
              paid_at: new Date(d.date + 'T00:00:00+09:00').toISOString(),
              paid_amount: d.debit,
              paid_via: 'bank_transfer',
              bank_transaction_id: txId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', match.id)
            .eq('status', 'pending') // race guard
          if (!updErr) {
            payablesMatched++
            // remove from candidates so we don't match same payable twice
            const idx = candidates.indexOf(match)
            if (idx >= 0) candidates.splice(idx, 1)
          }
        }
      }
    }
  }

  // Auto-link debit rows to existing Amazon expense transactions (date+amount).
  if (fresh.length > 0) {
    const debits = fresh.filter(r => r.debit > 0)
    if (debits.length > 0) {
      const debitMin = debits.reduce((min, r) => r.date < min ? r.date : min, debits[0].date)
      const debitMax = debits.reduce((max, r) => r.date > max ? r.date : max, debits[0].date)
      const { data: amazonTxns } = await sb
        .from('keiri_transactions')
        .select('id, date, amount, bank_transaction_id')
        .eq('source', 'amazon_business')
        .gte('date', isoDate(debitMin, -7))
        .lte('date', isoDate(debitMax, +2))
        .is('bank_transaction_id', null)
      const txnCandidates = (amazonTxns ?? []) as Array<{ id: string; date: string; amount: number; bank_transaction_id: string | null }>
      for (const d of debits) {
        const txId = insertedIds.get(fingerprint(d))
        if (!txId) continue
        const match = txnCandidates.find(t => t.amount === d.debit && Math.abs(daysBetween(t.date, d.date)) <= 7)
        if (match) {
          await sb.from('keiri_bank_transactions').update({ transaction_id: match.id }).eq('id', txId)
          await sb.from('keiri_transactions').update({ bank_transaction_id: txId }).eq('id', match.id)
          const idx = txnCandidates.indexOf(match)
          if (idx >= 0) txnCandidates.splice(idx, 1)
        }
      }
    }
  }

  // Rule-based pre-classification for new rows (cheap fast pass before AI)
  let aiClassifiedCount = 0
  if (fresh.length > 0) {
    const newIds = Array.from(insertedIds.values())
    await preClassifyBankRowsByRule(newIds)
    // Then AI classify whatever's still unclassified (and not already linked)
    aiClassifiedCount = await aiClassifyUnclassifiedBankIds(newIds)
  }

  revalidatePath('/admin/keiri/bank')
  if (payablesMatched > 0) revalidatePath('/admin/keiri/payables')
  revalidatePath('/admin/keiri/amazon')
  return { inserted: fresh.length, skipped, total: rows.length, payablesMatched, aiClassified: aiClassifiedCount }
}

async function preClassifyBankRowsByRule(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const sb = await createClient()
  const ctx = await loadClassificationContext()

  const zatuhi = ctx.categoryByName.get('雑費')
  const tsushin = ctx.categoryByName.get('通信費')
  const kyuryo = ctx.categoryByName.get('給料手当')

  // Load learned overrides (description pattern → category)
  const { data: overrides } = await sb
    .from('keiri_bank_classification_overrides')
    .select('description_pattern, category_id, vendor_label, match_mode')
  const overrideRules = ((overrides ?? []) as Array<{ description_pattern: string; category_id: string; vendor_label: string | null; match_mode: string }>)

  const { data: rows } = await sb
    .from('keiri_bank_transactions')
    .select('id, description, debit, transaction_id, expense_category_id')
    .in('id', ids)
  const targets = ((rows ?? []) as Array<{ id: string; description: string; debit: number; transaction_id: string | null; expense_category_id: string | null }>)
    .filter(r => r.debit > 0 && r.expense_category_id === null && r.transaction_id === null)

  for (const r of targets) {
    const desc = r.description || ''
    let categoryId: string | null = null
    let vendor: string | null = null
    let source: 'auto' | 'learned' = 'auto'

    // Learned overrides first
    for (const o of overrideRules) {
      const pattern = o.description_pattern
      const matched =
        o.match_mode === 'exact' ? desc === pattern :
        o.match_mode === 'prefix' ? desc.startsWith(pattern) :
        desc.includes(pattern)
      if (matched) {
        categoryId = o.category_id
        vendor = o.vendor_label
        source = 'learned'
        break
      }
    }

    if (!categoryId) {
      if (/^振込手数料/.test(desc) && zatuhi) {
        categoryId = zatuhi
        vendor = 'SBI振込手数料'
      } else if (/ANTHROPIC|OPENAI|GOOGLE\s*WORKSPACE|AWS|VERCEL/i.test(desc) && tsushin) {
        categoryId = tsushin
        vendor = desc.trim()
      } else if (/コウセイロウドウシヨウネンキンキヨク|年金事務所/i.test(desc) && kyuryo) {
        categoryId = kyuryo
        vendor = '日本年金機構'
      }
    }

    if (categoryId) {
      await sb
        .from('keiri_bank_transactions')
        .update({
          expense_category_id: categoryId,
          vendor_guess: vendor,
          classification_source: source,
        })
        .eq('id', r.id)
    }
  }
}

async function aiClassifyUnclassifiedBankIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const sb = await createClient()
  const ctx = await loadClassificationContext()

  const { data: rows } = await sb
    .from('keiri_bank_transactions')
    .select('id, date, description, debit, expense_category_id, transaction_id')
    .in('id', ids)
  const targets = ((rows ?? []) as Array<{ id: string; date: string; description: string; debit: number; expense_category_id: string | null; transaction_id: string | null }>)
    .filter(r => r.debit > 0 && r.expense_category_id === null && r.transaction_id === null)
  if (targets.length === 0) return 0

  // Skip "デビット 数字" rows — AI can't classify without merchant name
  const aiTargets = targets.filter(r => !/^デビット\s+\d+/.test(r.description))
  const debitDetailRows = targets.filter(r => /^デビット\s+\d+/.test(r.description))

  // Mark デビット rows as unclassifiable (needs detail CSV)
  for (const r of debitDetailRows) {
    await sb
      .from('keiri_bank_transactions')
      .update({
        classification_source: 'unclassifiable',
        classification_note: 'デビット明細CSV要 (店舗名なし)',
      })
      .eq('id', r.id)
  }

  if (aiTargets.length === 0) return 0

  // Dedupe by description to save tokens
  const uniqByDesc = new Map<string, { description: string; debit: number; date: string }>()
  for (const r of aiTargets) {
    if (!uniqByDesc.has(r.description)) uniqByDesc.set(r.description, { description: r.description, debit: r.debit, date: r.date })
  }

  const results = await aiClassifyBankRows(Array.from(uniqByDesc.values()))
  const resolvedByDesc = new Map<string, { category_id: string; vendor: string; tax_rate: number; confidence: 'high' | 'medium' | 'low'; reason: string }>()
  for (const r of results) {
    const id = resolveBankCategory(r, ctx)
    if (id) resolvedByDesc.set(r.description, { category_id: id, vendor: r.vendor, tax_rate: r.tax_rate, confidence: r.confidence, reason: r.reason })
  }

  let classified = 0
  for (const r of aiTargets) {
    const x = resolvedByDesc.get(r.description)
    if (!x) continue
    await sb
      .from('keiri_bank_transactions')
      .update({
        expense_category_id: x.category_id,
        vendor_guess: x.vendor || null,
        classification_source: 'ai',
        ai_confidence: x.confidence,
        classification_note: x.reason,
      })
      .eq('id', r.id)
    classified++

    // Cache high-confidence as a contains-pattern override for future learning
    if (x.confidence === 'high') {
      await sb
        .from('keiri_bank_classification_overrides')
        .upsert(
          {
            description_pattern: r.description,
            category_id: x.category_id,
            vendor_label: x.vendor || null,
            match_mode: 'exact',
            note: 'AI 自動 (high confidence)',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'description_pattern,match_mode' },
        )
    }
  }
  return classified
}

export async function aiClassifyAllUnmatchedBank(month: string): Promise<{ classified: number; total: number; debit_detail_needed: number }> {
  const sb = await createClient()
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const start = `${month}-01`
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data: rows } = await sb
    .from('keiri_bank_transactions')
    .select('id')
    .gte('date', start)
    .lt('date', next)
    .gt('debit', 0)
    .is('expense_category_id', null)
    .is('transaction_id', null)
  const ids = (rows ?? []).map(r => r.id as string)
  if (ids.length === 0) return { classified: 0, total: 0, debit_detail_needed: 0 }

  await preClassifyBankRowsByRule(ids)
  const classified = await aiClassifyUnclassifiedBankIds(ids)
  // Count rows we marked unclassifiable
  const { count: detailNeeded } = await sb
    .from('keiri_bank_transactions')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('classification_source', 'unclassifiable')

  revalidatePath('/admin/keiri/bank')
  return { classified, total: ids.length, debit_detail_needed: detailNeeded ?? 0 }
}

export async function updateBankRowCategory(id: string, categoryId: string | null): Promise<void> {
  const sb = await createClient()
  const { data: row } = await sb
    .from('keiri_bank_transactions')
    .select('description')
    .eq('id', id)
    .single()
  const { error } = await sb
    .from('keiri_bank_transactions')
    .update({
      expense_category_id: categoryId,
      classification_source: 'manual',
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  // Learn this assignment for future imports
  if (categoryId && row?.description) {
    await sb
      .from('keiri_bank_classification_overrides')
      .upsert(
        {
          description_pattern: row.description,
          category_id: categoryId,
          match_mode: 'exact',
          note: '手動分類',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'description_pattern,match_mode' },
      )
  }
  revalidatePath('/admin/keiri/bank')
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((da - db) / 86400000)
}

function isoDate(base: string, deltaDays: number): string {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export async function deleteBankTransaction(id: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('keiri_bank_transactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/bank')
}

export async function deleteBankImport(sourceFile: string): Promise<void> {
  const sb = await createClient()
  const { error } = await sb.from('keiri_bank_transactions').delete().eq('source_file', sourceFile)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/keiri/bank')
}
