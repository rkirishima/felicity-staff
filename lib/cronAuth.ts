// Vercel Cron 認証の共通ヘルパー。fail-closed（CRON_SECRET 未設定なら常に拒否）。
// 以前は各 route が `if (CRON_SECRET && ...)` の fail-open で、env 未設定時に
// 誰でも叩ける状態だった。全 cron はこの関数に統一する。

export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  return req.headers.get('authorization') === `Bearer ${expected}`
}
