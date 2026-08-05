import { db, queryAll } from "./db";
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
): void {
  db.prepare("INSERT INTO task_events (task_id, actor_id, type, comment) VALUES (?, ?, ?, ?)").run(
    taskId,
    actorId,
    type,
    comment
  );
}

/** Власник + усі моделювальники — ті, хто веде задачі. */
export function managementAudience(): number[] {
  return queryAll<{ id: number }>(
    "SELECT id FROM users WHERE is_active = 1 AND role IN ('owner','modeler')"
  ).map((r) => r.id);
}

/** Кому «прилітає» нова/повернута в чергу задача. */
export function millerAudience(task: Pick<Task, "assignee_id">): number[] {
  if (task.assignee_id) return [task.assignee_id];
  return queryAll<{ id: number }>(
    "SELECT id FROM users WHERE is_active = 1 AND role = 'miller'"
  ).map((r) => r.id);
}

export function notify(
  userIds: number[],
  actor: User,
  taskId: number,
  type: EventType,
  text: string
): void {
  const stmt = db.prepare(
    "INSERT INTO notifications (user_id, task_id, actor_id, type, text) VALUES (?, ?, ?, ?, ?)"
  );
  const seen = new Set<number>();
  for (const uid of userIds) {
    if (uid === actor.id || seen.has(uid)) continue; // собі не сповіщаємо
    seen.add(uid);
    stmt.run(uid, taskId, actor.id, type, text);
  }
}

export function markAllRead(userId: number): void {
  db.prepare(
    "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL"
  ).run(userId);
}
