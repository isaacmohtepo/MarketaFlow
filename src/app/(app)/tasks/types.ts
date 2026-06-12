/**
 * Types compartidos entre TasksBoard.tsx y las distintas vistas
 * (ListView, CalendarView, etc.). Solo types — no exporta nada con DOM.
 */
import type { TaskStatus, TaskPriority } from "@/lib/tasks-types";

export type TaskUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export type TaskBrand = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
};

export type TaskSubtask = {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  position: number;
  createdAt: string;
};

export type TaskTagLite = {
  id: string;
  name: string;
  color: string;
};

export type TaskItem = {
  id: string;
  agencyId: string;
  brandId: string | null;
  postId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  creatorId: string;
  dueDate: string | null;
  recurrence: string | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: TaskUser | null;
  assignees: TaskUser[];
  creator: TaskUser | null;
  brand: TaskBrand | null;
  post: { id: string; title: string | null; caption: string } | null;
  subtasks: TaskSubtask[];
  tags: TaskTagLite[];
};

/** Devuelve assignees efectivos: M2M si tiene, sino fallback al legacy single. */
export function getEffectiveAssignees(task: TaskItem): TaskUser[] {
  if (task.assignees.length > 0) return task.assignees;
  if (task.assignee) return [task.assignee];
  return [];
}
