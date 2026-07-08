import path from 'path'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { ensureFontsRegistered, FONT_FAMILY } from './_pdfFonts'
import type { CompanyInfo } from '@/lib/keiri/company'
import type { TaxSummary } from '@/lib/keiri/tax'

ensureFontsRegistered()

const logoPath = path.join(process.cwd(), 'public/felicity-logo.png')

// （株） / （有） などの全角ブラケットは多くのフォントで前後余白が出るため
// 半角に正規化して表示する
function normalizeOrgPrefix(s: string): string {
  return s
    .replace(/^（株）/, '(株)')
    .replace(/^（有）/, '(有)')
    .replace(/^（合）/, '(合)')
    .replace(/^（社）/, '(社)')
}

export type InvoicePDFLine = {
  name: string
  quantity: number
  unit_price: number
  tax_rate: 10 | 8 | 0
  amount: number
}

export type InvoicePDFInput = {
  documentType?: 'invoice' | 'quote'
  invoice_number: string | null
  issue_date: string
  due_date: string | null
  expiry_date?: string | null
  client_name: string
  client_contact: string | null
  client_postal: string | null
  client_address: string | null
  notes: string | null
  lines: InvoicePDFLine[]
  summary: TaxSummary
  company: CompanyInfo
  stamp_url?: string | null
  showBank?: boolean
  /** false で末尾のFELICITYロゴを非表示(ROOK名義など別発行元用) */
  showBrandFooter?: boolean
}

const COLOR = {
  ink: '#1c1917',
  body: '#292524',
  muted: '#78716c',
  hairline: '#d6d3d1',
  whisper: '#e7e5e4',
  paperWarm: '#fafaf8',
  beige: '#f5f0e8',
  draftBg: '#fef2f2',
  draftText: '#b91c1c',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 110,
    paddingLeft: 56,
    paddingRight: 56,
    fontSize: 9.5,
    fontFamily: FONT_FAMILY,
    color: COLOR.body,
    lineHeight: 1.5,
  },

  // header
  titleWrap: { position: 'relative', marginBottom: 6 },
  title: {
    fontSize: 18,
    letterSpacing: 12,
    textAlign: 'center',
    color: COLOR.ink,
    paddingTop: 2,
  },
  metaAbs: {
    position: 'absolute',
    top: 2,
    right: 0,
    alignItems: 'flex-end',
  },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaKey: {
    fontSize: 8.5,
    color: COLOR.muted,
    letterSpacing: 1,
    width: 56,
    textAlign: 'right',
    paddingRight: 8,
  },
  metaVal: { fontSize: 9.5, color: COLOR.ink },
  draftBadge: {
    backgroundColor: COLOR.draftBg,
    color: COLOR.draftText,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 9,
    letterSpacing: 3,
    marginBottom: 6,
    borderRadius: 1,
  },
  ruleStrong: {
    borderBottomWidth: 0.75,
    borderColor: COLOR.ink,
    marginTop: 48,
    marginBottom: 22,
  },
  ruleHair: { borderBottomWidth: 0.25, borderColor: COLOR.hairline },

  // parties
  parties: { flexDirection: 'row', position: 'relative' },
  partyLeft: { width: '60%', paddingRight: 24 },
  partyRight: { width: '40%' },
  partyLabel: {
    fontSize: 8,
    color: COLOR.muted,
    letterSpacing: 4,
    marginBottom: 8,
  },
  clientName: {
    fontSize: 11,
    fontWeight: 700,
    color: COLOR.ink,
    letterSpacing: 0.5,
    lineHeight: 1.3,
  },
  clientContact: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  clientAddrLine: {
    fontSize: 8.5,
    color: '#666',
    lineHeight: 1.5,
  },
  clientPostal: {
    fontSize: 8.5,
    color: '#666',
    marginTop: 6,
    lineHeight: 1.5,
  },
  companyName: {
    fontSize: 10.5,
    fontWeight: 700,
    color: COLOR.ink,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  addrLine: { fontSize: 8.5, color: COLOR.body, lineHeight: 1.6 },
  stamp: {
    position: 'absolute',
    top: 22,
    right: 2,
    width: 76,
    height: 76,
    opacity: 0.85,
  },

  // banner (2-col)
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 30,
  },
  bannerNoteCol: { width: '50%', paddingRight: 16 },
  bannerNote: { fontSize: 9, color: COLOR.muted, lineHeight: 1.6 },
  bannerAmtCol: { width: '50%', alignItems: 'flex-end' },
  bannerLabel: {
    fontSize: 8.5,
    color: COLOR.muted,
    letterSpacing: 3,
    marginBottom: 4,
    textAlign: 'right',
  },
  bannerAmount: {
    fontSize: 18,
    color: COLOR.ink,
    letterSpacing: 1,
    textAlign: 'right',
  },

  // table
  table: { marginTop: 22 },
  th: {
    flexDirection: 'row',
    backgroundColor: COLOR.beige,
    borderTopWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: COLOR.ink,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  thCell: { fontSize: 8.5, color: COLOR.ink, letterSpacing: 1 },
  tr: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 0.25,
    borderColor: COLOR.hairline,
  },
  cellName: { flex: 3.2, paddingHorizontal: 4 },
  cellQty: { flex: 0.9, paddingHorizontal: 4, textAlign: 'right' },
  cellUnit: { flex: 1.4, paddingHorizontal: 4, textAlign: 'right' },
  cellRate: { flex: 0.7, paddingHorizontal: 4, textAlign: 'center' },
  cellAmt: { flex: 1.5, paddingHorizontal: 4, textAlign: 'right' },

  // sums
  sumWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18 },
  sumBox: { width: 240 },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    fontSize: 9.5,
  },
  sumRowSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
    fontSize: 8.5,
    color: COLOR.muted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    borderTopWidth: 0.75,
    borderColor: COLOR.ink,
    paddingTop: 8,
  },
  totalLabel: { fontSize: 11, color: COLOR.ink, letterSpacing: 2 },
  totalValue: { fontSize: 13, color: COLOR.ink },

  // bank (compact)
  bankCard: {
    marginTop: 22,
    marginBottom: 14,
    width: 280,
    borderWidth: 0.5,
    borderColor: COLOR.ink,
    backgroundColor: COLOR.paperWarm,
    padding: 6,
  },
  bankHeader: {
    fontSize: 9,
    fontWeight: 700,
    color: COLOR.ink,
    marginBottom: 4,
  },
  bankBody: { fontSize: 9, color: COLOR.ink, lineHeight: 1.6 },
  bankNote: { fontSize: 7, color: '#666', marginTop: 4 },

  // notes
  notesWrap: { marginTop: 14 },
  notesBar: {
    backgroundColor: COLOR.beige,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderTopWidth: 0.25,
    borderBottomWidth: 0.25,
    borderColor: COLOR.hairline,
  },
  notesBarLabel: {
    fontSize: 8,
    color: COLOR.muted,
    letterSpacing: 4,
    textAlign: 'center',
  },
  notesText: { fontSize: 9.5, color: COLOR.body, lineHeight: 1.7, marginTop: 8 },

  // brand footer (anchored to page bottom)
  brandBlock: {
    position: 'absolute',
    bottom: 18,
    left: 56,
    right: 56,
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderColor: COLOR.ink,
    paddingTop: 6,
  },
  brandLogo: {
    width: 160,
    height: 60,
    objectFit: 'contain',
  },
})

function fmt(n: number): string {
  return `¥ ${n.toLocaleString('ja-JP')}`
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaKey}>{k}</Text>
      <Text style={styles.metaVal}>{v}</Text>
    </View>
  )
}

export function InvoicePDF({ data }: { data: InvoicePDFInput }) {
  const c = data.company
  const isQuote = data.documentType === 'quote'
  const isDraft = !isQuote && !data.invoice_number
  const taxTotal = data.summary.tax_10 + data.summary.tax_8
  // 税抜小計は0%対象も含める。total に0%額が含まれるので total - 税額 で全税抜小計が出る。
  const subtotal = data.summary.total - taxTotal
  const subtotal_0 = subtotal - data.summary.subtotal_10 - data.summary.subtotal_8
  const fullCompanyAddress = c.postal ? `〒${c.postal}  ${c.address}` : c.address

  const titleText = isQuote ? '見 積 書' : '請 求 書'
  const numberLabel = isQuote ? 'No.' : 'No.'
  const dateLabel = '発行日'
  const expiryLabel = isQuote ? '有効期限' : '支払期限'
  const expiryDate = isQuote ? (data.expiry_date ?? null) : (data.due_date ?? null)
  const bannerAmountLabel = isQuote ? '御見積金額（税込）' : 'ご請求金額（税込）'
  const bannerNote = isQuote ? '下記の通りお見積もり申し上げます。' : '下記の通りご請求申し上げます。'
  const showBank = data.showBank !== false && !!c.bank

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{titleText}</Text>
          <View style={styles.metaAbs}>
            {isDraft ? (
              <Text style={styles.draftBadge}>下 書 き</Text>
            ) : data.invoice_number ? (
              <MetaRow k={numberLabel} v={data.invoice_number} />
            ) : null}
            <MetaRow k={dateLabel} v={data.issue_date} />
            {expiryDate && <MetaRow k={expiryLabel} v={expiryDate} />}
          </View>
        </View>
        <View style={styles.ruleStrong} />

        {/* PARTIES */}
        <View style={styles.parties}>
          <View style={styles.partyLeft}>
            <Text style={styles.partyLabel}>{isQuote ? '御　見　積　先' : '請　求　先'}</Text>
            <Text style={styles.clientName}>{normalizeOrgPrefix(data.client_name)}　御中</Text>
            {data.client_contact && (
              <Text style={styles.clientContact}>{data.client_contact}　様</Text>
            )}
            {data.client_postal && (
              <Text style={styles.clientPostal}>〒{data.client_postal}</Text>
            )}
            {data.client_address && (
              <Text style={styles.clientAddrLine}>{data.client_address}</Text>
            )}
          </View>
          <View style={styles.partyRight}>
            <Text style={styles.partyLabel}>{isQuote ? '見　積　元' : '請　求　元'}</Text>
            <Text style={styles.companyName}>{c.name}</Text>
            {c.representative ? (
              <Text style={styles.addrLine}>{c.representative}</Text>
            ) : null}
            {(c.postal || c.address) && (
              <Text style={styles.addrLine}>{fullCompanyAddress}</Text>
            )}
            {c.phone && <Text style={styles.addrLine}>TEL  {c.phone}</Text>}
            {c.email && <Text style={styles.addrLine}>{c.email}</Text>}
            {c.registrationNumber && (
              <Text style={styles.addrLine}>登録番号  {c.registrationNumber}</Text>
            )}
          </View>
          {data.stamp_url && (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not HTML img
            <Image src={data.stamp_url} style={styles.stamp} />
          )}
        </View>

        {/* TOTAL BANNER (2-col) */}
        <View style={styles.bannerRow}>
          <View style={styles.bannerNoteCol}>
            <Text style={styles.bannerNote}>{bannerNote}</Text>
          </View>
          <View style={styles.bannerAmtCol}>
            <Text style={styles.bannerLabel}>{bannerAmountLabel}</Text>
            <Text style={styles.bannerAmount}>
              ¥ {data.summary.total.toLocaleString('ja-JP')} -
            </Text>
          </View>
        </View>

        {/* TABLE */}
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={[styles.cellName, styles.thCell]}>品名</Text>
            <Text style={[styles.cellQty, styles.thCell]}>数量</Text>
            <Text style={[styles.cellUnit, styles.thCell]}>単価(税抜)</Text>
            <Text style={[styles.cellRate, styles.thCell]}>税</Text>
            <Text style={[styles.cellAmt, styles.thCell]}>金額</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.cellName}>{l.name}</Text>
              <Text style={styles.cellQty}>{l.quantity.toLocaleString('ja-JP')}</Text>
              <Text style={styles.cellUnit}>{fmt(l.unit_price)}</Text>
              <Text style={styles.cellRate}>{l.tax_rate}%</Text>
              <Text style={styles.cellAmt}>{fmt(l.amount)}</Text>
            </View>
          ))}
        </View>

        {/* SUMS */}
        <View style={styles.sumWrap}>
          <View style={styles.sumBox}>
            <View style={styles.sumRow}>
              <Text>税抜小計</Text>
              <Text>{fmt(subtotal)}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text>消費税</Text>
              <Text>{fmt(taxTotal)}</Text>
            </View>
            {data.summary.subtotal_10 > 0 && (
              <View style={styles.sumRowSub}>
                <Text>　内 10% 対象（税抜 {fmt(data.summary.subtotal_10)}）</Text>
                <Text>{fmt(data.summary.tax_10)}</Text>
              </View>
            )}
            {data.summary.subtotal_8 > 0 && (
              <View style={styles.sumRowSub}>
                <Text>　内 8% 対象（税抜 {fmt(data.summary.subtotal_8)}）</Text>
                <Text>{fmt(data.summary.tax_8)}</Text>
              </View>
            )}
            {subtotal_0 > 0 && (
              <View style={styles.sumRowSub}>
                <Text>　内 0% 対象（非課税・経費）</Text>
                <Text>{fmt(subtotal_0)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>合 計</Text>
              <Text style={styles.totalValue}>{fmt(data.summary.total)}</Text>
            </View>
          </View>
        </View>

        {/* BANK */}
        {showBank && (
          <View style={styles.bankCard}>
            <Text style={styles.bankHeader}>お振込先</Text>
            <Text style={styles.bankBody}>{c.bank}</Text>
            <Text style={styles.bankNote}>
              ※振込手数料は貴社にてご負担くださいますようお願い申し上げます
            </Text>
          </View>
        )}

        {/* NOTES */}
        {data.notes && (
          <View style={styles.notesWrap}>
            <View style={styles.notesBar}>
              <Text style={styles.notesBarLabel}>備　考</Text>
            </View>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* BRAND FOOTER (anchored bottom) */}
        {data.showBrandFooter !== false && (
          <View style={styles.brandBlock} fixed>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image */}
            <Image src={logoPath} style={styles.brandLogo} />
          </View>
        )}
      </Page>
    </Document>
  )
}
