import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// Inter via `@fontsource/inter` — Latin subset only. Three weights (400 /
// 600 / 700) so headings, table headers, and totals can each carry their
// own weight without falling back to faux-bold. Each `.woff` is ~25 KB, so
// the trio adds ~75 KB to the rendered PDF; well inside the 180 KB/page
// budget.
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
  ink: '#1a1a1a',
  inkSoft: '#333333',
  greyBand: '#e3e6ed',
  paymentBg: '#f3f5f9',
  paymentBorder: '#d8dee8',
  divider: '#dcdcdc',
  vertDivider: '#e0e0e0',
};

// All grey-1 dimensions are derived from these scaling factors. Bumping
// either knob will rescale the whole template consistently.
//   FS = 0.80 → fonts at 80% of their natural size (per user "-20%")
//   RP = 0.75 → table/total/meta vertical padding at 75% (per user "-25%")
//   LH = 0.75 → line-height multiplier at 75% (per user "-25%")
const FS = 0.8;
const RP = 0.75;
const LH = 0.75;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 13 * FS,
    color: COLOR.ink,
    backgroundColor: '#ffffff',
    flexDirection: 'column',
  },

  header: {
    backgroundColor: COLOR.greyBand,
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 50,
    paddingRight: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  companyBlock: { maxWidth: '60%' },
  companyName: { fontSize: 20 * FS, fontWeight: 700, marginBottom: 10 },
  companyLine: { fontSize: 13 * FS, marginBottom: 3, lineHeight: 1.4 * LH },
  // "Tax Invoice" title — an extra 0.8 on top of FS knocks it down another
  // 20% per the user's call (after the initial -20% from FS).
  invoiceTitle: { fontSize: 34 * FS * 0.8, fontWeight: 700 },

  metaRow: {
    flexDirection: 'row',
    // Compounded +10% and then +20% above and below the meta row, applied
    // across two iterations of user feedback.
    paddingTop: 20 * RP * 1.1 * 1.2,
    paddingBottom: 20 * RP * 1.1 * 1.2,
    paddingLeft: 50,
    paddingRight: 50,
  },
  metaItem: {
    flex: 1,
    paddingRight: 10,
    paddingLeft: 10,
    borderRightWidth: 1,
    borderRightColor: COLOR.vertDivider,
  },
  metaItemFirst: { paddingLeft: 0, alignItems: 'flex-start' },
  metaItemMid: { alignItems: 'center' },
  metaItemLast: { paddingRight: 0, borderRightWidth: 0, alignItems: 'flex-end' },
  metaLabel: { fontSize: 12 * FS, fontWeight: 600, marginBottom: 8 * RP },
  metaValue: { fontSize: 13 * FS, color: COLOR.inkSoft },

  tableContainer: {
    paddingLeft: 50,
    paddingRight: 50,
    // -20% space above the Sub Total row (the gap between this table and
    // the totals box).
    marginBottom: 15 * 0.8,
  },
  table: {
    borderWidth: 1,
    borderColor: COLOR.divider,
    borderRadius: 6,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.greyBand,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  th: { paddingTop: 14 * RP, paddingBottom: 14 * RP, paddingLeft: 20, paddingRight: 20, fontSize: 13 * FS, fontWeight: 600 },
  thDescription: { flex: 4 },
  thAmount: { flex: 1.5, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLOR.divider,
  },
  td: { paddingTop: 14 * RP, paddingBottom: 14 * RP, paddingLeft: 20, paddingRight: 20, fontSize: 13 * FS },
  tdDescription: { flex: 4 },
  tdAmount: { flex: 1.5, textAlign: 'right' },

  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingLeft: 50,
    paddingRight: 50,
    // Three compounding +35% bumps above the Payment Information box,
    // applied across three iterations of user feedback.
    marginBottom: 15 * 1.35 * 1.35 * 1.35,
  },
  // -50% width on the right-side totals stack so Sub Total / GST / Total
  // sit in a narrower column. Padding inside each row stays the same so the
  // label/value pair is closer together.
  totalsBox: { width: 160 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10 * RP,
    paddingBottom: 10 * RP,
    paddingLeft: 20,
    paddingRight: 20,
    fontSize: 13 * FS,
  },
  totalRowFinal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLOR.greyBand,
    borderRadius: 6,
    paddingTop: 12 * RP,
    paddingBottom: 12 * RP,
    paddingLeft: 20,
    paddingRight: 20,
    marginTop: 5,
    fontSize: 14 * FS,
    fontWeight: 700,
  },

  footer: {
    paddingLeft: 50,
    paddingRight: 50,
    paddingBottom: 30,
  },
  paymentBox: {
    backgroundColor: COLOR.paymentBg,
    borderWidth: 1,
    borderColor: COLOR.paymentBorder,
    borderRadius: 8,
    padding: 20 * RP,
    width: 250,
    marginBottom: 20,
  },
  paymentTitle: { fontSize: 14 * FS, fontWeight: 600, marginBottom: 15 * RP },
  paymentSubtitle: { fontSize: 13 * FS, fontWeight: 600, marginBottom: 5 },
  paymentLine: { fontSize: 13 * FS, marginBottom: 3, lineHeight: 1.4 * LH },
  termsSection: { paddingTop: 10 },
  termsHeading: { fontSize: 15 * FS, fontWeight: 600, marginBottom: 5 },
  termsLine: { fontSize: 13 * FS, marginBottom: 3, lineHeight: 1.5 * LH },
});

function formatCurrency(value: number | string | null | undefined): string {
  // `value` may be a Prisma `Decimal` object at runtime (even though the
  // TS type says number|string) — `Number()` handles all three by going
  // through the value's `valueOf` / `toString`.
  const n = Number(value ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function formatDdMmYyyy(d?: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Convert the rich-text `paymentDetails` HTML to plain-text lines. `<br>`
// becomes a newline; `<p>` closing tags also break a line; everything else
// (including `<strong>` / `<em>`) is stripped. Renders one `<Text>` per
// non-empty resulting line so layout stays predictable.
function htmlToLines(html?: string | null): string[] {
  if (!html) return [];
  // The frontend RichTextEditor wraps each line in `<div>...</div>` (with a
  // bare first line and a trailing fragment) and uses `<br>` inline. Treat
  // every block-level boundary as a newline, then strip all remaining tags.
  const text = html
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n')
    .replace(/<(p|div)(\s[^>]*)?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function deriveTaxLabel(invoice: PdfTemplateProps['invoice']): { label: string; rateText: string | null } {
  const names = Array.from(
    new Set(invoice.lineItems.map((l) => l.taxName).filter((n): n is string => !!n)),
  );
  if (names.length === 0) return { label: 'Tax', rateText: null };
  if (names.length > 1) return { label: 'TAX', rateText: null };
  // Single tax name across the invoice → suffix the rate to mirror the
  // design (e.g. "GST (10%)"). But skip the suffix when the name already
  // contains the percentage (e.g. "GST 10%") to avoid "GST 10% (10%)".
  const name = names[0]!;
  const rate = invoice.lineItems.find((l) => l.taxName === name)?.taxRate;
  const rateNum = rate != null ? Number(rate) : null;
  const nameAlreadyHasRate = /\d/.test(name);
  return {
    label: name,
    rateText:
      !nameAlreadyHasRate && rateNum != null && Number.isFinite(rateNum)
        ? `${rateNum}%`
        : null,
  };
}

export default function Grey1Template({ invoice, company, customer }: PdfTemplateProps) {
  const tax = deriveTaxLabel(invoice);
  const paymentLines = htmlToLines(invoice.paymentDetails);
  const termsLines = (invoice.terms ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{company?.name ?? 'Your Company'}</Text>
            {company?.abn ? <Text style={styles.companyLine}>ABN: {company.abn}</Text> : null}
            {company?.address
              ? company.address
                  .split('\n')
                  .filter(Boolean)
                  .map((line, i) => (
                    <Text key={i} style={styles.companyLine}>{line}</Text>
                  ))
              : null}
            {company?.accountsEmail ? (
              <Text style={styles.companyLine}>E: {company.accountsEmail}</Text>
            ) : null}
          </View>
          <Text style={styles.invoiceTitle}>Tax Invoice</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.metaItem, styles.metaItemFirst]}>
            <Text style={styles.metaLabel}>Invoice No:</Text>
            <Text style={styles.metaValue}>INV-{invoice.invoiceNumber}</Text>
          </View>
          <View style={[styles.metaItem, styles.metaItemMid]}>
            <Text style={styles.metaLabel}>Invoice Date:</Text>
            <Text style={styles.metaValue}>{formatDdMmYyyy(invoice.invoiceDate)}</Text>
          </View>
          <View style={[styles.metaItem, styles.metaItemMid]}>
            <Text style={styles.metaLabel}>Due Date:</Text>
            <Text style={styles.metaValue}>{formatDdMmYyyy(invoice.dueDate)}</Text>
          </View>
          <View style={[styles.metaItem, styles.metaItemLast]}>
            <Text style={styles.metaLabel}>PO Number:</Text>
            <Text style={styles.metaValue}>{invoice.poNumber ?? ''}</Text>
          </View>
        </View>

        <View style={styles.tableContainer}>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.thDescription]}>Items &amp; Description</Text>
              <Text style={[styles.th, styles.thAmount]}>Amount</Text>
            </View>
            {invoice.lineItems.map((line, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  // First body row's top border doubles up with the header's
                  // bottom border — skip it.
                  i === 0 ? { borderTopWidth: 0 } : {},
                ]}
                wrap={false}
              >
                <Text style={[styles.td, styles.tdDescription]}>{line.description}</Text>
                <Text style={[styles.td, styles.tdAmount]}>{formatCurrency(line.lineAmount as number)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text>Sub Total</Text>
              <Text>{formatCurrency(invoice.subtotal as number)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>
                {tax.label}
                {tax.rateText ? ` (${tax.rateText})` : ''}
              </Text>
              <Text>{formatCurrency(invoice.taxAmount as number)}</Text>
            </View>
            <View style={styles.totalRowFinal}>
              <Text>Total</Text>
              <Text>{formatCurrency(invoice.totalAmount as number)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.paymentBox}>
            <Text style={styles.paymentTitle}>Payment Information</Text>
            <Text style={styles.paymentSubtitle}>Bank Details</Text>
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
              <Text style={styles.termsHeading}>Terms</Text>
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
