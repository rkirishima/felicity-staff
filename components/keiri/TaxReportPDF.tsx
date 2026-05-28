import path from 'path'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { ensureFontsRegistered, FONT_FAMILY } from './_pdfFonts'

ensureFontsRegistered()

const logoPath = path.join(process.cwd(), 'public/felicity-logo.png')

const COLOR = {
  ink: '#1c1917',
  body: '#292524',
  muted: '#78716c',
  hairline: '#d6d3d1',
  beige: '#f5f0e8',
  amber: '#b45309',
  emerald: '#047857',
  rose: '#be123c',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 60, paddingHorizontal: 40,
    fontSize: 9, fontFamily: FONT_FAMILY, color: COLOR.body, lineHeight: 1.4,
  },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  brandLogo: { width: 110, height: 32, objectFit: 'contain' },
  brandMeta: { textAlign: 'right' },
  title: { fontSize: 13, color: COLOR.ink, letterSpacing: 4, marginTop: 6 },
  subtitle: { fontSize: 8.5, color: COLOR.muted, marginTop: 2 },
  rule: { borderBottomWidth: 0.6, borderColor: COLOR.ink, marginVertical: 10 },
  ruleHair: { borderBottomWidth: 0.25, borderColor: COLOR.hairline, marginVertical: 4 },
  sectionTitle: { fontSize: 10, color: COLOR.ink, letterSpacing: 2, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rowLabel: { color: COLOR.body, flex: 1 },
  rowValue: { color: COLOR.ink, fontFamily: FONT_FAMILY },
  rowAmber: { color: COLOR.amber },
  rowMuted: { color: COLOR.muted, fontSize: 8 },
  totalCard: {
    marginTop: 16, padding: 10,
    backgroundColor: COLOR.ink, borderRadius: 4,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { color: '#aaa', fontSize: 8.5, letterSpacing: 2 },
  totalValue: { color: '#fff', fontSize: 14 },
  profitLabel: { color: '#aaa', fontSize: 8.5, letterSpacing: 2 },
  profitValue: { color: '#6ee7b7', fontSize: 14 },
  expenseValue: { color: '#fda4af', fontSize: 11 },
  footer: {
    position: 'absolute', bottom: 18, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7, color: COLOR.muted,
    borderTopWidth: 0.25, borderColor: COLOR.hairline, paddingTop: 4,
  },
})

function fmt(n: number): string {
  return `¥ ${n.toLocaleString('ja-JP')}`
}

export type TaxReportPDFInput = {
  month: string
  generatedAt: string
  company: { name: string; postal: string; address: string; phone: string; registrationNumber?: string }
  buckets: { dine_in_10: number; goods_10: number; beans_8: number; takeout_8: number; unknown: number }
  stripeByRate: { '10': number; '8': number; unknown: number }
  invoice: { subtotal_10: number; subtotal_8: number; total: number; count: number }
  expenses: { total: number; count: number }
  bank: { credit: number; debit: number; count: number }
  orderTotal: number
  squareTotal: number
}

function R({ label, value, amber }: { label: string; value: number; amber?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={amber ? [styles.rowLabel, styles.rowAmber] : styles.rowLabel}>{label}</Text>
      <Text style={amber ? [styles.rowValue, styles.rowAmber] : styles.rowValue}>{fmt(value)}</Text>
    </View>
  )
}

export function TaxReportPDF({ data }: { data: TaxReportPDFInput }) {
  const sub10 = data.buckets.dine_in_10 + data.buckets.goods_10
  const sub8 = data.buckets.beans_8 + data.buckets.takeout_8
  const salesTotal = data.squareTotal + data.orderTotal + data.invoice.total
  const profit = salesTotal - data.expenses.total

  const [y, m] = data.month.split('-')
  const monthLabel = `${y}年${parseInt(m, 10)}月`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoPath} style={styles.brandLogo} />
          <View style={styles.brandMeta}>
            <Text style={styles.subtitle}>{data.company.name}</Text>
            <Text style={styles.subtitle}>〒{data.company.postal}  {data.company.address}</Text>
            <Text style={styles.subtitle}>TEL  {data.company.phone}</Text>
            {data.company.registrationNumber && (
              <Text style={styles.subtitle}>登録番号  {data.company.registrationNumber}</Text>
            )}
          </View>
        </View>
        <Text style={styles.title}>月 次 税 務 レ ポ ー ト</Text>
        <Text style={styles.subtitle}>{monthLabel}  /  発行 {data.generatedAt.slice(0, 10)}</Text>
        <View style={styles.rule} />

        {/* 店舗 Square */}
        <Text style={styles.sectionTitle}>① 店舗 Square（4区分）</Text>
        <R label="🍽 10% イートイン" value={data.buckets.dine_in_10} />
        <R label="👕 10% 物販（グッズ）" value={data.buckets.goods_10} />
        <View style={styles.ruleHair} />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, styles.rowMuted]}>10% 小計</Text>
          <Text style={[styles.rowValue, styles.rowMuted]}>{fmt(sub10)}</Text>
        </View>
        <R label="☕ 8% 豆等の物販" value={data.buckets.beans_8} />
        <R label="🥡 8% テイクアウト" value={data.buckets.takeout_8} />
        <View style={styles.ruleHair} />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, styles.rowMuted]}>8% 小計</Text>
          <Text style={[styles.rowValue, styles.rowMuted]}>{fmt(sub8)}</Text>
        </View>
        {data.buckets.unknown > 0 && <R label="❓ 未分類" value={data.buckets.unknown} amber />}
        <View style={styles.ruleHair} />
        <R label="Square 合計" value={data.squareTotal} />

        {/* EC Stripe */}
        <Text style={styles.sectionTitle}>② EC Stripe</Text>
        <R label="💳 10% 物販" value={data.stripeByRate['10']} />
        <R label="💳 8% 豆・食品" value={data.stripeByRate['8']} />
        {data.stripeByRate.unknown > 0 && <R label="❓ 未分類" value={data.stripeByRate.unknown} amber />}
        <View style={styles.ruleHair} />
        <R label="Stripe 合計（注文ベース）" value={data.orderTotal} />

        {/* 業販請求書 */}
        <Text style={styles.sectionTitle}>③ 業販請求書（入金確認済）</Text>
        <R label={`8% 税抜 — ${data.invoice.count}件`} value={data.invoice.subtotal_8} />
        <R label="10% 税抜" value={data.invoice.subtotal_10} />
        <View style={styles.ruleHair} />
        <R label="請求書 合計（税込）" value={data.invoice.total} />

        {/* 経費 */}
        <Text style={styles.sectionTitle}>④ 経費</Text>
        <R label={`経費合計 — ${data.expenses.count}件`} value={data.expenses.total} />

        {/* 銀行 */}
        <Text style={styles.sectionTitle}>⑤ 銀行入出金（参考・売上合計には未加算）</Text>
        <R label="入金合計" value={data.bank.credit} />
        <R label="出金合計" value={data.bank.debit} />

        {/* Totals */}
        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>📊 売上合計</Text>
            <Text style={styles.totalValue}>{fmt(salesTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>経費</Text>
            <Text style={styles.expenseValue}>−{fmt(data.expenses.total)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTopWidth: 0.5, borderColor: '#444', marginTop: 4, paddingTop: 6 }]}>
            <Text style={styles.profitLabel}>粗利</Text>
            <Text style={styles.profitValue}>{fmt(profit)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>FELICITY 月次税務レポート — {monthLabel}</Text>
          <Text>{data.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
