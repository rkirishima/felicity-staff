'use client'

// ブラウザ側の DB 通行証の管理。createBrowserClient はブラウザ内で 1 つだけ作られる
// （シングルトン）ので、ここで setSession すると全画面のクエリとリアルタイム購読に効く。
import { createClient } from '@/lib/supabase/client'
import { syncDbPass } from '@/app/db-pass/actions'

let inflight: Promise<boolean> | null = null

/** 権限があれば通行証を用意する。戻り値は「権限があるか」。 */
export function ensureDbPass(): Promise<boolean> {
  if (inflight) return inflight
  inflight = (async () => {
    const sb = createClient()
    try {
      const { data } = await sb.auth.getSession()
      const res = await syncDbPass(!!data.session)
      if (!res.access) {
        if (data.session) await sb.auth.signOut({ scope: 'local' })
        return false
      }
      if (res.tokens) await sb.auth.setSession(res.tokens)
      return true
    } catch (e) {
      console.error('[db-pass]', e)
      return false
    } finally {
      inflight = null
    }
  })()
  return inflight
}
