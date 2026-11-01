import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cronAuth'
import { sendTelegramMessage } from '@/lib/telegram'
import {
  fetchPrintLabelItems,
  PRINT_LABEL_ATTR_ID,
  PrintLabelCatalogError,
  type SquareItem,
} from '@/lib/square/print-label'

// ラベル対象カタログの監査 (1日2回: 8:05 / 12:05 JST)。
//
// POS の自動ラベル印刷は Square の print_label 属性が付いた商品だけを印刷する。
// 属性が外れると、その豆は売れても黙ってラベルが出なくなる。実際に
// 2026-10-10 の商品編集で Brazil Santa Alina の属性が消え、11/01 に客の目の前で
// ラベルが出ないまで3週間誰も気づかなかった。印刷側は「対象外」と区別できないので、
// カタログ側から先に見つける:
//
//  1. 豆の商品 (豆カテゴリ or 説明文に "print_label") なのに属性が yes でない
//  2. print_label 検索そのものが 0 件 (Square の検索仕様変更。9月と10/8に発生)
//
// 問題がある間は毎回鳴らす (1日2回なので騒がしくはない)。

// Square の「コーヒー豆」カテゴリ。豆の商品はほぼ全部ここに入っている。
const BEAN_CATEGORY_ID = '64VVPGJJRUYYSGQC3HDF4QI6'

const SQUARE_LIST_URL = 'https://connect.squareup.com/v2/catalog/list'

type AuditItem = SquareItem & {
  item_data?: SquareItem['item_data'] & {
    description_plaintext?: string
    categories?: Array<{ id: string }>
    reporting_category?: { id: string }
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function listAllItems(token: string): Promise<AuditItem[]> {
  const items: AuditItem[] = []
  let cursor: string | undefined
  do {
    const url = new URL(SQUARE_LIST_URL)
    url.searchParams.set('types', 'ITEM')
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Square-Version': '2024-01-18' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new PrintLabelCatalogError('Square catalog list failed', err)
    }
    const data = await res.json()
    items.push(...((data.objects ?? []) as AuditItem[]))
    cursor = data.cursor || undefined
  } while (cursor)
  return items
}

function isBeanItem(item: AuditItem): boolean {
  const d = item.item_data
  if (!d) return false
  if (d.categories?.some(c => c.id === BEAN_CATEGORY_ID)) return true
  if (d.reporting_category?.id === BEAN_CATEGORY_ID) return true
  return /print_label/i.test(d.description_plaintext ?? '')
}

// hasPrintLabelYes は属性が返らないと true にする (検索結果を信用する用)。
// 監査では「属性が無い」こと自体を見つけたいので厳密に判定する。
function hasPrintLabelStrict(item: AuditItem): boolean {
  const attr = Object.values(item.custom_attribute_values ?? {})
    .find(v => v.custom_attribute_definition_id === PRINT_LABEL_ATTR_ID)
  return /(^|[\s=])yes$/i.test(attr?.string_value?.trim() ?? '')
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.SQUARE_ACCESS_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN not configured' }, { status: 503 })
  }

  let all: AuditItem[]
  let searchCount: number
  try {
    ;[all, searchCount] = await Promise.all([
      listAllItems(token),
      fetchPrintLabelItems(token).then(r => r.length),
    ])
  } catch (err) {
    const detail = err instanceof PrintLabelCatalogError ? JSON.stringify(err.detail) : String(err)
    console.error('[label-catalog-audit] Square query failed:', detail)
    await sendTelegramMessage({ text: `🏷⚠️ ラベル対象カタログの監査に失敗しました\n${esc(detail.slice(0, 300))}` })
    return NextResponse.json({ error: 'Square query failed' }, { status: 502 })
  }

  const missing = all
    .filter(i => !i.is_deleted && !i.is_archived && !i.item_data?.is_archived)
    .filter(isBeanItem)
    .filter(i => !hasPrintLabelStrict(i))
    .map(i => (i.item_data?.name ?? i.id).replace(/\s+/g, ' ').trim())

  const lines: string[] = []
  if (searchCount === 0) {
    lines.push('・print_label 検索が0件です。スタッフのラベル画面とECの自動印刷が全部止まっています（Square の検索仕様変更の可能性）。')
  }
  if (missing.length > 0) {
    lines.push(
      '・次の豆に print_label が付いていません。レジで売れてもラベルが出ません:',
      ...missing.map(n => `　- ${esc(n)}`),
      'Square の商品編集 → カスタム属性 print_label を「print_label = yes」にしてください。',
    )
  }

  if (lines.length > 0) {
    await sendTelegramMessage({ text: `🏷❌ ラベル自動印刷の設定に問題があります\n${lines.join('\n')}` })
  }

  return NextResponse.json({ ok: lines.length === 0, search_count: searchCount, missing })
}
