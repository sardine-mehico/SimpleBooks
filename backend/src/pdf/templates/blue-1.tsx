import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// Same Inter latin subset used by grey-1 and orange-1. `Font.register` is
// idempotent per family so re-running it on every module load is safe.
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

// Blue palette — forked from orange-1 with the user's chosen swaps:
//   pageBg : `#F7FAFC` (slate-50)
//   brand  : `#3182CE` (sky-blue accent — title, company name, "BILL TO",
//                       table header text, meta values)
//   deepBg : `#1A365D` (navy — TOTAL row, PAYMENT DETAILS banner, Terms banner)
// Border / muted-ink swapped from warm neutrals to cool slate tones so the
// secondary chrome doesn't fight the blue accents.
const COLOR = {
  pageBg: '#F7FAFC',
  brand: '#3182CE',
  deepBg: '#1A365D',
  brandOnDark: '#ffffff',
  ink: '#1a1a1a',
  inkSoft: '#64748b',
  border: '#cbd5e0',
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
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 50,
    paddingRight: 50,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 50,
  },
  invoiceTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: COLOR.brand,
  },
  companyBlock: { maxWidth: '50%', alignItems: 'flex-start' },
  companyName: { fontSize: 14, fontWeight: 700, color: COLOR.brand, marginBottom: 6 },
  companyLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 3, lineHeight: 1.4 * LH },

  middle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 36,
  },
  billTo: { maxWidth: '50%' },
  billToLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  billToName: { fontSize: 12, fontWeight: 700, color: COLOR.ink, marginBottom: 6 },
  billToLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 3, lineHeight: 1.4 * LH },

  // Meta table sits directly on the page tint — no white fill per the
  // user's blue-1 spec.
  metaTable: {
    width: 220,
    borderWidth: 1,
    borderColor: COLOR.border,
  },
  metaRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
  },
  metaRowLast: { borderBottomWidth: 0 },
  metaLabel: {
    flex: 1,
    paddingTop: 6,
    paddingBottom: 6,
    paddingRight: 8,
    textAlign: 'right',
    fontSize: 10,
    color: COLOR.ink,
    borderRightWidth: 1,
    borderRightColor: COLOR.border,
  },
  metaValue: {
    flex: 1,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    fontSize: 10,
    color: COLOR.brand,
  },

  table: { marginBottom: 4 },
  // 10pt right padding so the AMOUNT label + every $ value below it sit
  // 10pt inset from the page content edge.
  tableHeader: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 8,
    paddingRight: 10,
    borderTopWidth: 1,
    borderTopColor: COLOR.ink,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.ink,
  },
  th: { fontSize: 10, fontWeight: 700, color: COLOR.brand },
  thDescription: { flex: 4 },
  thAmount: { flex: 1.4, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    paddingTop: 9 * RP,
    paddingBottom: 9 * RP,
    paddingRight: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.border,
  },
  td: { fontSize: 10, color: COLOR.ink },
  tdDescription: { flex: 4 },
  tdAmount: { flex: 1.4, textAlign: 'right' },

  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  // -35% width on the Sub Total / GST / Total stack (was 220 → 143).
  // 10pt right padding everywhere matches the tableRow above so the values
  // align in one column 10pt inset from the page-content right edge.
  totalsBox: { width: 143 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
  },
  totalLabel: { fontSize: 11, fontWeight: 700, color: COLOR.ink },
  totalValue: { fontSize: 11, fontWeight: 700, color: COLOR.ink },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLOR.deepBg,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 10,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 12, fontWeight: 700, color: COLOR.brandOnDark, letterSpacing: 1 },
  grandTotalValue: { fontSize: 12, fontWeight: 700, color: COLOR.brandOnDark },

  // PAYMENT DETAILS / Terms banners use the same deep navy as the TOTAL
  // row so the brand mark reads consistently through the footer.
  bannerBox: {
    alignSelf: 'flex-start',
    backgroundColor: COLOR.deepBg,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 10,
    paddingRight: 10,
    marginBottom: 8,
  },
  bannerText: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brandOnDark,
    letterSpacing: 0.6,
  },
  bannerTextSmallCaps: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brandOnDark,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  paymentSection: { marginTop: 48 },
  paymentLine: { fontSize: 10, color: COLOR.ink, marginBottom: 4 },
  termsSection: { marginTop: 36 },
  termsLine: { fontSize: 10, color: COLOR.ink, marginBottom: 4, lineHeight: 1.5 * LH },
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

export default function Blue1Template({ invoice, company, customer }: PdfTemplateProps) {
  const totalsTaxLabel = deriveTaxLabelTotals(invoice);
  const paymentLines = htmlToLines(invoice.paymentDetails);
  const termsLines = (invoice.terms ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  const metaRows: Array<[string, string]> = [
    ['Invoice No', `INV-${invoice.invoiceNumber}`],
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
            {company?.accountsEmail ? (
              <Text style={styles.companyLine}>{company.accountsEmail}</Text>
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
          <View style={styles.metaTable}>
            {metaRows.map(([label, value], i) => (
              <View
                key={label}
                style={[styles.metaRow, i === metaRows.length - 1 ? styles.metaRowLast : {}]}
              >
                <Text style={styles.metaLabel}>{label}</Text>
                <Text style={styles.metaValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.table}>
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
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{totalsTaxLabel}</Text>
              <Text style={styles.totalValue}>{formatCurrency(invoice.taxAmount)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(invoice.totalAmount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.paymentSection}>
          <View style={styles.bannerBox}>
            <Text style={styles.bannerTextSmallCaps}>Payment Details</Text>
          </View>
          {paymentLines.length > 0 ? (
            paymentLines.map((line, i) => (
              <Text key={i} style={styles.paymentLine}>{line}</Text>
            ))
          ) : (
            <Text style={styles.paymentLine}>—</Text>
          )}
        </View>

        {termsLines.length > 0 ? (
          <View style={styles.termsSection}>
            <View style={styles.bannerBox}>
              <Text style={styles.bannerText}>Terms</Text>
            </View>
            {termsLines.map((line, i) => (
              <Text key={i} style={styles.termsLine}>{line}</Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
