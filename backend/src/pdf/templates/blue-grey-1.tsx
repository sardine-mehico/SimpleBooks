import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// blue-grey-1 introduces a new typeface pairing:
//   - Oswald 700        → display sans for "TAX INVOICE", "TOTAL", and the
//                         uppercase small-caps section labels (BILL TO,
//                         INVOICE#, DESCRIPTION, PAYMENT DETAILS, TERMS).
//   - Source Sans 3     → humanist sans for company name, customer name,
//                         body lines, line items, and totals values.
// Both are latin-subset WOFFs from @fontsource — three font files total at
// ~25–35 KB each, comfortably inside the 180 KB/page budget.
const SOURCE_SANS_DIR =
  path.dirname(require.resolve('@fontsource/source-sans-3/package.json')) + '/files';
const OSWALD_DIR =
  path.dirname(require.resolve('@fontsource/oswald/package.json')) + '/files';

Font.register({
  family: 'Source Sans 3',
  fonts: [
    { src: `${SOURCE_SANS_DIR}/source-sans-3-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${SOURCE_SANS_DIR}/source-sans-3-latin-700-normal.woff`, fontWeight: 700 },
  ],
});
Font.register({
  family: 'Oswald',
  fonts: [
    { src: `${OSWALD_DIR}/oswald-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

const COLOR = {
  pageBg: '#ffffff',
  topBand: '#2d3748',       // slate-700 — top header band
  tableHeader: '#4a5568',   // slate-600 — table header bar
  ink: '#1a1a1a',
  inkSoft: '#64748b',
  brand: '#4299e1',         // sky/light-blue accent (TAX INVOICE, TOTAL,
                            //   small-caps labels, accountsEmail link)
  totalsCardBg: '#eef4fb',  // very pale blue tint behind the totals box
  divider: '#e2e8f0',
  onDark: '#ffffff',
  onDarkSoft: '#cbd5e0',    // muted slate-300 for ABN/address on dark band
};

const FS = 0.8;
const RP = 0.75;
const LH = 0.75;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Source Sans 3',
    fontSize: 13 * FS,
    color: COLOR.ink,
    backgroundColor: COLOR.pageBg,
    flexDirection: 'column',
  },

  topBand: {
    backgroundColor: COLOR.topBand,
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 50,
    paddingRight: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  companyBlock: { maxWidth: '60%' },
  companyName: { fontSize: 14, fontWeight: 700, color: COLOR.onDark, marginBottom: 6 },
  companyLine: { fontSize: 10, color: COLOR.onDarkSoft, marginBottom: 2, lineHeight: 1.4 * LH },
  companyEmail: { fontSize: 10, color: COLOR.brand, marginTop: 4, lineHeight: 1.4 * LH },
  invoiceTitle: {
    fontFamily: 'Oswald',
    fontSize: 22,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  middle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 28,
    paddingBottom: 24,
    paddingLeft: 50,
    paddingRight: 50,
  },
  billTo: { maxWidth: '50%' },
  billToLabel: {
    fontFamily: 'Oswald',
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.inkSoft,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  billToName: { fontSize: 12, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  billToLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 3, lineHeight: 1.4 * LH },

  // -35% width on the meta column (was 220 → 143).
  metaRows: { width: 143 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingTop: 4,
    paddingBottom: 4,
  },
  metaLabel: {
    fontFamily: 'Oswald',
    fontSize: 9,
    fontWeight: 700,
    color: COLOR.inkSoft,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    flexShrink: 0,
    marginRight: 8,
  },
  metaValue: { fontSize: 10, color: COLOR.ink, flex: 1, textAlign: 'right' },

  // Slate table header bar (slightly lighter than the top band).
  tableContainer: {
    paddingLeft: 50,
    paddingRight: 50,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.tableHeader,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 16,
    paddingRight: 16,
  },
  th: {
    fontFamily: 'Oswald',
    fontSize: 11,
    fontWeight: 700,
    color: COLOR.onDark,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  thDescription: { flex: 4 },
  thAmount: { flex: 1.4, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    paddingTop: 9 * RP,
    paddingBottom: 9 * RP,
    paddingLeft: 16,
    paddingRight: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.divider,
  },
  td: { fontSize: 10, color: COLOR.ink },
  tdDescription: { flex: 4 },
  tdAmount: { flex: 1.4, textAlign: 'right' },

  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: 50,
    paddingRight: 50,
    marginTop: 24,
  },
  totalsCard: {
    // -35% width on the Sub Total / GST / Total card (was 240 → 156).
    width: 156,
    backgroundColor: COLOR.totalsCardBg,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 3,
    paddingBottom: 3,
  },
  totalLabel: { fontSize: 10, color: COLOR.inkSoft },
  totalValue: { fontSize: 11, fontWeight: 700, color: COLOR.ink },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
  },
  grandTotalLabel: {
    fontFamily: 'Oswald',
    fontSize: 16,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  grandTotalValue: {
    fontFamily: 'Oswald',
    fontSize: 18,
    fontWeight: 700,
    color: COLOR.brand,
  },

  footer: {
    paddingLeft: 50,
    paddingRight: 50,
    marginTop: 40,
  },
  sectionLabel: {
    fontFamily: 'Oswald',
    fontSize: 11,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  paymentLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 4 },
  paymentLineStrong: { fontSize: 11, color: COLOR.ink, fontWeight: 700, marginBottom: 4 },
  termsSection: { marginTop: 40 },
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

export default function BlueGrey1Template({ invoice, company, customer }: PdfTemplateProps) {
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
        {/* Dark slate band with company on the left, TAX INVOICE in bold
            light-blue Oswald on the right. */}
        <View style={styles.topBand}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{company?.name ?? 'Your Company'}</Text>
            {company?.abn ? <Text style={styles.companyLine}>ABN: {company.abn}</Text> : null}
            {company?.address
              ? (
                <Text style={styles.companyLine}>
                  {company.address.split('\n').filter(Boolean).join(', ')}
                </Text>
              )
              : null}
            {company?.accountsEmail ? (
              <Text style={styles.companyEmail}>{company.accountsEmail}</Text>
            ) : null}
          </View>
          <Text style={styles.invoiceTitle}>Tax Invoice</Text>
        </View>

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
              <Text key={i} style={i === 0 ? styles.paymentLineStrong : styles.paymentLine}>{line}</Text>
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
