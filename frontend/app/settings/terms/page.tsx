import { api } from "@/lib/api";
import { TermsForm } from "@/components/settings/terms-form";

async function load(): Promise<{ defaultInvoiceTerms: string | null }> {
  return await api<{ defaultInvoiceTerms: string | null }>("/preferences/terms").catch(() => ({
    defaultInvoiceTerms: null,
  }));
}

export default async function Page() {
  const data = await load();
  return <TermsForm initial={data.defaultInvoiceTerms ?? ""} />;
}
