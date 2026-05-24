import { VendorForm } from "@/components/vendors/vendor-form";
import { getVendor } from "@/lib/banking-rules";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vendor, customers] = await Promise.all([
    getVendor(id),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return <VendorForm initial={vendor} customers={customers} />;
}
