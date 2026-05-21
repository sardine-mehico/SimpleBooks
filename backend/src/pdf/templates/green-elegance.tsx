import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// green-elegance uses Manrope throughout — a clean modern humanist sans
// that reads elegantly at small sizes and pairs with itself across weights.
const MANROPE_DIR =
  path.dirname(require.resolve('@fontsource/manrope/package.json')) + '/files';
Font.register({
  family: 'Manrope',
  fonts: [
    { src: `${MANROPE_DIR}/manrope-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${MANROPE_DIR}/manrope-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

const COLOR = {
  pageBg: '#f0f4ee',          // very light page, lightened ~20% from
                              // `#ededed` with a soft green tint (G > R, B)
                              // so the page reads on the same family as the
                              // sage accents below
  brand: '#6b958f',           // muted sage / desaturated teal
  bandSoft: '#cfdcd9',        // pale sage for the items header + total row
  ink: '#1a1a1a',
  inkSoft: '#6b7280',
  dashed: '#9aa3ab',          // colour of the dashed separator lines
};

const FS = 0.8;
const RP = 0.75;
const LH = 0.75;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Manrope',
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
    marginBottom: 14,
  },
  companyBlock: { maxWidth: '60%' },
  // Matches `billToName` (customer name) below — both 11pt bold sage so
  // the two headings read as siblings of one type system.
  companyName: { fontSize: 11, fontWeight: 700, color: COLOR.brand, marginBottom: 6 },
  companyLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 2, lineHeight: 1.4 * LH },
  companyEmail: { fontSize: 10, color: COLOR.brand, marginTop: 4, lineHeight: 1.4 * LH },
  invoiceTitle: {
    fontSize: 22,
    fontWeight: 400,
    color: COLOR.brand,
    marginTop: 8,
  },

  // Dashed horizontal rule used between major sections. React-PDF supports
  // `borderStyle: 'dashed'` on a View with a single border edge.
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: COLOR.dashed,
    borderStyle: 'dashed',
    marginTop: 10,
    marginBottom: 18,
  },

  middle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  billTo: { maxWidth: '50%' },
  billToLabel: {
    fontSize: 11,
    fontWeight: 400,
    color: COLOR.brand,
    marginBottom: 8,
  },
  billToName: { fontSize: 11, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  billToLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 3, lineHeight: 1.4 * LH },

  // Narrow meta column, right-aligned via the parent flex `justify-content:
  // space-between`. Labels left, values right inside a fixed 170pt frame.
  metaRows: { width: 170 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 3,
    paddingBottom: 3,
  },
  metaLabel: { fontSize: 10, color: COLOR.brand },
  metaValue: { fontSize: 10, color: COLOR.ink, textAlign: 'right' },

  // Items table — pale sage header bar + dashed dividers between rows.
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.bandSoft,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
  },
  th: { fontSize: 10, fontWeight: 700, color: COLOR.ink },
  thDescription: { flex: 4 },
  thAmount: { flex: 1.4, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    paddingTop: 9 * RP,
    paddingBottom: 9 * RP,
    paddingLeft: 14,
    paddingRight: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.dashed,
    borderStyle: 'dashed',
  },
  tableRowLast: { borderBottomWidth: 0 },
  td: { fontSize: 10, color: COLOR.ink },
  tdDescription: { flex: 4 },
  tdAmount: { flex: 1.4, textAlign: 'right' },

  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  // -35% width on the Sub Total / GST / Total stack (was 260 → 169).
  totalsBox: { width: 169 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 14,
    paddingRight: 14,
  },
  totalLabel: { fontSize: 10, color: COLOR.ink },
  totalValue: { fontSize: 10, color: COLOR.ink },
  // Final Total row gets the same pale sage band as the items header.
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    backgroundColor: COLOR.bandSoft,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 11, color: COLOR.brand },
  grandTotalValue: { fontSize: 11, fontWeight: 700, color: COLOR.ink },

  footerSection: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 400,
    color: COLOR.brand,
    marginBottom: 8,
  },
  paymentSubtitle: { fontSize: 10, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  paymentLine: { fontSize: 10, color: COLOR.ink, marginBottom: 3 },
  termsLine: { fontSize: 10, color: COLOR.ink, marginBottom: 3, lineHeight: 1.5 * LH },
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
  // Keep "GST (10%)" form since the mockup includes the rate.
  const name = names[0]!;
  const rate = invoice.lineItems.find((l) => l.taxName === name)?.taxRate;
  const rateNum = rate != null ? Number(rate) : null;
  if (/\d/.test(name)) return name;
  if (rateNum != null && Number.isFinite(rateNum)) return `${name} (${rateNum}%)`;
  return name;
}

export default function GreenEleganceTemplate({ invoice, company, customer }: PdfTemplateProps) {
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
              <Text style={styles.companyEmail}>{company.accountsEmail}</Text>
            ) : null}
          </View>
          <Text style={styles.invoiceTitle}>Tax Invoice</Text>
        </View>

        <View style={styles.divider} />

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

        <View style={styles.divider} />

        <View>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thDescription]}>Items &amp; Description</Text>
            <Text style={[styles.th, styles.thAmount]}>Amount</Text>
          </View>
          {invoice.lineItems.map((line, i) => (
            <View
              key={i}
              style={[styles.tableRow, i === invoice.lineItems.length - 1 ? styles.tableRowLast : {}]}
              wrap={false}
            >
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

        <View style={styles.divider} />

        <View style={styles.footerSection}>
          <Text style={styles.sectionLabel}>Payment Details</Text>
          {paymentLines.length > 0 ? (
            paymentLines.map((line, i) => (
              <Text key={i} style={i === 0 ? styles.paymentSubtitle : styles.paymentLine}>{line}</Text>
            ))
          ) : (
            <Text style={styles.paymentLine}>—</Text>
          )}
        </View>

        <View style={styles.divider} />

        {termsLines.length > 0 ? (
          <View style={styles.footerSection}>
            <Text style={styles.sectionLabel}>Terms</Text>
            {termsLines.map((line, i) => (
              <Text key={i} style={styles.termsLine}>{line}</Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
