import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

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

// orange-2 — cream header band, full-width orange DESCRIPTION/AMOUNT bar,
// cream-tinted totals card with the TOTAL line in bold orange, small-caps
// section labels (Payment Details / Terms) in orange with no background.
const COLOR = {
  pageBg: '#ffffff',
  band: '#fff1e6',       // soft cream band behind the header + totals card
  brand: '#ea580c',      // rust-orange accent
  ink: '#1a1a1a',
  inkSoft: '#5b6166',
  divider: '#e2e8f0',
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
  },

  // Top band — cream wash that wraps the company block + Tax Invoice title,
  // bounded below by a thin orange rule.
  headerBand: {
    backgroundColor: COLOR.band,
    paddingTop: 32,
    paddingBottom: 32,
    paddingLeft: 50,
    paddingRight: 50,
    borderBottomWidth: 3,
    borderBottomColor: COLOR.brand,
  },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  companyBlock: { maxWidth: '60%' },
  // Matches `billToName` (customer name) below — both 12pt bold so the two
  // headings read as siblings rather than parent/child.
  companyName: { fontSize: 12, fontWeight: 700, color: COLOR.ink, marginBottom: 6 },
  companyLine: { fontSize: 10, color: COLOR.inkSoft, marginBottom: 3, lineHeight: 1.4 * LH },
  companyEmail: { fontSize: 10, color: COLOR.brand, marginTop: 4, lineHeight: 1.4 * LH },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    // Drops the title 20pt below the top of the header band so it lines up
    // closer to the address lines rather than the company name.
    marginTop: 20,
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
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.inkSoft,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  billToName: { fontSize: 12, fontWeight: 700, color: COLOR.ink, marginBottom: 4 },
  billToLine: { fontSize: 10, color: COLOR.ink, marginBottom: 3, lineHeight: 1.4 * LH },

  metaRows: {
    // -50% width on the meta column (was 240).
    width: 120,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingTop: 4,
    paddingBottom: 4,
  },
  // Both columns right-aligned per the user's spec: the label column ends
  // at the same x-position across every row, and the value column does
  // the same. Achieved with a fixed-width label cell + small gap +
  // flex-1 value cell, both with `textAlign: 'right'`.
  metaLabel: {
    width: 70,
    fontSize: 8,
    fontWeight: 700,
    color: COLOR.inkSoft,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'right',
    marginRight: 10,
  },
  metaValue: { fontSize: 10, color: COLOR.ink, flex: 1, textAlign: 'right' },

  // Orange full-width header strip + faint divider rows below.
  tableContainer: {
    paddingLeft: 50,
    paddingRight: 50,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.brand,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 16,
    paddingRight: 16,
  },
  th: { fontSize: 10, fontWeight: 700, color: '#ffffff', letterSpacing: 1.2, textTransform: 'uppercase' },
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

  // Right-floated cream totals card. Sub Total + GST rows are plain; TOTAL
  // sits below a thin divider with both label and value in bold orange.
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: 50,
    paddingRight: 50,
    marginTop: 12,
  },
  totalsCard: {
    // -35% width on the Sub Total / GST / Total card (was 240 → 156).
    width: 156,
    backgroundColor: COLOR.band,
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
    marginTop: 8,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: 700,
    color: COLOR.brand,
  },

  // Footer labels: orange small-caps text only (no banners). Lines beneath
  // are rendered without indent so they sit aligned with the label.
  footer: {
    paddingLeft: 50,
    paddingRight: 50,
    marginTop: 40,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.brand,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  paymentLine: { fontSize: 10, color: COLOR.ink, marginBottom: 4 },
  paymentLineStrong: { fontSize: 10, color: COLOR.ink, fontWeight: 700, marginBottom: 4 },
  termsSection: { marginTop: 32 },
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

export default function Orange2Template({ invoice, company, customer }: PdfTemplateProps) {
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
        {/* Cream header band — company on the left, "TAX INVOICE" small-caps
            on the right, separated by a 3pt orange rule below. */}
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

        {/* Bill To + meta block: small-caps uppercase labels in muted ink,
            values in plain black to the right. */}
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

        {/* Line-item table — full-width orange header bar, faint dividers. */}
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
