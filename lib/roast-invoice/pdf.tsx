/**
 * FCR→Felicity 月次請求書 PDF (React-PDF版)。
 * invoice_gen.py のレイアウトをTS/Reactで再実装。
 */

import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer'
import path from 'node:path'

import { type MonthlyInvoiceData, ISSUER, TAX_RATE } from './types'

// 日本語フォント登録(1回だけ)
let fontRegistered = false
function ensureFont() {
  if (fontRegistered) return
  Font.register({
    family: 'NotoSansJP',
    src: path.join(process.cwd(), 'public/fonts/NotoSansJP-Regular.ttf'),
  })
  // 細かいハイフネーション制御
  Font.registerHyphenationCallback((word) => [word])
  fontRegistered = true
}

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const fmtKg = (kg: number) => (Math.abs(kg - Math.round(kg)) < 0.05 ? `${Math.round(kg)} kg` : `${kg.toFixed(1)} kg`)

function lastDay(year: number, month: number): Date {
  return new Date(year, month, 0) // monthは0-indexedなのでこれで該当月の末日
}

function nextMonthLastDay(year: number, month: number): Date {
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  return new Date(ny, nm, 0)
}

function jpDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

const styles = StyleSheet.create({
  page: { fontFamily: 'NotoSansJP', fontSize: 9, padding: 0, color: '#000' },
  // ヘッダ
  logo: { position: 'absolute', top: 38, left: 56, width: 90 },
  title: { position: 'absolute', top: 60, left: 0, right: 0, fontSize: 28, textAlign: 'center', letterSpacing: 6 },
  invoiceNo: { position: 'absolute', top: 110, right: 56, fontSize: 10, textAlign: 'right' },
  // 宛名
  customerWrap: { position: 'absolute', top: 165, left: 56, right: 56 },
  customerName: { fontSize: 16, fontWeight: 700 },
  customerHr: { borderBottomWidth: 0.7, borderBottomColor: '#000', marginTop: 2, width: 175 },
  customerAddr: { fontSize: 9, marginTop: 6, lineHeight: 1.4 },
  // 発行者(右)
  issuerWrap: { position: 'absolute', top: 165, right: 56, width: 230 },
  issuerName: { fontSize: 12, fontWeight: 700 },
  issuerLine: { fontSize: 9, marginTop: 3, lineHeight: 1.4 },
  hanko: { position: 'absolute', top: 195, right: 60, width: 73, height: 73, opacity: 0.85 },
  // 請求金額バナー
  amountBanner: { position: 'absolute', top: 305, left: 56, right: 56, backgroundColor: '#f4f1ea', paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountLabel: { fontSize: 14, fontWeight: 700 },
  amountValue: { fontSize: 20, fontWeight: 700 },
  introText: { position: 'absolute', top: 286, left: 56, fontSize: 11 },
  // テーブル
  table: { position: 'absolute', top: 360, left: 56, right: 56 },
  tableHead: { backgroundColor: '#2c2c2c', flexDirection: 'row', height: 20, alignItems: 'center' },
  tableHeadCell: { fontSize: 10, color: '#fff', fontWeight: 700 },
  tableRow: { flexDirection: 'row', height: 19, alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: '#dddddd' },
  cellName: { paddingLeft: 6, width: '50%' },
  cellQty:  { width: '15%', textAlign: 'right', paddingRight: 8 },
  cellPrice:{ width: '15%', textAlign: 'right', paddingRight: 8 },
  cellAmount:{ width: '20%', textAlign: 'right', paddingRight: 8 },
  tableBorder: { borderWidth: 0.5, borderColor: '#aaaaaa' },
  // 集計
  totalsWrap: { marginTop: 6, alignItems: 'flex-end', paddingRight: 8 },
  totalRow: { flexDirection: 'row', marginTop: 4 },
  totalLabel: { width: 140, textAlign: 'right', paddingRight: 12, fontSize: 10 },
  totalAmount: { width: 80, textAlign: 'right', fontSize: 10 },
  grandLabel: { fontSize: 12, fontWeight: 700 },
  grandAmount: { fontSize: 12, fontWeight: 700 },
  taxNote: { marginTop: 12, fontSize: 8, color: '#444', paddingLeft: 0 },
  // フッタ
  footer: { position: 'absolute', left: 56, right: 56, bottom: 40 },
  payDue: { fontSize: 11, fontWeight: 700 },
  bankLines: { fontSize: 9, marginTop: 6, lineHeight: 1.4 },
})

export type InvoiceMeta = {
  data: MonthlyInvoiceData
  invoiceNumber: string  // 'FCR-2026-05'
  issueDate: Date
  dueDate: Date
  /** 開発確認用に印鑑非表示にしたい時用 */
  hideHanko?: boolean
}

export function InvoiceDocument({ meta }: { meta: InvoiceMeta }) {
  ensureFont()
  const { data, invoiceNumber, issueDate, dueDate, hideHanko } = meta

  // 焙煎代を1行で末尾に表示
  const lineItems = [
    ...data.items.map((it) => ({
      name: it.product,
      qty: it.kg,
      unit: it.green_unit_price,
      amount: it.green_amount,
    })),
    {
      name: `焙煎代（${data.month}月分）`,
      qty: data.items.reduce((s, i) => s + i.kg, 0),
      unit: 1000,
      amount: data.roast_subtotal,
    },
  ]

  return (
    <Document title={`請求書 ${invoiceNumber}`}>
      <Page size="A4" style={styles.page}>
        <Image src={path.join(process.cwd(), 'public/fcr/fcr-logo.png')} style={styles.logo} />
        <Text style={styles.title}>請　求　書</Text>

        <View style={styles.invoiceNo}>
          <Text>請求番号: {invoiceNumber}</Text>
          <Text>発行日: 　{jpDate(issueDate)}</Text>
        </View>

        <View style={styles.customerWrap}>
          <Text style={styles.customerName}>株式会社FELICITY　御中</Text>
          <View style={styles.customerHr} />
          <View style={styles.customerAddr}>
            <Text>〒240-0115</Text>
            <Text>神奈川県三浦郡葉山町上山口2432-3</Text>
          </View>
        </View>

        <View style={styles.issuerWrap}>
          <Text style={styles.issuerName}>{ISSUER.name}</Text>
          {ISSUER.address_lines.map((l) => (
            <Text key={l} style={styles.issuerLine}>{l}</Text>
          ))}
          <Text style={styles.issuerLine}>{ISSUER.tel}</Text>
          <Text style={styles.issuerLine}>{ISSUER.tax_id}</Text>
        </View>

        {!hideHanko && (
          <Image src={path.join(process.cwd(), 'public/fcr/fcr-hanko.png')} style={styles.hanko} />
        )}

        <Text style={styles.introText}>下記のとおりご請求申し上げます。</Text>

        <View style={styles.amountBanner}>
          <Text style={styles.amountLabel}>ご請求金額</Text>
          <Text style={styles.amountValue}>{yen(data.total)}</Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableHead, styles.tableBorder]}>
            <Text style={[styles.tableHeadCell, styles.cellName]}>品　目</Text>
            <Text style={[styles.tableHeadCell, styles.cellQty]}>数量</Text>
            <Text style={[styles.tableHeadCell, styles.cellPrice]}>単価</Text>
            <Text style={[styles.tableHeadCell, styles.cellAmount]}>金額</Text>
          </View>
          <View style={styles.tableBorder}>
            {lineItems.map((it, idx) => (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.cellName}>{it.name}　※</Text>
                <Text style={styles.cellQty}>{fmtKg(it.qty)}</Text>
                <Text style={styles.cellPrice}>{yen(it.unit)}</Text>
                <Text style={styles.cellAmount}>{yen(it.amount)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsWrap}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>小計</Text>
              <Text style={styles.totalAmount}>{yen(data.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>消費税（軽減税率 {Math.round(TAX_RATE * 100)}%）※</Text>
              <Text style={styles.totalAmount}>{yen(data.tax)}</Text>
            </View>
            <View style={[styles.totalRow, { marginTop: 6 }]}>
              <Text style={[styles.totalLabel, styles.grandLabel]}>合計</Text>
              <Text style={[styles.totalAmount, styles.grandAmount]}>{yen(data.total)}</Text>
            </View>
          </View>
          <Text style={styles.taxNote}>※は軽減税率(8%)対象品目です。</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.payDue}>お支払期限: {jpDate(dueDate)}</Text>
          <View style={styles.bankLines}>
            {ISSUER.bank.map((l) => <Text key={l}>{l}</Text>)}
          </View>
        </View>
      </Page>
    </Document>
  )
}

export function defaultMeta(data: MonthlyInvoiceData): InvoiceMeta {
  return {
    data,
    invoiceNumber: `FCR-${data.year}-${String(data.month).padStart(2, '0')}`,
    issueDate: lastDay(data.year, data.month),
    dueDate: nextMonthLastDay(data.year, data.month),
  }
}
