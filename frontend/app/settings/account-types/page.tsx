import { api } from "@/lib/api";
import { AccountTypesManager } from "@/components/settings/account-types-manager";
import type { AccountType } from "@/lib/types";

async function load(): Promise<AccountType[]> {
  try { return await api<AccountType[]>("/account-types"); } catch { return []; }
}

export default async function Page() {
  const types = await load();
  return <AccountTypesManager initial={types} />;
}
