import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/settings/section-header";
import {
  TelegramAllowlist,
  type AllowlistEntry,
} from "@/components/settings/telegram-allowlist";

type Status = {
  tokenConfigured: boolean;
  botRunning: boolean;
  mode: "webhook" | "long-poll";
  webhookDomain: string | null;
  allowlistCount: number;
  chatCount: number;
};

async function loadStatus(): Promise<Status | null> {
  try { return await api<Status>("/telegram/status"); } catch { return null; }
}

async function loadAllowlist(): Promise<AllowlistEntry[]> {
  try { return await api<AllowlistEntry[]>("/telegram/allowlist"); } catch { return []; }
}

export default async function Page() {
  const [status, allowlist] = await Promise.all([loadStatus(), loadAllowlist()]);

  return (
    <div>
      <SectionHeader title="Telegram" description="Bot connection status, allowlist, and available commands." />

      <Card className="mb-4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Bot connection</div>
          <Badge tone={status?.botRunning ? "completed" : "cancelled"}>
            {status?.botRunning ? "Running" : "Disabled"}
          </Badge>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          <Row label="Token configured" value={status?.tokenConfigured ? "Yes" : "No"} />
          <Row label="Mode" value={status?.mode === "webhook" ? "Webhook" : "Long polling"} />
          <Row label="Webhook domain" value={status?.webhookDomain ?? "—"} mono />
          <Row label="Connected chats" value={String(status?.chatCount ?? 0)} mono />
          <Row label="Allowlisted users" value={String(status?.allowlistCount ?? 0)} mono />
        </dl>
        {!status?.tokenConfigured && (
          <div className="mt-4 rounded-[0.3rem] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>Token not set.</strong> Set <code className="rounded bg-white px-1 py-0.5">TELEGRAM_BOT_TOKEN</code> in your project <code>.env</code>, then <code>docker compose restart backend</code>. Generate a token via{" "}
            <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>.
          </div>
        )}
        {status?.tokenConfigured && status.mode === "long-poll" && (
          <p className="mt-4 text-xs text-slate-500">
            Long polling is fine for local development. For production, set <code>TELEGRAM_WEBHOOK_DOMAIN</code> (a public HTTPS URL) and the bot will switch to webhook mode automatically.
          </p>
        )}
      </Card>

      <TelegramAllowlist initial={allowlist} />

      <Card className="mt-4 p-5">
        <div className="text-sm font-semibold text-slate-900">Bot commands</div>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">/start</code> — connect your chat</li>
          <li><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">/help</code> — list commands</li>
          <li><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">/tasks</code> — list open tasks (each with Complete / Cancel buttons)</li>
          <li><code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">/newtask &lt;title&gt;</code> — create a task. Same validation as the web form (1–200 chars).</li>
        </ul>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={mono ? "font-mono text-xs text-slate-700" : "text-sm text-slate-900"}>{value}</dd>
    </div>
  );
}
