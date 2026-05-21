import { api } from "@/lib/api";
import { TasksBoard } from "@/components/tasks/tasks-board";

async function loadTasks() {
  try { return await api<any[]>("/tasks"); } catch { return []; }
}

export default async function TasksPage() {
  const tasks = await loadTasks();
  return <TasksBoard initial={tasks} />;
}
