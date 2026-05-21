import { api } from "@/lib/api";
import { TaxTypesManager } from "@/components/settings/tax-types-manager";
import type { TaxType } from "@/lib/types";

async function load(): Promise<TaxType[]> {
  try { return await api<TaxType[]>("/tax-types"); } catch { return []; }
}

export default async function Page() {
  const rows = await load();
  return <TaxTypesManager initial={rows} />;
}
