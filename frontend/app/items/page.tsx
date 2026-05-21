import { api } from "@/lib/api";
import { ItemsList } from "@/components/items/items-list";
import type { Item } from "@/lib/types";

async function load() {
  try { return await api<Item[]>("/items"); } catch { return []; }
}

export default async function Page() {
  const rows = await load();
  return <ItemsList initial={rows} />;
}
