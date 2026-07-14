import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/keiri/serviceClient'
import {
  listActiveAccounts,
  getAccessToken,
  listDriveFolderFiles,
  downloadDriveFile,
  type GmailAccount,
} from '@/lib/keiri/gmail'
import { extractPayableFromDocument } from '@/lib/keiri/extractPayableFromDocument'
import { sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'
export const maxDuration = 60

// Google Drive「請求書_受け箱」フォルダを毎日巡回し、新規のPDF/画像を
// Claude でOCR抽出 → keiri_payables に登録する。LINE・紙など
// メール以外の窓口で届いた請求書は、このフォルダに放り込むだけで取り込まれる。
//
// - フォルダID: DRIVE_INVOICE_INBOX_FOLDER_ID env (未設定時は既定の 請求書_受け箱)
// - 認可: keiri_gmail_accounts の OAuth トークンを流用 (drive.readonly スコープが必要。
//   スコープ不足のアカウントはスキップし、次のアカウントを試す)
// - 処理済み台帳: keiri_drive_processed (file_id 単位、再実行しても二重登録しない)

const DEFAULT_FOLDER_ID = '1V_3SIyGWIKGAgK7VjJi6150s9T_-0nSf' // マイドライブ/請求書_受け箱
const MAX_FILES_PER_RUN = 5 // maxDuration 60s 内に収める (積み残しは翌日以降の実行で消化)
const MAX_FILE_BYTES = 15 * 1024 * 1024

const SUPPORTED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const folderId = process.env.DRIVE_INVOICE_INBOX_FOLDER_ID || DEFAULT_FOLDER_ID
  const sb = createServiceClient()

  let accounts: GmailAccount[]
  try {
    accounts = await listActiveAccounts()
  } catch (e) {
    return NextResponse.json(
      { error: 'accounts fetch failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
  if (accounts.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: 'no connected Google account — /admin/keiri/gmail-setup で接続してください',
    })
  }

  // Drive にアクセスできる最初のアカウントを使う
  let accessToken: string | null = null
  let usedEmail: string | null = null
  let files: Awaited<ReturnType<typeof listDriveFolderFiles>> = []
  const accountErrors: Record<string, string> = {}
  for (const acct of accounts) {
    try {
      const token = await getAccessToken(acct)
      files = await listDriveFolderFiles(token, folderId, 100)
      accessToken = token
      usedEmail = acct.email
      break
    } catch (e) {
      accountErrors[acct.email] = e instanceof Error ? e.message : String(e)
    }
  }
  if (!accessToken) {
    return NextResponse.json(
      {
        error: 'no account has Drive access — gmail-setup で再接続 (drive.readonly スコープ) が必要',
        accountErrors,
      },
      { status: 503 },
    )
  }

  // 処理済みを除外
  const { data: processedRows } = await sb.from('keiri_drive_processed').select('file_id')
  const processedIds = new Set((processedRows ?? []).map(r => r.file_id as string))
  const fresh = files.filter(f => !processedIds.has(f.id)).slice(0, MAX_FILES_PER_RUN)

  let inserted = 0
  let skipped = 0
  let errors = 0
  const notifications: string[] = []

  for (const f of fresh) {
    const mark = (status: string, reason: string | null, payableId?: string) =>
      sb.from('keiri_drive_processed').insert({
        file_id: f.id,
        file_name: f.name,
        mime_type: f.mimeType,
        status,
        reason,
        payable_id: payableId ?? null,
      })

    if (!SUPPORTED_MIME.has(f.mimeType)) {
      skipped++
      await mark('skipped', `unsupported mime: ${f.mimeType}`)
      continue
    }
    if (f.size && parseInt(f.size, 10) > MAX_FILE_BYTES) {
      skipped++
      await mark('skipped', `file too large: ${f.size} bytes`)
      continue
    }

    let base64: string
    try {
      const buf = await downloadDriveFile(accessToken, f.id)
      base64 = Buffer.from(buf).toString('base64')
    } catch (e) {
      errors++
      await mark('error', `download failed: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    const result = await extractPayableFromDocument({
      fileName: f.name,
      mimeType: f.mimeType,
      base64,
    })

    if (!result || result.confidence === 'low' || result.amount === null || !result.vendor) {
      skipped++
      await mark('skipped', result ? `low_confidence ${result.confidence}: ${result.notes ?? ''}` : 'extraction_failed')
      notifications.push(`⚠️ 読取不可: ${f.name}${result?.notes ? ` (${result.notes})` : ''} — 手動登録してください`)
      continue
    }

    // 繰越請求 (新規買上0) は登録せず記録のみ
    if (result.amount === 0) {
      skipped++
      await mark('skipped', `繰越請求: ${result.notes ?? ''}`)
      notifications.push(`ℹ️ 繰越請求のためスキップ: ${result.vendor} (${f.name})`)
      continue
    }

    // 重複チェック (請求書番号+金額)
    if (result.invoice_number) {
      const { data: dup } = await sb
        .from('keiri_payables')
        .select('id')
        .eq('invoice_number', result.invoice_number)
        .eq('amount', result.amount)
        .limit(1)
        .maybeSingle()
      if (dup) {
        skipped++
        await mark('matched', 'invoice_number duplicate', dup.id as string)
        continue
      }
    }

    let dueDate = result.due_date
    if (!dueDate) {
      const base = result.order_date ? new Date(result.order_date + 'T00:00:00+09:00') : new Date()
      base.setUTCDate(base.getUTCDate() + 30)
      dueDate = base.toISOString().slice(0, 10)
    }

    const { data: insRow, error: insErr } = await sb
      .from('keiri_payables')
      .insert({
        vendor: result.vendor,
        description: result.description,
        amount: result.amount,
        invoice_number: result.invoice_number,
        order_date: result.order_date,
        due_date: dueDate,
        status: 'pending',
        source: 'drive_auto',
        source_email_id: f.id, // Drive file id を流用
        source_email_subject: f.name,
        source_email_from: `drive:請求書_受け箱 (${usedEmail})`,
        notes: result.notes,
        created_by: 'drive-cron',
      })
      .select('id')
      .single()
    if (insErr) {
      errors++
      await mark('error', `insert failed: ${insErr.message}`)
      continue
    }
    inserted++
    await mark('ok', null, insRow.id as string)
    notifications.push(
      `📥 請求書取込: ${result.vendor} ¥${result.amount.toLocaleString()} 期日${dueDate} (${f.name})`,
    )
  }

  if (notifications.length > 0) {
    try {
      await sendTelegramMessage({ text: `【Drive請求書受け箱】\n${notifications.join('\n')}` })
    } catch {
      // 通知失敗は致命的でない
    }
  }

  return NextResponse.json({
    ok: true,
    account: usedEmail,
    folderId,
    filesInFolder: files.length,
    newFiles: fresh.length,
    inserted,
    skipped,
    errors,
  })
}
