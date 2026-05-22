import { VendorForm } from "@/components/vendors/vendor-form";
import { getVendor } from "@/lib/banking-rules";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await getVendor(id);
  return <VendorForm initial={vendor} />;
}
