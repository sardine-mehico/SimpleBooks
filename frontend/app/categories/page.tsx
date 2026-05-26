import { CategoriesList } from "@/components/categories/categories-list";
import { listCategories } from "@/lib/banking-rules";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/types";

export default async function Page() {
  const [categories, customers] = await Promise.all([
    listCategories(),
    api<Customer[]>("/customers").catch(() => [] as Customer[]),
  ]);
  return <CategoriesList initial={categories} customers={customers} />;
}
