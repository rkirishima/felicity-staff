import { requireAdmin } from '@/lib/auth/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(req: Request) {
  const _denied = await requireAdmin(); if (_denied) return _denied
  const { orderId, trackingNumber } = await req.json()
  if (!orderId || !trackingNumber) {
    return NextResponse.json({ error: 'orderId and trackingNumber are required' }, { status: 400 })
  }

  const { data: order, error: fetchError } = await sb
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (fetchError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (!order.customer_email) {
    return NextResponse.json({ error: 'No customer email on record' }, { status: 400 })
  }

  const itemsList = Array.isArray(order.items)
    ? order.items.map((i: { name: string; qty: number }) => `<li>${i.name} × ${i.qty}</li>`).join('')
    : ''

  // Send email FIRST. Only update DB if email succeeds — otherwise the order is
  // marked shipped but the customer never knows (and staff can't retry because
  // the unshipped list no longer shows it).
  const { error: emailError } = await resend.emails.send({
    from: 'FELICITY <orders@felicity.cafe>',
    to: order.customer_email,
    subject: '【FELICITY】ご注文商品を発送いたしました',
    html: `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; max-width: 560px; margin: 0 auto; padding: 24px;">
  <div style="border-bottom: 2px solid #1c1917; padding-bottom: 16px; margin-bottom: 24px;">
    <p style="font-size: 13px; letter-spacing: 0.2em; color: #78716c; margin: 0;">FELICITY COFFEE ROASTERS</p>
  </div>

  <p style="font-size: 15px; line-height: 1.7;">${order.customer_name} 様</p>
  <p style="font-size: 15px; line-height: 1.7;">
    この度はご注文いただきありがとうございます。<br>
    ご注文商品を発送いたしましたのでお知らせいたします。
  </p>

  <div style="background: #f5f0e8; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <p style="font-size: 12px; color: #78716c; margin: 0 0 4px; letter-spacing: 0.1em;">追跡番号</p>
    <p style="font-size: 22px; font-weight: bold; margin: 0; letter-spacing: 0.05em;">${trackingNumber}</p>
  </div>

  ${itemsList ? `
  <div style="margin: 24px 0;">
    <p style="font-size: 12px; color: #78716c; margin: 0 0 8px; letter-spacing: 0.1em;">ご注文内容</p>
    <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">${itemsList}</ul>
    <p style="font-size: 14px; margin: 8px 0 0; color: #555;">合計: ¥${order.amount.toLocaleString()}</p>
  </div>
  ` : ''}

  <div style="margin: 24px 0;">
    <p style="font-size: 12px; color: #78716c; margin: 0 0 4px; letter-spacing: 0.1em;">お届け先</p>
    <p style="font-size: 14px; line-height: 1.7; margin: 0;">${order.shipping_address}</p>
  </div>

  <p style="font-size: 14px; line-height: 1.7; color: #555;">
    配送状況はヤマト運輸のWebサイト（<a href="https://www.kuronekoyamato.co.jp/ytc/customer/track/" style="color: #1c1917;">クロネコヤマト荷物追跡</a>）または郵便局のWebサイトにてご確認いただけます。
  </p>

  <p style="font-size: 14px; line-height: 1.7; color: #555;">
    商品到着まで今しばらくお待ちください。<br>
    ご不明な点がございましたら、お気軽にご連絡ください。
  </p>

  <div style="border-top: 1px solid #e5e5e5; margin-top: 32px; padding-top: 16px;">
    <p style="font-size: 12px; color: #78716c; line-height: 1.7; margin: 0;">
      FELICITY COFFEE ROASTERS<br>
      〒240-0112 神奈川県三浦郡葉山町上山口2432-3<br>
      hello@felicity.cafe
    </p>
  </div>
</body>
</html>`,
  })

  if (emailError) {
    console.error('Resend error:', emailError)
    const msg = (emailError as { message?: string })?.message || 'Failed to send email'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Email sent successfully — now mark the order as shipped.
  const { error: updateError } = await sb
    .from('orders')
    .update({ status: 'shipped', tracking_number: trackingNumber, shipped_at: new Date().toISOString() })
    .eq('id', orderId)

  if (updateError) {
    console.error('Supabase update error:', updateError)
    // Email already sent — surface the error but note it so staff can reconcile manually.
    return NextResponse.json({ error: 'Email sent but failed to update order status. Please refresh and verify.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
