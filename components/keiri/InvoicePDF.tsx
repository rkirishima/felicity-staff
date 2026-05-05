import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { ensureFontsRegistered, FONT_FAMILY } from './_pdfFonts'
import type { CompanyInfo } from '@/lib/keiri/company'
import type { TaxSummary } from '@/lib/keiri/tax'

ensureFontsRegistered()

export type InvoicePDFLine = {
  name: string
  quantity: number
  unit_price: number
  tax_rate: 10 | 8
  amount: number
}

export type InvoicePDFInput = {
  invoice_number: string | null
  issue_date: string
  due_date: string | null
  client_name: string
  client_postal: string | null
  client_address: string | null
  notes: string | null
  lines: InvoicePDFLine[]
  summary: TaxSummary
  company: CompanyInfo
  stamp_url?: string | null
}

const COLOR = {
  text: '#1c1917',
  muted: '#78716c',
  borderStrong: '#1c1917',
  borderWeak: '#e7e5e4',
  accentBg: '#fafaf9',
  headerBg: '#f5f0e8',
  draftBg: '#fef2f2',
  draftText: '#b91c1c',
  watermark: '#fde2e2',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingLeft: 50,
    paddingRight: 50,
    fontSize: 10,
    fontFamily: FONT_FAMILY,
    color: COLOR.text,
  },

  // header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: { fontSize: 32, letterSpacing: 12, fontWeight: 700 },
  metaCol: { alignItems: 'flex-end' },
  meta: { fontSize: 9, color: COLOR.muted, marginBottom: 2 },
  draftBadge: {
    backgroundColor: COLOR.draftBg,
    color: COLOR.draftText,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
    borderRadius: 2,
  },
  stamp: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 64,
    height: 64,
    opacity: 0.7,
  },
  watermark: {
    position: 'absolute',
    top: 320,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 110,
    color: COLOR.watermark,
    letterSpacing: 18,
    opacity: 0.55,
  },

  divider: {
    borderBottomWidth: 0.75,
    borderColor: COLOR.borderStrong,
    marginTop: 14,
  },
  weakDivider: {
    borderBottomWidth: 0.25,
    borderColor: COLOR.borderWeak,
  },

  // parties
  parties: { flexDirection: 'row', marginTop: 20 },
  partyLeft: { width: '55%', paddingRight: 16 },
  partyRight: { width: '45%' },
  partyLabel: {
    fontSize: 9,
    color: COLOR.muted,
    letterSpacing: 2,
    marginBottom: 6,
  },
  clientName: { fontSize: 16, fontWeight: 700, marginBottom: 6 },
  companyName: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  addrLine: { fontSize: 9, lineHeight: 1.6 },

  // total banner
  banner: { marginTop: 26 },
  bannerLabel: {
    fontSize: 9,
    color: COLOR.muted,
    letterSpacing: 2,
    marginBottom: 6,
  },
  bannerAmount: { fontSize: 28, fontWeight: 700, letterSpacing: 1 },
  bannerRule: {
    borderBottomWidth: 0.25,
    borderColor: COLOR.borderWeak,
    marginTop: 10,
  },
  bannerNote: { fontSize: 9, color: COLOR.muted, marginTop: 8 },

  // table
  table: { marginTop: 22 },
  th: {
    flexDirection: 'row',
    backgroundColor: COLOR.headerBg,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderTopWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: COLOR.borderStrong,
  },
  thCell: { fontSize: 9 },
  tr: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.25,
    borderColor: COLOR.borderWeak,
  },
  trAlt: { backgroundColor: COLOR.accentBg },
  cellName: { flex: 3, paddingHorizontal: 4 },
  cellQty: { flex: 1, paddingHorizontal: 4, textAlign: 'right' },
  cellUnit: { flex: 1.5, paddingHorizontal: 4, textAlign: 'right' },
  cellRate: { flex: 0.7, paddingHorizontal: 4, textAlign: 'center' },
  cellAmt: { flex: 1.5, paddingHorizontal: 4, textAlign: 'right' },

  // sums
  sumWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  sumBox: { width: 260 },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    fontSize: 10,
  },
  sumRowSub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1,
    fontSize: 9,
    color: COLOR.muted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    borderTopWidth: 0.75,
    borderColor: COLOR.borderStrong,
    paddingTop: 8,
  },
  totalLabel: { fontSize: 12 },
  totalValue: { fontSize: 14, fontWeight: 700 },

  // bank card
  bankCard: {
    marginTop: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLOR.borderStrong,
    backgroundColor: COLOR.accentBg,
    padding: 12,
  },
  bankHeader: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 6,
  },
  bankDivider: {
    borderBottomWidth: 0.25,
    borderColor: COLOR.borderWeak,
    marginBottom: 8,
  },
  bankBody: { fontSize: 11, lineHeight: 1.6 },
  bankNote: { fontSize: 8, color: COLOR.muted, marginTop: 10 },

  // notes
  notesWrap: { marginTop: 10 },
  notesLabel: {
    fontSize: 9,
    color: COLOR.muted,
    letterSpacing: 2,
    marginBottom: 4,
  },
  notesText: { fontSize: 10, lineHeight: 1.6 },

  // footer
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 50,
    right: 50,
    fontSize: 8,
    color: COLOR.muted,
    borderTopWidth: 0.25,
    borderColor: COLOR.borderWeak,
    paddingTop: 6,
    textAlign: 'center',
  },
})

function fmt(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`
}

export function InvoicePDF({ data }: { data: InvoicePDFInput }) {
  const c = data.company
  const isDraft = !data.invoice_number
  const subtotal = data.summary.subtotal_10 + data.summary.subtotal_8
  const taxTotal = data.summary.tax_10 + data.summary.tax_8

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isDraft && (
          <Text style={styles.watermark} fixed>
            DRAFT
          </Text>
        )}

        {/* HEADER */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>請求書</Text>
          <View style={styles.metaCol}>
            {isDraft ? (
              <Text style={styles.draftBadge}>下書き</Text>
            ) : (
              <Text style={styles.meta}>No. {data.invoice_number}</Text>
            )}
            <Text style={styles.meta}>発行日: {data.issue_date}</Text>
            {data.due_date && <Text style={styles.meta}>支払期限: {data.due_date}</Text>}
          </View>
          {data.stamp_url && (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not HTML img
            <Image src={data.stamp_url} style={styles.stamp} />
          )}
        </View>
        <View style={styles.divider} />

        {/* PARTIES */}
        <View style={styles.parties}>
          <View style={styles.partyLeft}>
            <Text style={styles.partyLabel}>請 求 先</Text>
            <Text style={styles.clientName}>{data.client_name} 御中</Text>
            {data.client_postal && <Text style={styles.addrLine}>〒{data.client_postal}</Text>}
            {data.client_address && <Text style={styles.addrLine}>{data.client_address}</Text>}
          </View>
          <View style={styles.partyRight}>
            <Text style={styles.partyLabel}>請 求 元</Text>
            <Text style={styles.companyName}>{c.name}</Text>
            {(c.postal || c.address) && (
              <Text style={styles.addrLine}>
                {c.postal ? `〒${c.postal} ` : ''}
                {c.address}
              </Text>
            )}
            {c.phone && <Text style={styles.addrLine}>TEL: {c.phone}</Text>}
            {c.email && <Text style={styles.addrLine}>Email: {c.email}</Text>}
            {c.registrationNumber && (
              <Text style={styles.addrLine}>登録番号: {c.registrationNumber}</Text>
            )}
          </View>
        </View>

        {/* TOTAL BANNER */}
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>ご 請 求 金 額（税込）</Text>
          <Text style={styles.bannerAmount}>
            ¥ {data.summary.total.toLocaleString('ja-JP')} -
          </Text>
          <View style={styles.bannerRule} />
          <Text style={styles.bannerNote}>下記の通りご請求申し上げます。</Text>
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
            <View key={i} style={i % 2 === 1 ? [styles.tr, styles.trAlt] : styles.tr}>
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
              <Text>消費税合計</Text>
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
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>合計（税込）</Text>
              <Text style={styles.totalValue}>{fmt(data.summary.total)}</Text>
            </View>
          </View>
        </View>

        {/* BANK CARD */}
        {c.bank && (
          <View style={styles.bankCard}>
            <Text style={styles.bankHeader}>お 振 込 先</Text>
            <View style={styles.bankDivider} />
            <Text style={styles.bankBody}>{c.bank}</Text>
            <Text style={styles.bankNote}>
              ※振込手数料は貴社にてご負担くださいますようお願い申し上げます
            </Text>
          </View>
        )}

        {/* NOTES */}
        {data.notes && (
          <View style={styles.notesWrap}>
            <Text style={styles.notesLabel}>備 考</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text>
            {c.name}
            {c.registrationNumber ? `　／　登録番号: ${c.registrationNumber}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
