'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
      (text.includes('出金') || text.includes('入金') || text.includes('引出') || text.includes('預入') || text.includes('金額'))
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
    if (h.includes('日付') || h.includes('取引日') || lower === 'date') colMap.date = i
    else if (
      h.includes('摘要') || h.includes('内容') || h.includes('取引内容') ||
      lower === 'description' || lower === 'memo'
    ) colMap.description = i
    else if (h.includes('出金') || h.includes('引出') || lower === 'debit' || lower === 'withdrawal') colMap.debit = i
    else if (h.includes('入金') || h.includes('預入') || lower === 'credit' || lower === 'deposit') colMap.credit = i
    else if (h.includes('残高') || lower === 'balance') colMap.balance = i
  })

  if (colMap.date === undefined) throw new Error('日付カラムが見つかりません')
  if (colMap.description === undefined) {
    colMap.description = header.findIndex(h => h.includes('メモ'))
    if (colMap.description < 0) throw new Error('摘要カラムが見つかりません')
  }
  if (colMap.debit === undefined && colMap.credit === undefined) {
    throw new Error('入金/出金カラムが見つかりません')
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

export async function importBankCsv(formData: FormData): Promise<{ inserted: number; skipped: number; total: number }> {
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

  if (fresh.length > 0) {
    const { error } = await sb.from('keiri_bank_transactions').insert(
      fresh.map(r => ({
        date: r.date,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
        balance: r.balance,
        source_file: file.name,
      })),
    )
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/keiri/bank')
  return { inserted: fresh.length, skipped, total: rows.length }
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
