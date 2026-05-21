export default function PublicInvoiceNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#EDEEF3] px-6">
      <div className="max-w-md text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">SimpleBooks</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Invoice not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          The invoice link is invalid or has been withdrawn. Please contact the issuer if you
          believe this is a mistake.
        </p>
      </div>
    </div>
  );
}
