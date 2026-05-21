import { api } from "@/lib/api";
import { PreferencesForm } from "@/components/settings/preferences-form";
import type { Preferences } from "@/lib/types";

async function load(): Promise<Preferences> {
  return await api<Preferences>("/preferences");
}

export default async function Page() {
  const prefs = await load();
  return <PreferencesForm initial={prefs} />;
}
