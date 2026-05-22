import { CategoryForm } from "@/components/categories/category-form";
import { listCategories } from "@/lib/banking-rules";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const categories = await listCategories();
  const cat = categories.find((c) => c.id === id);
  if (!cat) return <div className="p-6">Category not found.</div>;
  return <CategoryForm initial={cat} />;
}
