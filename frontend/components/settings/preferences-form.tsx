"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "./section-header";
import { apiClient } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Preferences } from "@/lib/types";

const TIMEZONES = [
  "UTC",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Australia/Adelaide",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Pacific/Auckland",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PreferencesForm({ initial }: { initial: Preferences }) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(initial.timezone);
  const [fyStart, setFyStart] = useState(String(initial.financialYearStart));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiClient.put<Preferences>("/preferences", {
        timezone,
        financialYearStart: Number(fyStart),
      });
      toast.success("Preferences saved — restart backend to pick up new timezone");
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ?? "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Preferences"
        description="Default preferences for the system. The timezone is used by scheduled jobs (e.g. the recurring invoice sweep)."
      />
      <Card className="p-5">
        <form onSubmit={save} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Timezone" required hint="Used by cron jobs and recurring schedules. Restart the backend after changing.">
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (<SelectItem key={tz} value={tz}>{tz}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Financial Year Start" required hint="The month your fiscal year begins.">
            <Select value={fyStart} onValueChange={setFyStart}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (<SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="text-xs">
              {error ? <span className="text-rose-600">{error}</span> : <span className="text-slate-400">Click Save to update.</span>}
            </div>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
