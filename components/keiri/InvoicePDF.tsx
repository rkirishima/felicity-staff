import { Document, Page, Text, View, Image, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import { ensureFontsRegistered, FONT_FAMILY } from './_pdfFonts'
import type { CompanyInfo } from '@/lib/keiri/company'
import type { TaxSummary } from '@/lib/keiri/tax'

ensureFontsRegistered()

// Felicity ロゴの path データ (public/felicity-logo.svg と同一)
const LOGO_PATHS = [
  'M28.33,41.86c.38,0,.67-.35.59-.74-.06-.28-.32-.47-.61-.47h-1.56c.79-2.51,1.83-4.85,2.6-5.85,1.43.49,2.73.86,3.69.87h0c.96,0,1.73-.43,2.04-1.14.27-.61.14-1.31-.34-1.84-1.33-1.47-4.64-.07-5.72.72-.24-.08-.47-.17-.71-.25-2.4-.85-4.88-1.73-6.58-1.56-3.35.34-4.23,2.16-4.37,3.63-.12,1.23.44,2.54,1.42,3.33,1.01.81,2.33,1.01,3.7.57.25-.08.45-.37.42-.64-.04-.4-.43-.63-.79-.52-1.26.41-2.1.03-2.58-.36-.67-.54-1.06-1.43-.97-2.27.15-1.51,1.22-2.34,3.29-2.55,1.43-.15,3.89.73,6.06,1.49.08.03.16.06.24.09-1.08,1.6-2.12,4.44-2.68,6.27h-2.24c-.38,0-.67.35-.59.74.06.28.32.47.61.47h1.86c-.75,2.46-1.78,4.99-3.91,5.99-1.18.55-2.59.47-3.59-.21-.44-.3-1.16-.96-1.1-2.09.07-1.31.99-2.09,1.86-2.28.78-.17,1.45.12,1.79.77.17.33.61.43.92.18.23-.18.28-.51.14-.76-.6-1.11-1.81-1.65-3.11-1.37-1.32.29-2.69,1.45-2.81,3.39-.07,1.26.52,2.41,1.62,3.16.77.52,1.69.79,2.63.79.73,0,1.46-.16,2.15-.48,2.67-1.25,3.82-4.26,4.66-7.08h1.94ZM32.04,33.38c.87-.2,1.57-.16,1.81.11.16.18.21.37.13.54-.09.2-.39.42-.94.42h0c-.62,0-1.51-.22-2.5-.54.43-.21.95-.41,1.5-.53Z',
  'M72.64,49.55h0s-.05-.02-.05-.02c-.31-.11-.65.06-.76.37-.02.05-.52,1.31-3.17,1.88-1.21.26-2.5.15-3.8-.11.72-1.31,1.26-2.8,1.79-4.25.22-.6.42-1.16.64-1.7.31-.77.63-1.5.91-2.11.5-.94.81-1.65.83-1.7.13-.3,0-.64-.29-.79-.29-.14-.64-.03-.8.26-.02.05-.4.76-.89,1.8-1.16,2.15-2.71,4.32-3.76,4.34-.24,0-.28-.07-.3-.1-.06-.1-.33-.74.56-3.03.21-.54.44-1.05.63-1.46.31-.59.5-1,.51-1.03.14-.3.02-.65-.28-.79-.29-.15-.65-.03-.8.25-.02.03-.23.43-.51,1.03-.31.59-.74,1.38-1.24,2.17-1.7,2.7-2.59,2.93-2.83,2.93-.29,0-.4-.12-.47-.23-.19-.32-.46-1.44.89-5.04,0,0,0,0,0-.01h1.8c.4,0,.71-.39.57-.81-.08-.24-.31-.4-.57-.4h-1.22c.92-1.97,1.57-3.59,1.58-3.61.12-.3-.02-.64-.31-.77-.29-.13-.64-.02-.79.27-.04.08-1,1.93-1.89,4.12h-1.44c-.29,0-.55.19-.61.47-.08.39.21.74.59.74h.93s-.03.06-.05.1c-2.5,4.94-3.54,5.09-3.65,5.1-.37,0-.47-.14-.51-.2-.27-.43-.15-1.54.32-2.97.28-.84.61-1.61.79-2.01.09-.19.14-.31.15-.32.13-.3,0-.65-.3-.79-.3-.14-.65-.01-.8.28,0,.02-.08.17-.19.41-.87,1.8-3.08,5.41-5.35,5.68-.92.11-1.56-.06-1.88-.52-.45-.64-.28-1.8.12-2.63.45-.77.9-1.47,1.37-1.79.68-.46,1.32-.39,1.64-.12.25.21.3.52.14.88-.15.34.04.75.42.84.29.07.58-.11.7-.38.36-.84.18-1.71-.48-2.26-.67-.56-1.88-.77-3.09.04-.67.45-1.2,1.25-1.73,2.15-.01.02-.03.04-.04.06,0,0,0,.02-.01.03-.13.23-.27.47-.4.71-1.05,1.9-1.88,3.23-2.99,3.06-.42-.06-.54-.23-.6-.37-.29-.69.3-2.22,1.06-3.6.59-.89.96-1.55.98-1.59.16-.28.07-.64-.21-.81-.27-.17-.63-.1-.82.17-.02.03-.5.72-1.01,1.65-1.43,2.14-3.44,4.48-4.85,4.48,0,0,0,0-.01,0-.22,0-.31-.08-.38-.18-.09-.13-.24-.48-.2-1.29,1.19-1.21,2.54-2.77,3.51-4.48,1.13-1.99,1.74-4.41,1.36-5.41-.15-.38-.4-.54-.59-.6-1.49-.5-3.46,3.4-4.03,4.8-.26.65-1.21,3.08-1.42,5.15-.24.24-.48.46-.69.66-2.08,1.93-3.52,1.31-4.04.96-.15-.1-.29-.22-.41-.36.11-.08.22-.16.34-.24,3.92-2.79,4.09-3.33,4.17-3.62.24-.79-.12-1.48-.93-1.76-1.48-.51-4.33.42-5.23,2.76-.31.8-.28,1.7.03,2.5-1.34.93-2.44,1.65-2.45,1.66-.28.18-.36.56-.17.84.12.18.31.27.51.27.11,0,.23-.03.33-.1.01,0,1.08-.71,2.4-1.62.21.25.45.48.73.66,1.56,1.06,3.59.69,5.45-.98.06.33.17.63.33.87.31.47.79.72,1.38.72,0,0,.01,0,.02,0,1.06,0,2.26-.7,3.57-2.09-.02.4.04.76.17,1.06.18.42.59.94,1.52,1.09.14.02.27.03.4.03,1.17,0,2.04-.85,2.77-1.92.08.3.2.57.37.81.41.58,1.26,1.23,3.01,1.02,1.3-.16,2.61-1.02,3.9-2.58-.06.75.04,1.33.31,1.75.22.35.66.77,1.51.77.01,0,.02,0,.03,0,.6,0,1.43-.35,2.78-2.36-.02.68.08,1.22.32,1.62.22.37.65.81,1.49.82.67,0,1.36-.38,2.14-1.19.17-.18.35-.39.54-.61-.02.7.17,1.02.26,1.16.27.45.76.7,1.36.68.6-.01,1.23-.31,1.89-.89-.47,1.27-.96,2.51-1.58,3.56-.42-.1-.84-.21-1.25-.32-2.51-.67-4.89-1.29-6.61-.05-.73.53-1.03,1.36-.77,2.17.2.63.71,1.19,1.44,1.58.76.41,1.74.64,2.85.65.04,0,.07,0,.11,0,1.95,0,3.51-.87,4.79-2.67,1.56.34,3.18.53,4.73.2,1.39-.3,2.49-.82,3.25-1.54.6-.56.78-1.05.81-1.14v-.04c.11-.29-.05-.6-.34-.7ZM37.66,40.75c.82-2.01,1.86-3.43,2.41-3.92,0,.7-.33,2.34-1.32,4.08-.59,1.04-1.34,2.03-2.1,2.92.25-.98.61-2.08,1.01-3.07ZM29.5,45.56s-.06.05-.1.07c-.12-.45-.11-.92.06-1.35.55-1.43,2.18-2.12,3.21-2.12.19,0,.36.02.5.07.21.07.2.13.17.24-.07.12-.56.76-3.84,3.09ZM59.31,54.23c-1.31-.02-2.86-.47-3.16-1.39-.12-.4.11-.67.33-.83.48-.35,1.08-.49,1.77-.49,1.09,0,2.4.35,3.83.72.27.07.55.15.83.22-.89,1.09-2.03,1.79-3.6,1.77Z',
  'M44.18,40.04c.45.06.83-.28.83-.72v-.02c0-.49-.49-.87-1.01-.67-.27.1-.44.37-.44.66h0c0,.37.26.69.62.74Z',
  'M55.55,40.04c.45.06.83-.28.83-.72v-.02c0-.49-.49-.87-1.01-.67-.27.1-.44.37-.44.66h0c0,.37.26.69.62.74Z',
]

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
  tax_rate: 10 | 8
  amount: number
}

export type InvoicePDFInput = {
  invoice_number: string | null
  issue_date: string
  due_date: string | null
  client_name: string
  client_contact: string | null
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

  // brand footer
  brandBlock: {
    marginTop: 40,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: COLOR.ink,
    paddingTop: 16,
  },
  brandLogo: {
    width: 80,
    height: 80,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontSize: 8,
    color: '#999',
    letterSpacing: 4,
    marginTop: 0,
  },
  brandLegal: {
    fontSize: 7,
    color: '#bbb',
    marginTop: 8,
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
  const fullCompanyAddress = c.postal ? `〒${c.postal}  ${c.address}` : c.address

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
            <Text style={styles.partyLabel}>請　求　元</Text>
            <Text style={styles.companyName}>{c.name}</Text>
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

        {/* BRAND FOOTER */}
        <View style={styles.brandBlock}>
          <Svg style={styles.brandLogo} viewBox="0 0 85.04 85.04">
            {LOGO_PATHS.map((d, i) => (
              <Path key={i} d={d} fill="#231815" />
            ))}
          </Svg>
          <Text style={styles.brandSubtitle}>COFFEE  ROASTERS</Text>
          {(c.name || c.registrationNumber) && (
            <Text style={styles.brandLegal}>
              {c.name}
              {c.registrationNumber ? ` ／ 登録番号: ${c.registrationNumber}` : ''}
            </Text>
          )}
        </View>
      </Page>
    </Document>
  )
}
