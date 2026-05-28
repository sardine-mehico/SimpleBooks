import * as React from 'react';
import * as path from 'path';
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { PdfStatementTemplateProps } from './types';

// Reuse Source Sans 3 (already installed; used by other templates).
const SS3_DIR =
  path.dirname(require.resolve('@fontsource/source-sans-3/package.json')) + '/files';
Font.register({
  family: 'Source Sans 3',
  fonts: [
    { src: `${SS3_DIR}/source-sans-3-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${SS3_DIR}/source-sans-3-latin-600-normal.woff`, fontWeight: 600 },
    { src: `${SS3_DIR}/source-sans-3-latin-700-normal.woff`, fontWeight: 700 },
  ],
});

const COLOR = {
  ink: '#1a1a1a',
  inkSoft: '#4a4a4a',
  divider: '#d0d4dc',
  headerBg: '#374151',
  headerText: '#ffffff',
  summaryBg: '#f3f4f6',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Source Sans 3',
    fontSize: 9.5,
    color: COLOR.ink,
    paddingTop: 30,
    paddingBottom: 30,
    paddingLeft: 36,
    paddingRight: 36,
    flexDirection: 'column',
  },

  topRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 24 },
  companyBlock: { textAlign: 'right' },
  companyName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  companyLine: { fontSize: 9, color: COLOR.inkSoft, marginBottom: 1 },

  middleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  toBlock: { maxWidth: '55%' },
  toLabel: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  toName: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  toLine: { fontSize: 9.5, color: COLOR.inkSoft, lineHeight: 1.4 },

  titleBlock: { maxWidth: '45%', alignItems: 'flex-end' },
  titleText: { fontSize: 22, fontWeight: 700, marginBottom: 2 },
  titleRange: { fontSize: 9, color: COLOR.inkSoft, borderTopWidth: 1, borderTopColor: COLOR.ink, paddingTop: 2, alignSelf: 'flex-end' },

  summary: { backgroundColor: COLOR.summaryBg, padding: 10, borderRadius: 4, marginBottom: 18, alignSelf: 'flex-end', width: 240 },
  summaryHeading: { fontSize: 10, fontWeight: 700, marginBottom: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, fontSize: 10 },
  summaryRowLabel: { color: COLOR.inkSoft },
  summaryRowValue: {},

  table: { marginTop: 4 },
  thead: {
    flexDirection: 'row',
    backgroundColor: COLOR.headerBg,
    color: COLOR.headerText,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: 700,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.divider,
    fontSize: 9.5,
  },

  colDate:        { width: '12%' },
  colType:        { width: '12%' },
  colDetails:     { width: '34%' },
  colAmount:      { width: '14%', textAlign: 'right' },
  colPayment:     { width: '14%', textAlign: 'right' },
  colBalance:     { width: '14%', textAlign: 'right' },

  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14, fontSize: 10, fontWeight: 700 },
  footerLabel: { marginRight: 14 },
});

function formatRange(dateFrom: string | null, dateTo: string | null): string {
  const f = dateFrom ? toDdMmYyyy(dateFrom) : null;
  const t = dateTo ? toDdMmYyyy(dateTo) : null;
  if (!f && !t) return 'All transactions';
  if (f && t) return `${f} To ${t}`;
  if (f) return `From ${f}`;
  return `To ${t}`;
}

function toDdMmYyyy(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${y}`;
}

function typeLabel(t: 'INVOICE' | 'PAYMENT'): string {
  return t === 'INVOICE' ? 'Invoice' : 'Payment Received';
}

export default function CustomerStatementTemplate({ statement }: PdfStatementTemplateProps) {
  const { customer, billingCompany, dateFrom, dateTo, openingBalance, rows, summary } = statement;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.topRow}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{billingCompany.name}</Text>
            {billingCompany.abn ? <Text style={styles.companyLine}>ABN {billingCompany.abn}</Text> : null}
            {billingCompany.accountsEmail ? <Text style={styles.companyLine}>{billingCompany.accountsEmail}</Text> : null}
          </View>
        </View>

        <View style={styles.middleRow}>
          <View style={styles.toBlock}>
            <Text style={styles.toLabel}>To</Text>
            <Text style={styles.toName}>{customer.name}</Text>
            {customer.address ? <Text style={styles.toLine}>{customer.address}</Text> : null}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.titleText}>Statement of Accounts</Text>
            <Text style={styles.titleRange}>{formatRange(dateFrom, dateTo)}</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryHeading}>Account Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Opening Balance</Text>
            <Text style={styles.summaryRowValue}>${openingBalance}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Invoiced Amount</Text>
            <Text style={styles.summaryRowValue}>${summary.invoicedAmount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Amount Received</Text>
            <Text style={styles.summaryRowValue}>${summary.amountReceived}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Balance Due</Text>
            <Text style={styles.summaryRowValue}>${summary.balanceDue}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thead}>
            <Text style={styles.colDate}>Date</Text>
            <Text style={styles.colType}>Transactions</Text>
            <Text style={styles.colDetails}>Details</Text>
            <Text style={styles.colAmount}>Amount</Text>
            <Text style={styles.colPayment}>Payments</Text>
            <Text style={styles.colBalance}>Balance</Text>
          </View>

          {dateFrom ? (
            <View style={styles.tr}>
              <Text style={styles.colDate}>{toDdMmYyyy(dateFrom)}</Text>
              <Text style={styles.colType}>Opening</Text>
              <Text style={styles.colDetails}>***Opening Balance***</Text>
              <Text style={styles.colAmount}>{openingBalance}</Text>
              <Text style={styles.colPayment}>{''}</Text>
              <Text style={styles.colBalance}>{openingBalance}</Text>
            </View>
          ) : null}

          {rows.map((r, i) => (
            <View key={i} style={styles.tr}>
              <Text style={styles.colDate}>{toDdMmYyyy(r.date)}</Text>
              <Text style={styles.colType}>{typeLabel(r.type)}</Text>
              <Text style={styles.colDetails}>{r.details}</Text>
              <Text style={styles.colAmount}>{r.type === 'INVOICE' ? r.amount : ''}</Text>
              <Text style={styles.colPayment}>{r.type === 'PAYMENT' ? r.payment : ''}</Text>
              <Text style={styles.colBalance}>{r.balance}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLabel}>Balance Due</Text>
          <Text>${summary.balanceDue}</Text>
        </View>
      </Page>
    </Document>
  );
}
