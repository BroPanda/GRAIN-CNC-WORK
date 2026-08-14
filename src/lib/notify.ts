import { queryAll, run } from "./db";
import { type NotifGroup, bucketForType, groupFilter, tgBuckets } from "./notif-groups";
import { appUrl, botToken, sendMessage } from "./telegram";
import type { Task, User } from "./types";

export type EventType =
  | "created"
  | "edited"
  | "files_added"
  | "file_deleted"
  | "files_purged"
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
  files_purged: "Файли прибрано при очищенні архіву",
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

  await sendToTelegram(targets, actor, taskId, type, text);
}

/** Екранування під parse_mode: HTML — імена й назви задач пишуть люди. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const BUCKET_ICON: Record<string, string> = {
  comment: "💬",
  created: "🆕",
  done: "✅",
  rework: "🔁",
  taken: "▶️",
  files: "📎",
  other: "🔔",
};

/**
 * Дублює сповіщення в Telegram тим, хто цього просив. Кожен сам обирає
 * категорії у себе на сторінці сповіщень; хто нічого не обрав — нічого й не
 * отримує. Помилки доставки лише пишемо в лог: сповіщення в застосунку вже
 * збережене, і через недоступний Telegram уся дія падати не повинна.
 */
async function sendToTelegram(
  targets: number[],
  actor: User,
  taskId: number,
  type: EventType,
  text: string
): Promise<void> {
  if (!botToken()) return;

  const bucket = bucketForType(type);
  const holes = targets.map(() => "?").join(", ");
  const rows = await queryAll<{ telegram_id: number; tg_buckets: string }>(
    `SELECT telegram_id, tg_buckets FROM users
      WHERE id IN (${holes}) AND telegram_id IS NOT NULL AND tg_buckets <> ''`,
    ...targets
  );
  const chats = rows
    .filter((r) => tgBuckets(r.tg_buckets).includes(bucket))
    .map((r) => r.telegram_id);
  if (!chats.length) return;

  const task = await queryAll<{ code: string | null; title: string; customer: string }>(
    "SELECT code, title, customer FROM tasks WHERE id = ?",
    taskId
  );
  const t = task[0];

  // назва задачі окремим рядком, суть — нижче: у стрічці чатів видно головне
  const head = t
    ? `${BUCKET_ICON[bucket]} <b>${esc(t.code ?? `#${taskId}`)}</b> — ${esc(t.title)}`
    : `${BUCKET_ICON[bucket]} <b>Задача #${taskId}</b>`;
  const customer = t?.customer ? `\n🏭 ${esc(t.customer)}` : "";

  // у тексті сповіщення код і назва вже є — у заголовку вони повторились би
  const label = t ? taskLabel({ id: taskId, code: t.code, title: t.title }) : "";
  const body = (label ? text.split(label).join("") : text)
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([:,.])/g, "$1")
    .trim();

  // «Нова задача» та подібні не називають автора — тоді дописуємо його окремо
  const who = body.includes(actor.name) ? "" : `\n👤 ${esc(actor.name)}`;
  const message = `${head}${customer}\n\n${esc(body)}${who}`;

  const keyboard = {
    inline_keyboard: [[{ text: "Відкрити задачу", url: `${appUrl()}/tasks/${taskId}` }]],
  };

  await Promise.all(chats.map((chatId) => sendMessage(chatId, message, keyboard)));
}

export function markAllRead(userId: number): Promise<void> {
  return run(
    "UPDATE notifications SET read_at = now() WHERE user_id = ? AND read_at IS NULL",
    userId
  );
}

/** Одне сповіщення. user_id в умові — щоб не можна було чіпати чуже. */
export function markOneRead(userId: number, notificationId: number): Promise<void> {
  return run(
    "UPDATE notifications SET read_at = now() WHERE id = ? AND user_id = ? AND read_at IS NULL",
    notificationId,
    userId
  );
}

/** Ціла вкладка: «позначити всі виконані роботи прочитаними». */
export function markGroupRead(userId: number, group: NotifGroup): Promise<void> {
  const filter = groupFilter(group);
  // groupFilter пише умову з префіксом n. — тут таблиця без псевдоніма
  return run(
    `UPDATE notifications SET read_at = now()
     WHERE user_id = ? AND read_at IS NULL${filter.sql.replaceAll("n.type", "type")}`,
    userId,
    ...filter.params
  );
}
