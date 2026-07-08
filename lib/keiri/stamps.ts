import { createServiceClient } from './serviceClient'
import type { Issuer } from './company'

const BUCKET = 'keiri-stamps'
const SEAL_FILES: Record<Issuer, string> = {
  felicity: 'seal.png',
  rook: 'rook-seal.png',
}

const cached = new Map<string, string>()

export async function getSealDataUri(issuer: Issuer): Promise<string | null> {
  const file = SEAL_FILES[issuer]
  const hit = cached.get(file)
  if (hit) return hit
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.storage.from(BUCKET).download(file)
    if (error || !data) return null
    const buf = Buffer.from(await data.arrayBuffer())
    const uri = `data:image/png;base64,${buf.toString('base64')}`
    cached.set(file, uri)
    return uri
  } catch {
    return null
  }
}

export function getCompanySealDataUri(): Promise<string | null> {
  return getSealDataUri('felicity')
}
