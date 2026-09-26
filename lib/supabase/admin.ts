// サーバー専用。service role で RLS をバイパスする。route handler からのみ import すること。
import { createClient as createSbClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role env not set')
  return createSbClient(url, key, { auth: { persistSession: false } })
}
