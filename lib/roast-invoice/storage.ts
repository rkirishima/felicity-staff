/**
 * 請求書PDFをSupabase Storageにアップロード。
 * バケット 'invoices' は事前に作成しておくこと(public read無し、署名URL運用)。
 */

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'invoices'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function ensureBucket() {
  const supabase = admin()
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((b) => b.name === BUCKET)) return
  await supabase.storage.createBucket(BUCKET, { public: false })
}

export async function uploadInvoicePdf(opts: {
  year: number
  month: number
  recipientSlug: string // 'FELICITY' / 'ASAHIKOSAN'
  bytes: Uint8Array | Buffer
}): Promise<string> {
  await ensureBucket()
  const supabase = admin()
  const yyyymm = `${opts.year}-${String(opts.month).padStart(2, '0')}`
  const filePath = `roast-monthly/${yyyymm}_FCR-${opts.recipientSlug}.pdf`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, opts.bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return filePath // keiri_invoices.pdf_path に保存する用
}

export async function signedUrl(filePath: string, expiresInSec = 3600): Promise<string> {
  const supabase = admin()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, expiresInSec)
  if (error) throw new Error(`signed URL failed: ${error.message}`)
  return data.signedUrl
}

export async function downloadInvoiceBytes(filePath: string): Promise<Uint8Array> {
  const supabase = admin()
  const { data, error } = await supabase.storage.from(BUCKET).download(filePath)
  if (error) throw new Error(`download failed: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}
