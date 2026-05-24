import { VendorForm } from "@/components/vendors/vendor-form";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";

export default async function Page() {
  const customers = await api<Customer[]>("/customers").catch(() => [] as Customer[]);
  return <VendorForm customers={customers} />;
}
