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

  payoutCard: { marginBottom: 14 },
  payoutHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  payoutDate: { fontSize: 11, color: COLOR.ink },
  payoutAmount: { fontSize: 12, color: COLOR.ink },
  payoutMeta: { fontSize: 7.5, color: COLOR.muted, marginTop: 1, marginBottom: 4 },

  table: { backgroundColor: COLOR.beige, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8 },
  th: { flexDirection: 'row', paddingVertical: 2 },
  thCell: { fontSize: 7.5, color: COLOR.muted },
  tr: { flexDirection: 'row', paddingVertical: 2, borderTopWidth: 0.25, borderColor: COLOR.hairline },
  cLabel: { flex: 1.3 },
  cNum: { flex: 1, textAlign: 'right' },
  amber: { color: COLOR.amber },

  totalCard: { marginTop: 4, padding: 10, backgroundColor: COLOR.ink, borderRadius: 4 },
  totalTh: { flexDirection: 'row', paddingVertical: 2 },
  totalThCell: { fontSize: 7.5, color: '#aaa', letterSpacing: 1 },
  totalTr: { flexDirection: 'row', paddingVertical: 2, borderTopWidth: 0.25, borderColor: '#44403c' },
  totalText: { color: '#fff' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderColor: '#57534e' },
  grandLabel: { color: '#aaa', fontSize: 8.5, letterSpacing: 2 },
  grandValue: { color: '#6ee7b7', fontSize: 14 },

  note: { fontSize: 7.5, color: COLOR.muted, marginTop: 10 },
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

export type RateBucket = { gross: number; fee: number; net: number }
export type PayoutForPDF = {
  payout_id: string
  arrival_date: string | null
  amount: number
  fee_amount: number
  gross_amount: number
  charge_count: number
  refund_count: number
  period_start: string | null
  period_end: string | null
  tax_breakdown: {
    '8'?: RateBucket
    '10'?: RateBucket
    unknown?: RateBucket
    unmatched_charges?: number
  } | null
}

export type StripePayoutsPDFInput = {
  month: string
  generatedAt: string
  company: { name: string; postal: string; address: string; phone: string; registrationNumber?: string }
  payouts: PayoutForPDF[]
}

const RATE_LABEL: Record<'8' | '10' | 'unknown', string> = {
  '8': '8%（軽減税率 食品等）',
  '10': '10%（標準税率）',
  unknown: '未分類・調整',
}

function BreakdownRows({ breakdown }: { breakdown: PayoutForPDF['tax_breakdown'] }) {
  if (!breakdown) return null
  return (
    <>
      {(['8', '10', 'unknown'] as const).map(k => {
        const b = breakdown[k]
        if (!b || (b.gross === 0 && b.fee === 0)) return null
        const isUnknown = k === 'unknown'
        return (
          <View key={k} style={styles.tr}>
            <Text style={isUnknown ? [styles.cLabel, styles.amber] : styles.cLabel}>{RATE_LABEL[k]}</Text>
            <Text style={isUnknown ? [styles.cNum, styles.amber] : styles.cNum}>{fmt(b.gross)}</Text>
            <Text style={isUnknown ? [styles.cNum, styles.amber] : styles.cNum}>{fmt(b.fee)}</Text>
            <Text style={isUnknown ? [styles.cNum, styles.amber] : styles.cNum}>{fmt(b.net)}</Text>
          </View>
        )
      })}
    </>
  )
}

export function StripePayoutsPDF({ data }: { data: StripePayoutsPDFInput }) {
  const [y, m] = data.month.split('-')
  const monthLabel = `${y}年${parseInt(m, 10)}月`

  const tot: Record<'8' | '10' | 'unknown', RateBucket> = {
    '8': { gross: 0, fee: 0, net: 0 },
    '10': { gross: 0, fee: 0, net: 0 },
    unknown: { gross: 0, fee: 0, net: 0 },
  }
  for (const p of data.payouts) {
    for (const k of ['8', '10', 'unknown'] as const) {
      const b = p.tax_breakdown?.[k]
      if (!b) continue
      tot[k].gross += b.gross
      tot[k].fee += b.fee
      tot[k].net += b.net
    }
  }
  const payoutTotal = data.payouts.reduce((s, p) => s + p.amount, 0)

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
        <Text style={styles.title}>Stripe 入 金 レ ポ ー ト（税率別）</Text>
        <Text style={styles.subtitle}>{monthLabel}  /  発行 {data.generatedAt.slice(0, 10)}  /  EC felicity.cafe クレジット・銀行振込決済</Text>
        <View style={styles.rule} />

        {data.payouts.length === 0 && (
          <Text style={styles.note}>この月の入金はありません。</Text>
        )}

        {data.payouts.map(p => (
          <View key={p.payout_id} style={styles.payoutCard} wrap={false}>
            <View style={styles.payoutHead}>
              <Text style={styles.payoutDate}>{p.arrival_date ?? '—'} 入金</Text>
              <Text style={styles.payoutAmount}>{fmt(p.amount)}</Text>
            </View>
            <Text style={styles.payoutMeta}>
              対象期間 {p.period_start ?? '—'} 〜 {p.period_end ?? '—'}
              {'   '}決済 {p.charge_count}件{p.refund_count > 0 ? ` / 返金 ${p.refund_count}件` : ''}
              {'   '}売上総額 {fmt(p.gross_amount)} − 手数料 {fmt(p.fee_amount)}
              {'   '}({p.payout_id})
            </Text>
            <View style={styles.table}>
              <View style={styles.th}>
                <Text style={[styles.thCell, styles.cLabel]}>税区分</Text>
                <Text style={[styles.thCell, styles.cNum]}>売上高（税込）</Text>
                <Text style={[styles.thCell, styles.cNum]}>手数料</Text>
                <Text style={[styles.thCell, styles.cNum]}>差引入金額</Text>
              </View>
              <BreakdownRows breakdown={p.tax_breakdown} />
            </View>
          </View>
        ))}

        {data.payouts.length > 0 && (
          <View style={styles.totalCard} wrap={false}>
            <View style={styles.totalTh}>
              <Text style={[styles.totalThCell, styles.cLabel]}>{monthLabel} 税率別合計</Text>
              <Text style={[styles.totalThCell, styles.cNum]}>売上高（税込）</Text>
              <Text style={[styles.totalThCell, styles.cNum]}>手数料</Text>
              <Text style={[styles.totalThCell, styles.cNum]}>差引入金額</Text>
            </View>
            {(['8', '10', 'unknown'] as const).map(k =>
              tot[k].gross !== 0 || tot[k].fee !== 0 ? (
                <View key={k} style={styles.totalTr}>
                  <Text style={[styles.totalText, styles.cLabel]}>{RATE_LABEL[k]}</Text>
                  <Text style={[styles.totalText, styles.cNum]}>{fmt(tot[k].gross)}</Text>
                  <Text style={[styles.totalText, styles.cNum]}>{fmt(tot[k].fee)}</Text>
                  <Text style={[styles.totalText, styles.cNum]}>{fmt(tot[k].net)}</Text>
                </View>
              ) : null,
            )}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>入 金 合 計（実 額）</Text>
              <Text style={styles.grandValue}>{fmt(payoutTotal)}</Text>
            </View>
          </View>
        )}

        <Text style={styles.note}>
          ※ 売上高は税込のStripe決済総額。1つの決済に8%と10%の商品が混在する場合は商品明細の金額比で按分。
          「未分類・調整」はRadar手数料・入金失敗の戻り等、売上に紐づかない調整分。
        </Text>

        <View style={styles.footer} fixed>
          <Text>{data.company.name} — Stripe 入金レポート {monthLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
