import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const printerUrl = process.env.PRINTER_URL
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
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Printer server unreachable' }, { status: 503 })
  }
}
