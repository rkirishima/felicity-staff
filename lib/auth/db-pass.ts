// サーバー専用。データベース用の「通行証」（Supabase のログインセッション）を発行する。
//
// スタッフアプリは PIN ログイン（felicity_auth cookie）で守っているが、画面は
// ブラウザから公開キー（anon）で直接 DB を読む。公開キーは誰でも見られるので、
// テーブルに RLS をかけ「通行証を持つ人（authenticated）だけ」に絞る。
// 通行証は PIN ログイン済み、または店舗端末として登録済みの端末にだけ渡す。
//
// 発行には共有のアプリ用ユーザー 1 人を使う（メールは送られない）。service role で
// マジックリンクのトークンを作り、その場で検証してセッションに換える。
// JWT secret を env に追加しなくて済むのでこの方式にしている。
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_USER_EMAIL = 'staff-app@felicity.cafe'

export type DbPassTokens = { access_token: string; refresh_token: string }

export async function mintDbPass(): Promise<DbPassTokens | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null

  const admin = createAdminClient()
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: APP_USER_EMAIL,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    console.error('[db-pass] generateLink failed', linkErr?.message)
    return null
  }

  const sb = createSbClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
  if (error || !data.session) {
    console.error('[db-pass] verifyOtp failed', error?.message)
    return null
  }
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
}
