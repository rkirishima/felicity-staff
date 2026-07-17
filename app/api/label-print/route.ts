import { NextResponse } from 'next/server'

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

  try {
    const res = await fetch(`${printerUrl}/label_print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status })
    } catch {
      console.error(`[label-print] non-JSON response ${res.status} from ${printerUrl}/label_print:`, text.slice(0, 300))
      return NextResponse.json({ error: `Printer returned ${res.status}` }, { status: 502 })
    }
  } catch (err) {
    console.error('[label-print] printer fetch failed:', err)
    return NextResponse.json({ error: 'Printer server unreachable' }, { status: 503 })
  }
}
