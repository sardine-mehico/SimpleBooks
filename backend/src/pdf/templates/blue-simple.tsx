import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// Plus Jakarta Sans throughout — a clean modern humanist sans used widely
// in professional fintech UIs. Pairs with itself across weights, gives the
// template a single typographic voice.
const PJS_DIR =
  path.dirname(require.resolve('@fontsource/plus-jakarta-sans/package.json')) + '/files';
Font.register({
  family: 'Plus Jakarta Sans',
  fonts: [
    { src: `${PJS_DIR}/plus-jakarta-sans-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${PJS_DIR}/plus-jakarta-sans-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

const COLOR = {
  pageBg: '#e8e8eb',          // soft cool grey
  brand: '#1849a6',           // strong navy blue
  blueOnLight: '#1849a6',
  ink: '#1a1a1a',
  inkSoft: '#4a4a4a',         // darker neutral so secondary text reads cleanly
  divider: '#c0c4c9',
  onDark: '#ffffff',
};

const FS = 0.8;
const RP = 0.75;
const LH = 0.75;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Plus Jakarta Sans',
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
  // Same scale as `billToName` below — both 11pt bold blue so the two
  // headings read as siblings of one type system.
  companyName: { fontSize: 11, fontWeight: 700, color: COLOR.brand, marginBottom: 8 },
  companyLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 2, lineHeight: 1.4 * LH },
  invoiceTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 22,
  },
  headerRule: {
    height: 3,
    backgroundColor: COLOR.brand,
    marginTop: 12,
    marginBottom: 22,
  },

  middle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  // Bill To block — thin blue vertical bar on the left, then the label
  // and customer details inset slightly to its right.
  billTo: {
    maxWidth: '55%',
    borderLeftWidth: 2,
    borderLeftColor: COLOR.brand,
    paddingLeft: 10,
  },
  billToLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  billToName: { fontSize: 11, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  billToLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 3, lineHeight: 1.4 * LH },

  // Meta column right-aligned, 180pt wide — matches the mockup placement.
  metaRows: { width: 180 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 4,
    paddingBottom: 4,
  },
  metaLabel: { fontSize: 10, fontWeight: 700, color: COLOR.brand },
  metaValue: { fontSize: 10, color: COLOR.ink, textAlign: 'right' },

  // Items table — full-width blue header bar + plain rows separated by
  // thin grey horizontal dividers.
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.brand,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 16,
  },
  th: { fontSize: 10, fontWeight: 700, color: COLOR.onDark, letterSpacing: 1, textTransform: 'uppercase' },
  thDescription: { flex: 4 },
  thAmount: { flex: 1.4, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    paddingTop: 11 * RP,
    paddingBottom: 11 * RP,
    paddingLeft: 16,
    paddingRight: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.divider,
  },
  td: { fontSize: 10, color: COLOR.ink },
  tdDescription: { flex: 4 },
  tdAmount: { flex: 1.4, textAlign: 'right', fontWeight: 700 },

  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  // -35% width on the Sub Total / GST / Total stack (was 260 → 169).
  totalsBox: { width: 169 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 16,
    paddingRight: 16,
  },
  totalLabel: { fontSize: 10, fontWeight: 700, color: COLOR.brand },
  totalValue: { fontSize: 10, fontWeight: 700, color: COLOR.ink },
  // Final Total row — full blue band with white label + value.
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    backgroundColor: COLOR.brand,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 16,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 12, fontWeight: 700, color: COLOR.onDark },
  grandTotalValue: { fontSize: 12, fontWeight: 700, color: COLOR.onDark },

  // Footer: two columns. TERMS is ~20% wider than PAYMENT DETAILS per the
  // user's spec — implemented as a flex split (5 vs 6) so the terms text
  // wraps later than 50/50 would allow.
  footer: {
    marginTop: 36,
    flexDirection: 'row',
    gap: 28,
  },
  paymentCol: {
    flex: 5,
    borderLeftWidth: 2,
    borderLeftColor: COLOR.brand,
    paddingLeft: 10,
  },
  termsCol: {
    flex: 6,
    borderLeftWidth: 2,
    borderLeftColor: COLOR.brand,
    paddingLeft: 10,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  paymentSubtitle: { fontSize: 10, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  paymentLine: { fontSize: 10, color: COLOR.ink, marginBottom: 4 },
  termsLine: { fontSize: 10, color: COLOR.ink, marginBottom: 6, lineHeight: 1.5 * LH },
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
  const name = names[0]!;
  const rate = invoice.lineItems.find((l) => l.taxName === name)?.taxRate;
  const rateNum = rate != null ? Number(rate) : null;
  if (/\d/.test(name)) return name;
  if (rateNum != null && Number.isFinite(rateNum)) return `${name} (${rateNum}%)`;
  return name;
}

export default function BlueSimpleTemplate({ invoice, company, customer }: PdfTemplateProps) {
  const totalsTaxLabel = deriveTaxLabelTotals(invoice);
  const paymentLines = htmlToLines(invoice.paymentDetails);
  const termsLines = (invoice.terms ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  const metaRows: Array<[string, string]> = [
    ['Invoice No:', `${String(invoice.invoiceNumber).slice(-2)}-${invoice.invoiceNumber}`],
    ['Invoice Date:', formatDdMmYyyy(invoice.invoiceDate)],
    ['Due Date:', formatDdMmYyyy(invoice.dueDate)],
    ['PO Number:', invoice.poNumber ?? ''],
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
            {company?.accountsEmail ? (
              <Text style={styles.companyLine}>{company.accountsEmail}</Text>
            ) : null}
          </View>
          <Text style={styles.invoiceTitle}>Tax Invoice</Text>
        </View>
        <View style={styles.headerRule} />

        <View style={styles.middle}>
          <View style={styles.billTo}>
            <Text style={styles.billToLabel}>Bill To</Text>
            <Text style={styles.billToName}>{customer?.name ?? '—'}</Text>
            {customer?.address
              ? customer.address.split('\n').filter(Boolean).map((line, i) => (
                  <Text key={i} style={styles.billToLine}>{line}</Text>
                ))
              : null}
          </View>
          <View style={styles.metaRows}>
            {metaRows.map(([label, value]) => (
              <View key={label} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{label}</Text>
                <Text style={styles.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

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
          <View style={styles.paymentCol}>
            <Text style={styles.sectionLabel}>Payment Details</Text>
            {paymentLines.length > 0 ? (
              paymentLines.map((line, i) => (
                <Text key={i} style={i === 0 ? styles.paymentSubtitle : styles.paymentLine}>{line}</Text>
              ))
            ) : (
              <Text style={styles.paymentLine}>—</Text>
            )}
          </View>
          <View style={styles.termsCol}>
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
