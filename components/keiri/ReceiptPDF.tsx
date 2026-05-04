import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { ensureFontsRegistered, FONT_FAMILY } from './_pdfFonts'
import type { CompanyInfo } from '@/lib/keiri/company'

ensureFontsRegistered()

export type ReceiptPDFInput = {
  receipt_number: string
  issue_date: string
  client_name: string
  amount: number
  exclTax: number
  tax: number
  tax_rate: 10 | 8
  purpose: string | null
  payment_method: string | null
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
  title: {
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    marginBottom: 18,
  },
  meta: { fontSize: 10, marginBottom: 2 },
  toName: { fontSize: 14, marginTop: 14 },
  amountBox: {
    marginTop: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#9ca3af',
    alignItems: 'center',
  },
  amountLabel: { fontSize: 9, color: '#6b7280' },
  amountValue: { fontSize: 26, marginTop: 4, letterSpacing: 4 },
  purposeRow: { marginTop: 18, flexDirection: 'row' },
  purposeLabel: { width: 60, color: '#374151' },
  purposeValue: { flex: 1, borderBottomWidth: 1, borderColor: '#d1d5db', paddingBottom: 2 },
  breakdownBox: { marginTop: 22, alignSelf: 'flex-end', width: 220 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  bdLabel: { color: '#374151' },
  bdValue: { color: '#111827' },
  stampBox: {
    position: 'absolute',
    right: 56.7,
    top: 130,
    width: 80,
    height: 80,
    borderWidth: 1,
    borderColor: '#9ca3af',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: { fontSize: 8, color: '#6b7280', textAlign: 'center' },
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
})

function fmt(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`
}

export function ReceiptPDF({ data }: { data: ReceiptPDFInput }) {
  const c = data.company
  const showStamp = data.amount >= 50000
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>領 収 書</Text>

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.meta}>No. {data.receipt_number}</Text>
            <Text style={styles.meta}>発行日: {data.issue_date}</Text>
          </View>
        </View>

        <Text style={styles.toName}>{data.client_name} 様</Text>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>金額</Text>
          <Text style={styles.amountValue}>{fmt(data.amount)}</Text>
        </View>

        <View style={styles.purposeRow}>
          <Text style={styles.purposeLabel}>但し</Text>
          <Text style={styles.purposeValue}>
            {data.purpose ?? ''} として上記の金額を正に領収いたしました
          </Text>
        </View>

        <View style={styles.breakdownBox}>
          <View style={styles.bdRow}>
            <Text style={styles.bdLabel}>税抜金額（{data.tax_rate}%対象）</Text>
            <Text style={styles.bdValue}>{fmt(data.exclTax)}</Text>
          </View>
          <View style={styles.bdRow}>
            <Text style={styles.bdLabel}>消費税（{data.tax_rate}%）</Text>
            <Text style={styles.bdValue}>{fmt(data.tax)}</Text>
          </View>
          {data.payment_method && (
            <View style={styles.bdRow}>
              <Text style={styles.bdLabel}>支払方法</Text>
              <Text style={styles.bdValue}>{data.payment_method}</Text>
            </View>
          )}
        </View>

        {showStamp && (
          <View style={styles.stampBox}>
            <Text style={styles.stampText}>収入印紙{'\n'}貼付欄</Text>
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
