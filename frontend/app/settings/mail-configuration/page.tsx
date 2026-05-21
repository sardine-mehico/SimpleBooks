import { api } from "@/lib/api";
import { MailConfigForm } from "@/components/settings/mail-config-form";
import type { MailConfiguration } from "@/lib/types";

async function load(): Promise<MailConfiguration> {
  return await api<MailConfiguration>("/mail-configuration");
}

export default async function Page() {
  const config = await load();
  return <MailConfigForm initial={config} />;
}
