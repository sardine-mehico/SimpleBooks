import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// green-pro uses DM Sans throughout — a geometric humanist sans that pairs
// with itself across weights, giving the template a single professional
// voice without juggling display + body families. Two weights loaded
// (400 + 700), ~25 KB each WOFF, well inside the 180 KB/page budget.
const DM_SANS_DIR =
  path.dirname(require.resolve('@fontsource/dm-sans/package.json')) + '/files';
Font.register({
  family: 'DM Sans',
  fonts: [
    { src: `${DM_SANS_DIR}/dm-sans-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${DM_SANS_DIR}/dm-sans-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

const COLOR = {
  pageBg: '#ffffff',
  bandBg: '#eaf1f4',         // light blue-grey behind header + totals card
  brand: '#2c8a92',          // desaturated teal — TAX INVOICE, table header,
                             //   TOTAL, section labels
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
    fontFamily: 'DM Sans',
    fontSize: 13 * FS,
    color: COLOR.ink,
    backgroundColor: COLOR.pageBg,
    flexDirection: 'column',
  },

  // Header band — light blue-grey wash, company on the left and Tax Invoice
  // on the right. A 3pt teal rule sits just below.
  headerBand: {
    backgroundColor: COLOR.bandBg,
    paddingTop: 24,
    paddingBottom: 22,
    paddingLeft: 40,
    paddingRight: 40,
  },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  companyBlock: { maxWidth: '60%' },
  // Same scale as `billToName` below — both 11pt bold so the two headings
  // read as siblings rather than parent/child.
  companyName: { fontSize: 11, fontWeight: 700, color: COLOR.ink, marginBottom: 6 },
  companyLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 2, lineHeight: 1.4 * LH },
  companyEmail: { fontSize: 10, color: COLOR.brand, fontWeight: 700, marginTop: 6, lineHeight: 1.4 * LH },
  invoiceTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  headerRule: {
    height: 3,
    backgroundColor: COLOR.brand,
  },

  middle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 28,
    paddingBottom: 26,
    paddingLeft: 40,
    paddingRight: 40,
  },
  billTo: { maxWidth: '50%' },
  billToLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.ink,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  billToName: { fontSize: 11, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  billToLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 3, lineHeight: 1.4 * LH },

  metaRows: { width: 150 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingTop: 4,
    paddingBottom: 4,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: COLOR.inkSoft,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flexShrink: 0,
    marginRight: 8,
  },
  metaValue: { fontSize: 10, color: COLOR.ink, flex: 1, textAlign: 'right' },

  tableContainer: {
    paddingLeft: 40,
    paddingRight: 40,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.brand,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 16,
    paddingRight: 16,
  },
  th: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.onDark,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  thDescription: { flex: 4 },
  thAmount: { flex: 1.4, textAlign: 'right' },
  // Plain rows, no zebra, no divider — matches the calm look of the mockup.
  tableRow: {
    flexDirection: 'row',
    paddingTop: 9 * RP,
    paddingBottom: 9 * RP,
    paddingLeft: 16,
    paddingRight: 16,
  },
  td: { fontSize: 10, color: COLOR.ink },
  tdDescription: { flex: 4 },
  tdAmount: { flex: 1.4, textAlign: 'right' },

  // Right-floated totals card with the same blue-grey tint as the header
  // band. The TOTAL row is set in bold teal — both label and value — so
  // the eye lands there.
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: 40,
    paddingRight: 40,
    marginTop: 16,
  },
  totalsCard: {
    // -35% width on the Sub Total / GST / Total card (was 260 → 169).
    width: 169,
    backgroundColor: COLOR.bandBg,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 3,
    paddingBottom: 3,
  },
  totalLabel: { fontSize: 10, color: COLOR.ink },
  totalValue: { fontSize: 11, fontWeight: 700, color: COLOR.ink },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  grandTotalValue: {
    fontSize: 15,
    fontWeight: 700,
    color: COLOR.brand,
  },

  footer: {
    paddingLeft: 40,
    paddingRight: 40,
    marginTop: 40,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  paymentSubtitle: { fontSize: 10, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  paymentLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 4 },
  termsSection: { marginTop: 28 },
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
  return names[0]!.replace(/\s*\d+(\.\d+)?%$/, '');
}

export default function GreenProTemplate({ invoice, company, customer }: PdfTemplateProps) {
  const totalsTaxLabel = deriveTaxLabelTotals(invoice);
  const paymentLines = htmlToLines(invoice.paymentDetails);
  const termsLines = (invoice.terms ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  const metaRows: Array<[string, string]> = [
    ['Invoice#', `${String(invoice.invoiceNumber).slice(-2)}-${invoice.invoiceNumber}`],
    ['Invoice Date', formatDdMmYyyy(invoice.invoiceDate)],
    ['Due Date', formatDdMmYyyy(invoice.dueDate)],
    ['P.O.#', invoice.poNumber ?? ''],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBand}>
          <View style={styles.headerInner}>
            <View style={styles.companyBlock}>
              <Text style={styles.companyName}>{company?.name ?? 'Your Company'}</Text>
              {company?.abn ? <Text style={styles.companyLine}>ABN: {company.abn}</Text> : null}
              {company?.address
                ? company.address.split('\n').filter(Boolean).map((line, i) => (
                    <Text key={i} style={styles.companyLine}>{line}</Text>
                  ))
                : null}
              {company?.accountsEmail ? (
                <Text style={styles.companyEmail}>{company.accountsEmail}</Text>
              ) : null}
            </View>
            <Text style={styles.invoiceTitle}>Tax Invoice</Text>
          </View>
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

        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thDescription]}>Description</Text>
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
          <View style={styles.totalsCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
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
          <Text style={styles.sectionLabel}>Payment Details</Text>
          {paymentLines.length > 0 ? (
            paymentLines.map((line, i) => (
              <Text key={i} style={i === 0 ? styles.paymentSubtitle : styles.paymentLine}>{line}</Text>
            ))
          ) : (
            <Text style={styles.paymentLine}>—</Text>
          )}

          {termsLines.length > 0 ? (
            <View style={styles.termsSection}>
              <Text style={styles.sectionLabel}>Terms</Text>
              {termsLines.map((line, i) => (
                <Text key={i} style={styles.termsLine}>{line}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
