import * as React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { PdfTemplateProps } from './types';

// Intentionally plain default design — every templateKey points here until
// the user provides the matching invoice-design reference and we author the
// real `.tsx` (one per templateKey under this folder, registered in
// `./index.ts`). No images / no custom fonts so file size stays small —
// React-PDF's built-in Helvetica covers everything below.

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  companyBlock: { maxWidth: '60%' },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  invoiceMeta: { textAlign: 'right' },
  invoiceTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  metaLabel: { color: '#64748b', marginRight: 8 },
  metaValue: { fontFamily: 'Helvetica-Bold' },
  customerBlock: {
    marginTop: 8,
    marginBottom: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  sectionLabel: {
    fontSize: 8,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  customerName: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    paddingBottom: 6,
    marginBottom: 6,
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase' },
  thDescription: { flex: 4 },
  thTax: { flex: 1, textAlign: 'right' },
  thAmount: { flex: 1.2, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  cellDescription: { flex: 4 },
  cellTax: { flex: 1, textAlign: 'right', color: '#475569' },
  cellAmount: { flex: 1.2, textAlign: 'right' },
  totalsBlock: {
    marginTop: 16,
    alignSelf: 'flex-end',
    width: 220,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalsLabel: { color: '#475569' },
  totalsValue: { fontFamily: 'Helvetica-Bold' },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    marginTop: 4,
  },
  grandTotalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  grandTotalValue: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    fontSize: 9,
    color: '#475569',
  },
  footerSection: { marginBottom: 8 },
  footerHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
    color: '#64748b',
  },
});

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDdMmYyyy(d?: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Strip a single layer of common inline HTML tags so the rich-text
// `paymentDetails` field doesn't render with literal `<strong>` markup.
// Templates that need true formatting should override this with their own
// parser — the placeholder default is intentionally minimal.
function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export default function DefaultInvoiceTemplate({
  invoice,
  company,
  customer,
}: PdfTemplateProps) {
  const taxLabel = (() => {
    const names = Array.from(
      new Set(invoice.lineItems.map((l) => l.taxName).filter((n): n is string => !!n)),
    );
    if (names.length === 1) return names[0]!;
    if (names.length > 1) return 'TAX';
    return 'Tax';
  })();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{company?.name ?? 'Your Company'}</Text>
            {company?.abn ? <Text>ABN: {company.abn}</Text> : null}
            {company?.address
              ? company.address.split('\n').map((line, i) => <Text key={i}>{line}</Text>)
              : null}
            {company?.accountsEmail ? <Text>E: {company.accountsEmail}</Text> : null}
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Number</Text>
              <Text style={styles.metaValue}>INV-{invoice.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{formatDdMmYyyy(invoice.invoiceDate)}</Text>
            </View>
            {invoice.dueDate ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due</Text>
                <Text style={styles.metaValue}>{formatDdMmYyyy(invoice.dueDate)}</Text>
              </View>
            ) : null}
            {invoice.poNumber ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>PO</Text>
                <Text style={styles.metaValue}>{invoice.poNumber}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.customerBlock}>
          <Text style={styles.sectionLabel}>Bill To</Text>
          <Text style={styles.customerName}>{customer?.name ?? '—'}</Text>
          {customer?.address
            ? customer.address.split('\n').map((line, i) => <Text key={i}>{line}</Text>)
            : null}
          {customer?.billingEmail1 ? <Text>{customer.billingEmail1}</Text> : null}
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.thDescription]}>Description</Text>
          <Text style={[styles.th, styles.thTax]}>Tax</Text>
          <Text style={[styles.th, styles.thAmount]}>Amount</Text>
        </View>
        {invoice.lineItems.map((line, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cellDescription}>{line.description}</Text>
            <Text style={styles.cellTax}>
              {line.taxRate != null ? `${line.taxName ?? 'Tax'} ${Number(line.taxRate)}%` : ''}
            </Text>
            <Text style={styles.cellAmount}>{formatCurrency(Number(line.lineAmount))}</Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatCurrency(Number(invoice.subtotal))}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{taxLabel}</Text>
            <Text style={styles.totalsValue}>{formatCurrency(Number(invoice.taxAmount))}</Text>
          </View>
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>Total (incl. {taxLabel})</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(Number(invoice.totalAmount))}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          {invoice.paymentDetails ? (
            <View style={styles.footerSection}>
              <Text style={styles.footerHeading}>Payment Details</Text>
              {stripHtml(invoice.paymentDetails)
                .split('\n')
                .filter(Boolean)
                .map((l, i) => (
                  <Text key={i}>{l}</Text>
                ))}
            </View>
          ) : null}
          {invoice.terms ? (
            <View style={styles.footerSection}>
              <Text style={styles.footerHeading}>Terms</Text>
              {invoice.terms.split('\n').map((l, i) => (
                <Text key={i}>{l}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
