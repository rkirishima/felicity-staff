import { createServiceClient } from './serviceClient'

const BUCKET = 'keiri-stamps'
const SEAL_FILE = 'seal.png'

let cached: string | null = null

export async function getCompanySealDataUri(): Promise<string | null> {
  if (cached) return cached
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.storage.from(BUCKET).download(SEAL_FILE)
    if (error || !data) return null
    const buf = Buffer.from(await data.arrayBuffer())
    cached = `data:image/png;base64,${buf.toString('base64')}`
    return cached
  } catch {
    return null
  }
}
