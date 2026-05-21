import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { TaskForm } from "@/components/tasks/task-form";
import type { Task } from "@/lib/types";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let task: Task;
  try {
    task = await api<Task>(`/tasks/${id}`);
  } catch {
    notFound();
  }
  return <TaskForm initial={task!} />;
}
