import { VendorsList } from "@/components/vendors/vendors-list";
import { listVendors } from "@/lib/banking-rules";

export default async function Page() {
  const vendors = await listVendors(true);
  return <VendorsList initial={vendors} />;
}
