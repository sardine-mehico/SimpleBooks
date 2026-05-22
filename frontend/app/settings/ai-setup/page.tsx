import { AiSetupPage } from "@/components/settings/ai-setup-page";
import { listAiProviders } from "@/lib/ai-providers";
import { api } from "@/lib/api";

export default async function Page() {
  const [providers, prefs] = await Promise.all([
    listAiProviders(),
    api<{ aiMiningThreshold?: number }>('/preferences').catch(() => ({})),
  ]);
  return <AiSetupPage initial={providers} prefs={prefs} />;
}
