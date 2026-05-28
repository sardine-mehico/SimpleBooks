"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatement, statementPdfUrl } from "@/lib/statements";
import type { BillingCompany, Customer, StatementResponse } from "@/lib/types";
import { SendStatementDialog } from "./send-statement-dialog";

function fmtMoney(s: string | number) {
  return Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toDdMmYyyy(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-");
  return `${d}/${m}/${y}`;
}

export function StatementsPage({
  customers,
  companies,
}: {
  customers: Customer[];
  companies: BillingCompany[];
}) {
  const [customerId, setCustomerId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statement, setStatement] = useState<StatementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const sortedCustomers = useMemo(
    () => customers.filter((c) => c.isActive).slice().sort((a, b) => a.customerNumber - b.customerNumber),
    [customers],
  );
  const sortedCompanies = useMemo(
    () => companies.filter((c) => c.isActive).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  useEffect(() => {
    if (!customerId) return;
    const cust = customers.find((c) => c.id === customerId);
    if (cust?.billingCompanyId) setCompanyId(cust.billingCompanyId);
  }, [customerId, customers]);

  useEffect(() => {
    if (!customerId || !companyId) {
      setStatement(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStatement({
      customerId,
      billingCompanyId: companyId,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    })
      .then((r) => { if (!cancelled) setStatement(r); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Failed to load statement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [customerId, companyId, dateFrom, dateTo]);

  const canAct = Boolean(customerId && companyId && statement && !loading);

  function openPdf() {
    if (!canAct) return;
    window.open(statementPdfUrl({
      customerId,
      billingCompanyId: companyId,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }), "_blank");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-6xl p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Customer Statements</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!canAct} onClick={() => setSendOpen(true)}>
            <Mail className="h-4 w-4" /> Send
          </Button>
          <Button variant="outline" size="sm" disabled={!canAct} onClick={openPdf}>
            <Download className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm md:flex-nowrap md:gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Customer:</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-9 rounded-[0.3rem] border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="">— Select —</option>
              {sortedCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerNumber} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Billing Co:</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="h-9 rounded-[0.3rem] border border-slate-200 bg-white px-2 text-sm"
            >
              <option value="">— Select —</option>
              {sortedCompanies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Date:</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
            <span className="text-slate-400">—</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          </div>
        </div>

        <hr className="border-slate-100" />

        {!customerId || !companyId ? (
          <div className="flex h-72 flex-col items-center justify-center text-sm text-slate-400">
            Pick a customer and billing company to view their statement
          </div>
        ) : loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : error ? (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : statement ? (
          <StatementView s={statement} />
        ) : null}
      </Card>

      {statement ? (
        <SendStatementDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          params={{
            customerId,
            billingCompanyId: companyId,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
          }}
          customerName={statement.customer.name}
        />
      ) : null}
    </motion.div>
  );
}

function StatementView({ s }: { s: StatementResponse }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="text-sm text-slate-700">
          <div className="font-semibold text-slate-900">To</div>
          <div className="font-semibold">{s.customer.name}</div>
          {s.customer.address ? <div className="whitespace-pre-line text-slate-600">{s.customer.address}</div> : null}
        </div>
        <div className="text-right text-sm">
          <div className="text-xl font-semibold text-slate-900">Statement of Accounts</div>
          <div className="border-t border-slate-300 pt-1 text-slate-500">
            {s.dateFrom && s.dateTo
              ? `${toDdMmYyyy(s.dateFrom)} To ${toDdMmYyyy(s.dateTo)}`
              : s.dateFrom
              ? `From ${toDdMmYyyy(s.dateFrom)}`
              : s.dateTo
              ? `To ${toDdMmYyyy(s.dateTo)}`
              : "All transactions"}
          </div>
        </div>
      </div>

      <div className="ml-auto w-full max-w-xs rounded-lg bg-slate-50 p-4 text-sm">
        <div className="mb-2 font-semibold text-slate-900">Account Summary</div>
        <SumRow label="Opening Balance" value={s.openingBalance} />
        <SumRow label="Invoiced Amount" value={s.summary.invoicedAmount} />
        <SumRow label="Amount Received" value={s.summary.amountReceived} />
        <SumRow label="Balance Due" value={s.summary.balanceDue} strong />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-700 text-left text-xs font-semibold text-white">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Transactions</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Payments</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {s.dateFrom ? (
              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">{toDdMmYyyy(s.dateFrom)}</td>
                <td className="px-3 py-2">Opening</td>
                <td className="px-3 py-2">***Opening Balance***</td>
                <td className="px-3 py-2 text-right">{fmtMoney(s.openingBalance)}</td>
                <td className="px-3 py-2 text-right"></td>
                <td className="px-3 py-2 text-right">{fmtMoney(s.openingBalance)}</td>
              </tr>
            ) : null}
            {s.rows.length === 0 && !s.dateFrom ? (
              <tr><td className="px-3 py-6 text-center text-slate-400" colSpan={6}>No transactions in this period</td></tr>
            ) : null}
            {s.rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="px-3 py-2">{toDdMmYyyy(r.date)}</td>
                <td className="px-3 py-2">{r.type === "INVOICE" ? "Invoice" : "Payment Received"}</td>
                <td className="px-3 py-2">{r.details}</td>
                <td className="px-3 py-2 text-right">{r.type === "INVOICE" ? fmtMoney(r.amount) : ""}</td>
                <td className="px-3 py-2 text-right">{r.type === "PAYMENT" ? fmtMoney(r.payment) : ""}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-3 text-right font-semibold" colSpan={5}>Balance Due</td>
              <td className="px-3 py-3 text-right font-semibold">${fmtMoney(s.summary.balanceDue)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "mt-2 border-t border-slate-200 pt-2 font-semibold" : "py-0.5"}`}>
      <span className="text-slate-600">{label}</span>
      <span>${fmtMoney(value)}</span>
    </div>
  );
}
