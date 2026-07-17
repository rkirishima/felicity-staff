import { NextResponse } from 'next/server'

// Cloudflareトンネル (label.felicity-hayama.com) は502/530を間欠的に返すため
// リトライで吸収する。Pi側はキュー式なので二重送信の心配はリトライ失敗時のみ。
export const maxDuration = 30

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 2000

export async function POST(request: Request) {
  // Vercel env値に紛れ込む改行/リテラル"\n"を除去 — "\n"入りURLはfetchが
  // "https://host/n/…" と解釈して404になる (GOOGLE_CLIENT_IDと同種の問題)
  const printerUrl = process.env.PRINTER_URL?.replace(/\\n/g, '').trim()
  if (!printerUrl) {
    return NextResponse.json({ error: 'PRINTER_URL not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  let lastError: { status: number; cfRay: string | null; detail: string } | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
    try {
      const res = await fetch(`${printerUrl}/label_print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      const text = await res.text()
      try {
        return NextResponse.json(JSON.parse(text), { status: res.status })
      } catch {
        // CFトンネルのHTML 502/530など — リトライ対象
        console.error(`[label-print] attempt ${attempt}/${MAX_ATTEMPTS}: non-JSON ${res.status}:`, text.slice(0, 200))
        lastError = {
          status: res.status,
          cfRay: res.headers.get('cf-ray'),
          detail: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300),
        }
      }
    } catch (err) {
      console.error(`[label-print] attempt ${attempt}/${MAX_ATTEMPTS}: fetch failed:`, err)
      lastError = { status: 0, cfRay: null, detail: String(err) }
    }
  }

  return NextResponse.json({
    error: lastError && lastError.status > 0
      ? `Printer returned ${lastError.status} (after ${MAX_ATTEMPTS} attempts)`
      : 'Printer server unreachable',
    cfRay: lastError?.cfRay ?? null,
    detail: lastError?.detail ?? null,
  }, { status: lastError && lastError.status > 0 ? 502 : 503 })
}
