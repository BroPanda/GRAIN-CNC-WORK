import { queryAll, run } from "./db";
import type { Task, User } from "./types";

export type EventType =
  | "created"
  | "edited"
  | "files_added"
  | "file_deleted"
  | "assigned"
  | "unassigned"
  | "reordered"
  | "taken"
  | "rework"
  | "returned"
  | "done"
  | "reopened"
  | "cancelled"
  | "comment";

export const EVENT_LABELS: Record<EventType, string> = {
  created: "Задачу створено",
  edited: "Задачу відредаговано",
  files_added: "Додано файли",
  file_deleted: "Видалено файл",
  assigned: "Закріплено за виконавцем",
  unassigned: "Знято закріплення",
  reordered: "Змінено місце в черзі",
  taken: "Взято в роботу",
  rework: "Відправлено на доопрацювання",
  returned: "Повернуто в чергу після доопрацювання",
  done: "Виконано",
  reopened: "Перевідкрито",
  cancelled: "Скасовано",
  comment: "Коментар",
};

export function taskLabel(task: Pick<Task, "id" | "code" | "title">): string {
  return `${task.code ?? `#${task.id}`} «${task.title}»`;
}

export function recordEvent(
  taskId: number,
  actorId: number,
  type: EventType,
  comment = ""
): Promise<void> {
  return run(
    "INSERT INTO task_events (task_id, actor_id, type, comment) VALUES (?, ?, ?, ?)",
    taskId,
    actorId,
    type,
    comment
  );
}

/** Власник + усі моделювальники — ті, хто веде задачі. */
export async function managementAudience(): Promise<number[]> {
  const rows = await queryAll<{ id: number }>(
    "SELECT id FROM users WHERE is_active = 1 AND role IN ('owner','modeler')"
  );
  return rows.map((r) => r.id);
}

/** Кому «прилітає» нова/повернута в чергу задача. */
export async function millerAudience(task: Pick<Task, "assignee_id">): Promise<number[]> {
  if (task.assignee_id) return [task.assignee_id];
  const rows = await queryAll<{ id: number }>(
    "SELECT id FROM users WHERE is_active = 1 AND role = 'miller'"
  );
  return rows.map((r) => r.id);
}

export async function notify(
  userIds: number[],
  actor: User,
  taskId: number,
  type: EventType,
  text: string
): Promise<void> {
  const targets = [...new Set(userIds)].filter((id) => id !== actor.id); // собі не сповіщаємо
  if (!targets.length) return;

  // один INSERT на всіх адресатів
  const values = targets.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const params = targets.flatMap((uid) => [uid, taskId, actor.id, type, text]);
  await run(
    `INSERT INTO notifications (user_id, task_id, actor_id, type, text) VALUES ${values}`,
    ...params
  );
}

export function markAllRead(userId: number): Promise<void> {
  return run(
    "UPDATE notifications SET read_at = now() WHERE user_id = ? AND read_at IS NULL",
    userId
  );
}
