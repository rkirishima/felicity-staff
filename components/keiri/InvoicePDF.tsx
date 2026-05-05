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
    paddingBottom: 64,
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
    fontSize: 22,
    letterSpacing: 18,
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
    marginTop: 14,
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
    fontSize: 14,
    color: COLOR.ink,
    lineHeight: 1.3,
    letterSpacing: 0.5,
  },
  clientHonorific: {
    fontSize: 11,
    color: COLOR.ink,
    marginTop: 2,
    marginBottom: 8,
    letterSpacing: 1,
  },
  companyName: {
    fontSize: 10.5,
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
    fontSize: 22,
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

  // bank
  bankCard: {
    marginTop: 22,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: COLOR.ink,
    backgroundColor: COLOR.paperWarm,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bankHeader: {
    fontSize: 8,
    color: COLOR.muted,
    letterSpacing: 4,
    marginBottom: 8,
  },
  bankBody: { fontSize: 10.5, color: COLOR.ink, lineHeight: 1.7 },
  bankNote: { fontSize: 7.5, color: COLOR.muted, marginTop: 10 },

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

  // footer
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 56,
    right: 56,
    fontSize: 7.5,
    color: COLOR.muted,
    borderTopWidth: 0.25,
    borderColor: COLOR.hairline,
    paddingTop: 8,
    textAlign: 'center',
    letterSpacing: 1,
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
  const isDraft = !data.invoice_number
  const subtotal = data.summary.subtotal_10 + data.summary.subtotal_8
  const taxTotal = data.summary.tax_10 + data.summary.tax_8

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.titleWrap}>
          <Text style={styles.title}>請 求 書</Text>
          <View style={styles.metaAbs}>
            {isDraft ? (
              <Text style={styles.draftBadge}>下 書 き</Text>
            ) : (
              <MetaRow k="No." v={data.invoice_number ?? ''} />
            )}
            <MetaRow k="発行日" v={data.issue_date} />
            {data.due_date && <MetaRow k="支払期限" v={data.due_date} />}
          </View>
        </View>
        <View style={styles.ruleStrong} />

        {/* PARTIES */}
        <View style={styles.parties}>
          <View style={styles.partyLeft}>
            <Text style={styles.partyLabel}>請　求　先</Text>
            <Text style={styles.clientName}>{data.client_name}</Text>
            <Text style={styles.clientHonorific}>御中</Text>
            {data.client_postal && <Text style={styles.addrLine}>〒{data.client_postal}</Text>}
            {data.client_address && <Text style={styles.addrLine}>{data.client_address}</Text>}
          </View>
          <View style={styles.partyRight}>
            <Text style={styles.partyLabel}>請　求　元</Text>
            <Text style={styles.companyName}>{c.name}</Text>
            {(c.postal || c.address) && (
              <Text style={styles.addrLine}>
                {c.postal ? `〒${c.postal}　` : ''}
                {c.address}
              </Text>
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
            <Text style={styles.bannerNote}>下記の通りご請求申し上げます。</Text>
          </View>
          <View style={styles.bannerAmtCol}>
            <Text style={styles.bannerLabel}>ご請求金額（税込）</Text>
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
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>合 計</Text>
              <Text style={styles.totalValue}>{fmt(data.summary.total)}</Text>
            </View>
          </View>
        </View>

        {/* BANK */}
        {c.bank && (
          <View style={styles.bankCard}>
            <Text style={styles.bankHeader}>お　振　込　先</Text>
            <Text style={styles.bankBody}>{c.bank}</Text>
            <Text style={styles.bankNote}>
              ※ 振込手数料は貴社にてご負担くださいますようお願い申し上げます
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

        {/* FOOTER */}
        <View style={styles.footer} fixed>
          <Text>
            {c.name}
            {c.registrationNumber ? `　／　登録番号 ${c.registrationNumber}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
