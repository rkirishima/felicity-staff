import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
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
  invoice_number: string
  issue_date: string
  due_date: string | null
  client_name: string
  client_postal: string | null
  client_address: string | null
  notes: string | null
  lines: InvoicePDFLine[]
  summary: TaxSummary
  company: CompanyInfo
}

const styles = StyleSheet.create({
  page: {
    padding: 56.7,
    fontSize: 10,
    fontFamily: FONT_FAMILY,
    color: '#1f2937',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, letterSpacing: 6, marginBottom: 16 },
  metaCol: { textAlign: 'right' },
  meta: { fontSize: 10, marginBottom: 2 },
  block: { marginTop: 14 },
  clientName: { fontSize: 14 },
  table: { marginTop: 18, borderTopWidth: 1, borderColor: '#9ca3af' },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 6,
  },
  th: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#9ca3af',
    paddingVertical: 6,
    backgroundColor: '#f5f0e8',
  },
  cellName: { flex: 4, paddingHorizontal: 4 },
  cellQty: { flex: 1, paddingHorizontal: 4, textAlign: 'right' },
  cellUnit: { flex: 1.5, paddingHorizontal: 4, textAlign: 'right' },
  cellRate: { flex: 1, paddingHorizontal: 4, textAlign: 'right' },
  cellAmt: { flex: 2, paddingHorizontal: 4, textAlign: 'right' },
  summary: { marginTop: 14, alignSelf: 'flex-end', width: 240 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  sumLabel: { color: '#374151' },
  sumValue: { color: '#111827' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    borderTopWidth: 1,
    borderColor: '#9ca3af',
    paddingTop: 6,
  },
  totalLabel: { fontSize: 12 },
  totalValue: { fontSize: 16 },
  notesBox: {
    marginTop: 18,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
    minHeight: 50,
  },
  sectionLabel: { fontSize: 9, color: '#6b7280', marginBottom: 4 },
  bankBox: { marginTop: 14, padding: 8, backgroundColor: '#f9fafb', borderRadius: 4 },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 56.7,
    right: 56.7,
    fontSize: 9,
    color: '#4b5563',
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    paddingTop: 8,
    textAlign: 'right',
  },
  yen: {},
})

function fmt(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`
}

export function InvoicePDF({ data }: { data: InvoicePDFInput }) {
  const c = data.company
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>請 求 書</Text>
          </View>
          <View style={styles.metaCol}>
            <Text style={styles.meta}>No. {data.invoice_number}</Text>
            <Text style={styles.meta}>発行日: {data.issue_date}</Text>
            {data.due_date && <Text style={styles.meta}>支払期限: {data.due_date}</Text>}
          </View>
        </View>

        <View style={styles.block}>
          {data.client_postal && <Text>〒{data.client_postal}</Text>}
          {data.client_address && <Text>{data.client_address}</Text>}
          <Text style={styles.clientName}>{data.client_name} 御中</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.cellName}>品名</Text>
            <Text style={styles.cellQty}>数量</Text>
            <Text style={styles.cellUnit}>単価(税抜)</Text>
            <Text style={styles.cellRate}>税率</Text>
            <Text style={styles.cellAmt}>金額</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.cellName}>{l.name}</Text>
              <Text style={styles.cellQty}>{l.quantity.toLocaleString()}</Text>
              <Text style={styles.cellUnit}>{fmt(l.unit_price)}</Text>
              <Text style={styles.cellRate}>{l.tax_rate}%</Text>
              <Text style={styles.cellAmt}>{fmt(l.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.summary}>
          {data.summary.subtotal_10 > 0 && (
            <>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>10% 対象 税抜小計</Text>
                <Text style={styles.sumValue}>{fmt(data.summary.subtotal_10)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>10% 消費税</Text>
                <Text style={styles.sumValue}>{fmt(data.summary.tax_10)}</Text>
              </View>
            </>
          )}
          {data.summary.subtotal_8 > 0 && (
            <>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>8% 対象 税抜小計</Text>
                <Text style={styles.sumValue}>{fmt(data.summary.subtotal_8)}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>8% 消費税</Text>
                <Text style={styles.sumValue}>{fmt(data.summary.tax_8)}</Text>
              </View>
            </>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>合計（税込）</Text>
            <Text style={styles.totalValue}>{fmt(data.summary.total)}</Text>
          </View>
        </View>

        {data.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.sectionLabel}>備考</Text>
            <Text>{data.notes}</Text>
          </View>
        )}

        {c.bank && (
          <View style={styles.bankBox}>
            <Text style={styles.sectionLabel}>お振込先</Text>
            <Text>{c.bank}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{c.name}</Text>
          {c.postal && <Text>〒{c.postal} {c.address}</Text>}
          {c.phone && <Text>TEL: {c.phone}</Text>}
          {c.email && <Text>{c.email}</Text>}
          {c.registrationNumber && <Text>登録番号: {c.registrationNumber}</Text>}
        </View>
      </Page>
    </Document>
  )
}
