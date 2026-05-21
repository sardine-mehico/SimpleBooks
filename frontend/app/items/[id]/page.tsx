import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { ItemForm } from "@/components/items/item-form";
import type { Item } from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let item: Item;
  try {
    item = await api<Item>(`/items/${id}`);
  } catch {
    notFound();
  }
  return <ItemForm initial={item!} />;
}
