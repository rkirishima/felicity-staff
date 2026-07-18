import { requireKeiri } from '@/lib/auth/server'
import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import {
  listActiveAccounts,
  getAccessToken,
  downloadDriveFile,
  listMessageAttachments,
  getAttachmentData,
} from '@/lib/keiri/gmail'

export const runtime = 'nodejs'
export const maxDuration = 60

// /api/keiri/invoice-bundle?month=YYYY-MM
//
// 税理士向け: 対象月の仕入先請求書の原本ファイルを1つのZIPにまとめて返す。
// 収集元 (payable ごとに優先順):
//   1. 手動添付 (Supabase Storage keiri-payable-invoices / invoice_file_path)
//   2. Drive受け箱取込 (source=drive_auto → Drive API でファイル取得)
//   3. Gmail取込 (source=email_auto → メール添付のPDF/画像。無ければ本文を .txt で同梱)
// ZIP には manifest.csv (一覧) を同梱。ファイル名は 日付_仕入先_金額 に正規化。

type PayableRow = {
  id: string
  vendor: string
  description: string | null
  amount: number
  invoice_number: string | null
  order_date: string | null
  due_date: string
  status: string
  source: string
  source_email_id: string | null
  source_email_subject: string | null
  raw_text: string | null
  notes: string | null
  invoice_file_path: string | null
  created_at: string
}

function sanitizeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 40)
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  return map[mime] ?? 'bin'
}

export async function GET(req: Request): Promise<Response> {
  const _denied = await requireKeiri(); if (_denied) return _denied
  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  }
  const [y, m] = month.split('-').map(s => parseInt(s, 10))
  const start = `${month}-01`
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const end = `${nextMonth}-01`
  const beginIso = new Date(`${start}T00:00:00+09:00`).toISOString()
  const endIso = new Date(`${end}T00:00:00+09:00`).toISOString()

  const sb = createServiceClient()

  // 対象: order_date が当月、または order_date 無しで登録日が当月の payable
  const { data, error } = await sb
    .from('keiri_payables')
    .select(
      'id, vendor, description, amount, invoice_number, order_date, due_date, status, source, source_email_id, source_email_subject, raw_text, notes, invoice_file_path, created_at',
    )
    .or(
      `and(order_date.gte.${start},order_date.lt.${end}),and(order_date.is.null,created_at.gte.${beginIso},created_at.lt.${endIso})`,
    )
    .order('order_date', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const payables = (data ?? []) as PayableRow[]

  // Google トークン (Drive/Gmail 由来のファイル取得に使用。未接続でも Storage 添付分は動く)
  let accessToken: string | null = null
  try {
    const accounts = await listActiveAccounts()
    for (const acct of accounts) {
      try {
        accessToken = await getAccessToken(acct)
        break
      } catch {
        // try next account
      }
    }
  } catch {
    // no accounts — proceed with storage-only
  }

  const zip = new JSZip()
  const manifest: string[][] = [
    ['日付', '仕入先', '金額(税込)', '請求書番号', '状態', '取込元', 'ZIP内ファイル', '備考'],
  ]

  let fileCount = 0
  for (const p of payables) {
    const dateLabel = p.order_date ?? p.created_at.slice(0, 10)
    const base = `${dateLabel}_${sanitizeName(p.vendor)}_${p.amount}円`
    const added: string[] = []
    let note = p.notes ?? ''

    try {
      if (p.invoice_file_path) {
        const { data: blob, error: dlErr } = await sb.storage
          .from('keiri-payable-invoices')
          .download(p.invoice_file_path)
        if (dlErr || !blob) throw new Error(dlErr?.message ?? 'storage download failed')
        const ext = p.invoice_file_path.split('.').pop() || 'pdf'
        const name = `${base}.${ext}`
        zip.file(name, Buffer.from(await blob.arrayBuffer()))
        added.push(name)
      } else if (p.source === 'drive_auto' && p.source_email_id) {
        if (!accessToken) throw new Error('Google未接続 (gmail-setup)')
        const buf = await downloadDriveFile(accessToken, p.source_email_id)
        const { data: meta } = await sb
          .from('keiri_drive_processed')
          .select('mime_type, file_name')
          .eq('file_id', p.source_email_id)
          .maybeSingle()
        const ext = meta?.mime_type
          ? extFromMime(meta.mime_type as string)
          : (meta?.file_name as string | undefined)?.split('.').pop() || 'pdf'
        const name = `${base}.${ext}`
        zip.file(name, Buffer.from(buf))
        added.push(name)
      } else if (p.source === 'email_auto' && p.source_email_id) {
        if (!accessToken) throw new Error('Google未接続 (gmail-setup)')
        const atts = (await listMessageAttachments(accessToken, p.source_email_id)).filter(
          a => a.mimeType === 'application/pdf' || a.mimeType.startsWith('image/'),
        )
        if (atts.length > 0) {
          for (let i = 0; i < atts.length; i++) {
            const buf = await getAttachmentData(accessToken, p.source_email_id, atts[i].attachmentId)
            const suffix = atts.length > 1 ? `_${i + 1}` : ''
            const name = `${base}${suffix}.${extFromMime(atts[i].mimeType)}`
            zip.file(name, buf)
            added.push(name)
          }
        } else if (p.raw_text) {
          const name = `${base}_メール本文.txt`
          zip.file(name, `件名: ${p.source_email_subject ?? ''}\n\n${p.raw_text}`)
          added.push(name)
          note = `${note} 添付なし(メール本文のみ)`.trim()
        } else {
          throw new Error('添付・本文なし')
        }
      } else {
        throw new Error('ファイル未添付')
      }
      fileCount += added.length
    } catch (e) {
      note = `${note} ⚠ファイル取得不可: ${e instanceof Error ? e.message : String(e)}`.trim()
    }

    manifest.push([
      dateLabel,
      p.vendor,
      String(p.amount),
      p.invoice_number ?? '',
      p.status,
      p.source,
      added.join(' / '),
      note,
    ])
  }

  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  zip.file(
    'manifest.csv',
    '﻿' + manifest.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n',
  )

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="felicity-invoices-${month}.zip"`,
      'x-invoice-count': String(payables.length),
      'x-file-count': String(fileCount),
      'cache-control': 'private, no-store',
    },
  })
}
