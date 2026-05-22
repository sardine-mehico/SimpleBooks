import { AiSetupPage } from "@/components/settings/ai-setup-page";
import { listAiProviders } from "@/lib/ai-providers";

export default async function Page() {
  const providers = await listAiProviders();
  return <AiSetupPage initial={providers} />;
}
