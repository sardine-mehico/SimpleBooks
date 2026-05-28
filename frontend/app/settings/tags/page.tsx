import { TagsList } from "@/components/tags/tags-list";
import { listTags } from "@/lib/banking-rules";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";

export default async function Page() {
  const [tags, customers] = await Promise.all([
    listTags(true),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return <TagsList initial={tags} customers={customers} />;
}
