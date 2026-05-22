import { CategoriesList } from "@/components/categories/categories-list";
import { listCategories } from "@/lib/banking-rules";

export default async function Page() {
  const categories = await listCategories();
  return <CategoriesList initial={categories} />;
}
