import { VendorExtractor } from "@/components/vendors/vendor-extractor";
import { listAccounts } from "@/lib/banking";

export default async function Page() {
  const accounts = await listAccounts(true);
  return <VendorExtractor accounts={accounts} />;
}
