import { requireKeiri } from '@/lib/auth/server'
import sharp from 'sharp'
import { extractReceipt } from '@/lib/keiri/ocr'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const _denied = await requireKeiri(); if (_denied) return _denied
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
  }

  try {
    const ct = request.headers.get('content-type') ?? ''
    let inputBuf: Buffer

    if (ct.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('image')
      if (!(file instanceof Blob)) {
        return Response.json({ ok: false, error: 'image field missing' }, { status: 400 })
      }
      inputBuf = Buffer.from(await file.arrayBuffer())
    } else {
      const body = await request.json() as { image?: string }
      if (!body.image) {
        return Response.json({ ok: false, error: 'image field missing' }, { status: 400 })
      }
      const b64 = body.image.replace(/^data:image\/\w+;base64,/, '')
      inputBuf = Buffer.from(b64, 'base64')
    }

    const normalized = await sharp(inputBuf)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()

    const normalizedB64 = normalized.toString('base64')
    const parsed = await extractReceipt(normalizedB64, 'image/jpeg')

    return Response.json({ ok: true, parsed, normalized_base64: normalizedB64 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
