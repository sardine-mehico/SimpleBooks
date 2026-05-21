import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// pink-berry — light silvery-grey page tint, pink BILL TO + meta cards with
// a thick berry-red left bar, a full-width berry-red items header, zebra
// striped rows, and a footer split into PAYMENT DETAILS + TERMS columns.
// Sticks with Inter (already loaded) since the mockup's typography fits.
const FONT_DIR =
  path.dirname(require.resolve('@fontsource/inter/package.json')) + '/files';
Font.register({
  family: 'Inter',
  fonts: [
    { src: `${FONT_DIR}/inter-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FONT_DIR}/inter-latin-600-normal.woff`, fontWeight: 600 },
    { src: `${FONT_DIR}/inter-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

const COLOR = {
  pageBg: '#ffffff',          // plain white per user request
  cardBg: '#f5e2e8',          // pale pink for BILL TO + meta cards
  brand: '#b51449',           // deep berry red — headings, banners, total
  rowDivider: '#dcdfe5',      // thin grey line between line items
  ink: '#1a1a1a',
  inkSoft: '#6b7280',
  divider: '#cbd5e0',
  onDark: '#ffffff',
};

const FS = 0.8;
const RP = 0.75;
const LH = 0.75;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 13 * FS,
    color: COLOR.ink,
    backgroundColor: COLOR.pageBg,
    flexDirection: 'column',
    paddingTop: 32,
    paddingBottom: 32,
    paddingLeft: 40,
    paddingRight: 40,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  companyBlock: { maxWidth: '60%' },
  // Same scale as `billToName` (customer name) below — both 11pt bold so
  // the two headings read as siblings.
  companyName: { fontSize: 11, fontWeight: 700, color: COLOR.brand, marginBottom: 6 },
  companyLine: { fontSize: 10, color: COLOR.ink, marginBottom: 2, lineHeight: 1.4 * LH },
  invoiceTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
    // +25pt above the title so it lines up nearer the address block on the
    // left rather than the company name.
    marginTop: 25,
  },
  headerRule: {
    height: 2,
    backgroundColor: COLOR.brand,
    marginTop: 14,
    marginBottom: 18,
  },

  midRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 18,
  },
  billToCard: {
    flex: 1,
    backgroundColor: COLOR.cardBg,
    borderLeftWidth: 5,
    borderLeftColor: COLOR.brand,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
  },
  // Meta card fixed at 200pt and gets the matching berry left bar so it
  // visually mirrors BILL TO.
  metaCard: {
    width: 200,
    backgroundColor: COLOR.cardBg,
    borderLeftWidth: 5,
    borderLeftColor: COLOR.brand,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: 14,
  },
  billToLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'left',
    marginBottom: 10,
  },
  billToName: { fontSize: 11, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  billToLine: { fontSize: 10, color: COLOR.ink, marginBottom: 3, lineHeight: 1.4 * LH },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingTop: 4,
    paddingBottom: 4,
  },
  // Smaller label so the narrower meta card still fits "Invoice Date" +
  // value on one line.
  metaLabel: { fontSize: 9, fontWeight: 700, color: COLOR.brand, flexShrink: 0, marginRight: 8 },
  metaValue: { fontSize: 10, fontWeight: 700, color: COLOR.ink, flex: 1, textAlign: 'right' },

  // Full-width berry-red table header. 6pt right padding gives a breathing
  // gap after the AMOUNT label and every value below — applied consistently
  // to tableRow + totalRow + grandTotalRow so the column stays aligned.
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.brand,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 6,
  },
  th: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.onDark,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  thDescription: { flex: 4 },
  thAmount: { flex: 1.4, textAlign: 'right' },
  // No zebra striping — every row sits on white with a thin grey divider
  // separating them. 6pt right padding gives a breathing gap after each
  // amount (matches the header + totals on the right side).
  tableRow: {
    flexDirection: 'row',
    paddingTop: 10 * RP,
    paddingBottom: 10 * RP,
    paddingLeft: 16,
    paddingRight: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.rowDivider,
  },
  td: { fontSize: 10, color: COLOR.ink },
  tdDescription: { flex: 4 },
  tdAmount: { flex: 1.4, textAlign: 'right', fontWeight: 700 },

  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 14,
  },
  // -50% width (was 260 → 130) and the whole stack right-aligned. Inside
  // each row both label and value are right-aligned text via flex layout.
  totalsBox: { width: 130 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 4,
    paddingBottom: 4,
    paddingRight: 6,
  },
  totalLabel: { fontSize: 11, fontWeight: 700, color: COLOR.brand, textAlign: 'right' },
  totalValue: { fontSize: 11, fontWeight: 700, color: COLOR.ink, textAlign: 'right' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLOR.brand,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    // 6pt right padding matches the rest of the right-side column.
    paddingRight: 6,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR.onDark,
    textAlign: 'right',
  },
  grandTotalValue: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR.onDark,
    textAlign: 'right',
  },

  // Footer divider + stacked PAYMENT DETAILS then TERMS, each full-width.
  footer: {
    marginTop: 32,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: COLOR.divider,
    flexDirection: 'column',
  },
  paymentBlock: { marginBottom: 24 },
  termsBlock: { width: '100%' },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  paymentSubtitle: { fontSize: 10, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  paymentLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 4 },
  termsLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 4, lineHeight: 1.5 * LH },
});

function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function formatDdMmYyyy(d?: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function htmlToLines(html?: string | null): string[] {
  if (!html) return [];
  const text = html
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<(p|div)(\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

function deriveTaxLabelTotals(invoice: PdfTemplateProps['invoice']): string {
  const names = Array.from(
    new Set(invoice.lineItems.map((l) => l.taxName).filter((n): n is string => !!n)),
  );
  if (names.length === 0) return 'Tax';
  if (names.length > 1) return 'TAX';
  // Keep the rate suffix here ("GST (10%)") since the mockup includes it.
  const name = names[0]!;
  const rate = invoice.lineItems.find((l) => l.taxName === name)?.taxRate;
  const rateNum = rate != null ? Number(rate) : null;
  const nameAlreadyHasRate = /\d/.test(name);
  if (nameAlreadyHasRate) return name;
  if (rateNum != null && Number.isFinite(rateNum)) return `${name} (${rateNum}%)`;
  return name;
}

export default function PinkBerryTemplate({ invoice, company, customer }: PdfTemplateProps) {
  const totalsTaxLabel = deriveTaxLabelTotals(invoice);
  const paymentLines = htmlToLines(invoice.paymentDetails);
  const termsLines = (invoice.terms ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  const metaRows: Array<[string, string]> = [
    ['Invoice No', `${String(invoice.invoiceNumber).slice(-2)}-${invoice.invoiceNumber}`],
    ['Invoice Date', formatDdMmYyyy(invoice.invoiceDate)],
    ['Due Date', formatDdMmYyyy(invoice.dueDate)],
    ['PO Number', invoice.poNumber ?? ''],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{company?.name ?? 'Your Company'}</Text>
            {company?.abn ? <Text style={styles.companyLine}>ABN: {company.abn}</Text> : null}
            {company?.address
              ? company.address.split('\n').filter(Boolean).map((line, i) => (
                  <Text key={i} style={styles.companyLine}>{line}</Text>
                ))
              : null}
            {/* accounts email rendered with the same style as address lines
                — same colour, same font weight, sits flush with the last
                address line so the four lines read as one block. */}
            {company?.accountsEmail ? (
              <Text style={styles.companyLine}>{company.accountsEmail}</Text>
            ) : null}
          </View>
          <Text style={styles.invoiceTitle}>Tax Invoice</Text>
        </View>
        <View style={styles.headerRule} />

        <View style={styles.midRow}>
          <View style={styles.billToCard}>
            <Text style={styles.billToLabel}>Bill To</Text>
            <Text style={styles.billToName}>{customer?.name ?? '—'}</Text>
            {customer?.address
              ? customer.address.split('\n').filter(Boolean).map((line, i) => (
                  <Text key={i} style={styles.billToLine}>{line}</Text>
                ))
              : null}
          </View>
          <View style={styles.metaCard}>
            {metaRows.map(([label, value]) => (
              <View key={label} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{label}</Text>
                <Text style={styles.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Items table — full-width berry header + zebra rows. */}
        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thDescription]}>Items &amp; Description</Text>
            <Text style={[styles.th, styles.thAmount]}>Amount</Text>
          </View>
          {invoice.lineItems.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, styles.tdDescription]}>{line.description}</Text>
              <Text style={[styles.td, styles.tdAmount]}>{formatCurrency(line.lineAmount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sub Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{totalsTaxLabel}</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.taxAmount)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(invoice.totalAmount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.paymentBlock}>
            <Text style={styles.sectionLabel}>Payment Details</Text>
            <Text style={styles.paymentSubtitle}>Bank Details</Text>
            {paymentLines.length > 0 ? (
              paymentLines.map((line, i) => (
                <Text key={i} style={styles.paymentLine}>{line}</Text>
              ))
            ) : (
              <Text style={styles.paymentLine}>—</Text>
            )}
          </View>
          <View style={styles.termsBlock}>
            <Text style={styles.sectionLabel}>Terms</Text>
            {termsLines.length > 0 ? (
              termsLines.map((line, i) => (
                <Text key={i} style={styles.termsLine}>{line}</Text>
              ))
            ) : (
              <Text style={styles.termsLine}>—</Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}
