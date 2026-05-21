import { Card, CardHeader, CardTitle } from "@/components/ui/card";

type Task = { id: string; title: string; status: string };

export function PendingTasksCard({ tasks }: { tasks: Task[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Tasks</CardTitle>
      </CardHeader>
      <ul className="px-5 pb-5">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-2.5 py-2">
            <span className="mt-0.5 grid h-4 w-4 place-items-center rounded border border-slate-300 bg-white text-slate-300">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5L4.2 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-sm leading-5 text-slate-700">{t.title}</span>
          </li>
        ))}
        {tasks.length === 0 && (
          <li className="py-6 text-center text-sm text-slate-400">No pending tasks</li>
        )}
      </ul>
    </Card>
  );
}
