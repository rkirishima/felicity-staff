import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'

// ラベル印刷: Supabase キュー (label_print_jobs) に INSERT し、Pi 側の
// felicity-queue poller が outbound polling で印刷する。CFトンネル・Pi の
// IP変更・ネット断に影響されない。キュー投入に失敗した場合のみ旧経路
// (PRINTER_URL = CFトンネル直POST) にフォールバックする。
// 認証なしは意図的 — 「印刷は誰でもアクセスできるべき」(Rowly 2026-08-16)。

export const maxDuration = 30

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 2000

type PrintPayload = {
  product_name?: string
  size?: string
  type?: string
  gtin?: string
  quantity?: number
  category?: string
}

async function legacyTunnelPrint(body: PrintPayload): Promise<NextResponse> {
  const printerUrl = process.env.PRINTER_URL?.replace(/\\n/g, '').trim()
  if (!printerUrl) {
    return NextResponse.json({ error: 'PRINTER_URL not configured' }, { status: 503 })
  }
  let lastError: { status: number; detail: string } | null = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    try {
      const res = await fetch(`${printerUrl}/label_print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      const text = await res.text()
      try {
        return NextResponse.json(JSON.parse(text), { status: res.status })
      } catch {
        lastError = { status: res.status, detail: text.replace(/<[^>]+>/g, ' ').slice(0, 200) }
      }
    } catch (err) {
      lastError = { status: 0, detail: String(err) }
    }
  }
  console.error('[label-print] legacy tunnel failed:', lastError)
  return NextResponse.json({ error: 'Printer unreachable (queue + tunnel both failed)' }, { status: 503 })
}

export async function POST(request: Request) {
  let body: PrintPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.product_name || !body.size || !body.gtin) {
    return NextResponse.json({ error: 'Missing required fields (product_name, size, gtin)' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('label_print_jobs').insert({
      payload: {
        product_name: body.product_name,
        size: body.size,
        type: body.type ?? 'bean',
        gtin: body.gtin,
        quantity: Math.max(1, Math.min(99, Math.floor(body.quantity ?? 1))),
        category: body.category ?? 'retail',
      },
      source: 'staff',
    })
    if (error) throw error
    return NextResponse.json({ status: 'queued', via: 'queue' })
  } catch (err) {
    console.error('[label-print] queue insert failed, falling back to tunnel:', err)
    return legacyTunnelPrint(body)
  }
}
