// イベント予約用の最小 Stripe クライアント（fetch 直叩き、サーバー専用）。
const BASE = 'https://api.stripe.com/v1'

export function stripeKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY
  return k && /^(sk|rk)_/.test(k.trim()) ? k.trim() : null
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: URLSearchParams): Promise<T> {
  const key = stripeKey()
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe ${res.status}`)
  return json as T
}

export type StripeSession = {
  id: string
  url: string | null
  status: 'open' | 'complete' | 'expired'
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  payment_intent: string | null
  customer_details?: { email?: string | null; name?: string | null } | null
}

export function createSession(params: URLSearchParams) {
  return call<StripeSession>('POST', '/checkout/sessions', params)
}
export function getSession(id: string) {
  return call<StripeSession>('GET', `/checkout/sessions/${encodeURIComponent(id)}`)
}
export function expireSession(id: string) {
  return call<StripeSession>('POST', `/checkout/sessions/${encodeURIComponent(id)}/expire`)
}
export function refundPaymentIntent(paymentIntent: string) {
  const p = new URLSearchParams({ payment_intent: paymentIntent })
  return call<{ id: string; status: string }>('POST', '/refunds', p)
}
