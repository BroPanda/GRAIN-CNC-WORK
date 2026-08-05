import { count, queryAll, queryOne } from "./db";
import { NOTIF_GROUPS, type NotifGroup, bucketForType, groupFilter } from "./notif-groups";
import type {
  Notification,
  Status,
  Task,
  TaskEvent,
  TaskFile,
  TaskListItem,
  User,
} from "./types";

const TASK_SELECT = `
  SELECT t.*,
    a.name AS assignee_name,
    w.name AS worker_name,
    c.name AS author_name,
    (SELECT COUNT(*)::int FROM task_files f WHERE f.task_id = t.id AND f.kind = 'image') AS image_count,
    (SELECT COUNT(*)::int FROM task_files f WHERE f.task_id = t.id AND f.kind = 'model') AS model_count,
    (SELECT COUNT(*)::int FROM task_files f WHERE f.task_id = t.id) AS file_count,
    (SELECT f.id FROM task_files f
       WHERE f.task_id = t.id AND f.kind = 'image' ORDER BY f.id LIMIT 1) AS cover
  FROM tasks t
  LEFT JOIN users a ON a.id = t.assignee_id
  LEFT JOIN users w ON w.id = t.worker_id
  LEFT JOIN users c ON c.id = t.created_by
`;

export function listUsers(): Promise<User[]> {
  return queryAll<User>(
    `SELECT * FROM users
     ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'modeler' THEN 1 ELSE 2 END, name`
  );
}

export async function listActiveUsers(): Promise<User[]> {
  return (await listUsers()).filter((u) => u.is_active === 1);
}

export function listMillers(): Promise<User[]> {
  return queryAll<User>(
    "SELECT * FROM users WHERE role = 'miller' AND is_active = 1 ORDER BY name"
  );
}

export function getUser(id: number): Promise<User | null> {
  return queryOne<User>("SELECT * FROM users WHERE id = ?", id);
}

/**
 * Гібридна черга: задача видима фрезерувальнику, якщо вона у спільному пулі
 * (assignee_id IS NULL) або закріплена саме за ним. Власник і моделювання
 * бачать усе.
 */
export function listTasks(viewer: User, statuses: Status[]): Promise<TaskListItem[]> {
  const placeholders = statuses.map(() => "?").join(",");
  const restrictToViewer = viewer.role === "miller";
  const sql = `${TASK_SELECT}
    WHERE t.status IN (${placeholders})
    ${restrictToViewer ? "AND (t.assignee_id IS NULL OR t.assignee_id = ?)" : ""}
    ORDER BY t.queue_pos ASC, t.id ASC`;
  const params: (string | number)[] = [...statuses];
  if (restrictToViewer) params.push(viewer.id);
  return queryAll<TaskListItem>(sql, ...params);
}

export function listArchive(viewer: User, search: string): Promise<TaskListItem[]> {
  const restrictToViewer = viewer.role === "miller";
  const term = search.trim();
  const like = `%${term}%`;
  const sql = `${TASK_SELECT}
    WHERE t.status IN ('done','cancelled')
    ${restrictToViewer ? "AND (t.assignee_id IS NULL OR t.assignee_id = ? OR t.worker_id = ?)" : ""}
    ${term ? "AND (t.title ILIKE ? OR t.customer ILIKE ? OR t.order_no ILIKE ? OR t.code ILIKE ?)" : ""}
    ORDER BY COALESCE(t.finished_at, t.updated_at) DESC, t.id DESC
    LIMIT 200`;
  const params: (string | number)[] = [];
  if (restrictToViewer) params.push(viewer.id, viewer.id);
  if (term) params.push(like, like, like, like);
  return queryAll<TaskListItem>(sql, ...params);
}

export function getTask(id: number): Promise<TaskListItem | null> {
  return queryOne<TaskListItem>(`${TASK_SELECT} WHERE t.id = ?`, id);
}

export function getTaskRaw(id: number): Promise<Task | null> {
  return queryOne<Task>("SELECT * FROM tasks WHERE id = ?", id);
}

/** Чи має цей користувач доступ до задачі взагалі. */
export function canSeeTask(viewer: User, task: Task): boolean {
  if (viewer.role !== "miller") return true;
  return (
    task.assignee_id === null ||
    task.assignee_id === viewer.id ||
    task.worker_id === viewer.id
  );
}

export function getTaskFiles(taskId: number): Promise<TaskFile[]> {
  return queryAll<TaskFile>(
    "SELECT * FROM task_files WHERE task_id = ? ORDER BY kind, id",
    taskId
  );
}

export function getTaskEvents(taskId: number): Promise<TaskEvent[]> {
  return queryAll<TaskEvent>(
    `SELECT e.*, u.name AS actor_name, u.role AS actor_role
     FROM task_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.task_id = ? ORDER BY e.id DESC`,
    taskId
  );
}

export function listNotifications(
  userId: number,
  group: NotifGroup = "all",
  limit = 60
): Promise<Notification[]> {
  const filter = groupFilter(group);
  return queryAll<Notification>(
    `SELECT n.*, u.name AS actor_name, t.title AS task_title, t.code AS task_code
     FROM notifications n
     LEFT JOIN users u ON u.id = n.actor_id
     LEFT JOIN tasks t ON t.id = n.task_id
     WHERE n.user_id = ?${filter.sql} ORDER BY n.id DESC LIMIT ?`,
    userId,
    ...filter.params,
    limit
  );
}

/** Скільки непрочитаних у кожній вкладці — для лічильників на табах. */
export async function unreadByGroup(userId: number): Promise<Record<NotifGroup, number>> {
  const rows = await queryAll<{ type: string; n: number }>(
    `SELECT type, COUNT(*)::int AS n FROM notifications
     WHERE user_id = ? AND read_at IS NULL GROUP BY type`,
    userId
  );

  const counts = Object.fromEntries(NOTIF_GROUPS.map((g) => [g, 0])) as Record<
    NotifGroup,
    number
  >;
  for (const row of rows) {
    counts[bucketForType(row.type)] += row.n;
    counts.all += row.n;
  }
  return counts;
}

export function unreadCount(userId: number): Promise<number> {
  return count(
    "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ? AND read_at IS NULL",
    userId
  );
}

export interface Stats {
  queued: number;
  in_progress: number;
  rework: number;
  overdue: number;
  done_week: number;
}

export async function getStats(viewer: User): Promise<Stats> {
  const scope = viewer.role === "miller" ? " AND (assignee_id IS NULL OR assignee_id = ?)" : "";
  const params = viewer.role === "miller" ? [viewer.id] : [];
  const n = (where: string) =>
    count(`SELECT COUNT(*)::int AS n FROM tasks WHERE ${where}${scope}`, ...params);

  const [queued, in_progress, rework, overdue, done_week] = await Promise.all([
    n("status = 'queued'"),
    n("status = 'in_progress'"),
    n("status = 'rework'"),
    n(
      "status IN ('queued','in_progress','rework') AND due_date IS NOT NULL AND due_date < CURRENT_DATE"
    ),
    n("status = 'done' AND finished_at >= now() - interval '7 days'"),
  ]);

  return { queued, in_progress, rework, overdue, done_week };
}

/* ------------------------------------------------- статистика виконаних робіт */

/**
 * Усі підрахунки — за київським часом, інакше робота, здана ввечері,
 * потрапляє в наступну добу (у базі час зберігається в UTC).
 */
const KYIV = "AT TIME ZONE 'Europe/Kyiv'";
const DONE = `status = 'done' AND finished_at IS NOT NULL`;

/** Фрезерувальник бачить свої роботи, керівництво — усі. */
function doneScope(viewer: User): { sql: string; params: number[] } {
  return viewer.role === "miller"
    ? { sql: " AND worker_id = ?", params: [viewer.id] }
    : { sql: "", params: [] };
}

export interface DoneSummary {
  today: number;
  week: number;
  month: number;
  prevMonth: number;
}

export async function doneSummary(viewer: User): Promise<DoneSummary> {
  const scope = doneScope(viewer);
  const n = (where: string) =>
    count(`SELECT COUNT(*)::int AS n FROM tasks WHERE ${DONE} AND ${where}${scope.sql}`, ...scope.params);

  const [today, week, month, prevMonth] = await Promise.all([
    n(`(finished_at ${KYIV})::date = (now() ${KYIV})::date`),
    n(
      `date_trunc('week', finished_at ${KYIV}) = date_trunc('week', now() ${KYIV})`
    ),
    n(
      `date_trunc('month', finished_at ${KYIV}) = date_trunc('month', now() ${KYIV})`
    ),
    n(
      `date_trunc('month', finished_at ${KYIV})
       = date_trunc('month', (now() ${KYIV}) - interval '1 month')`
    ),
  ]);

  return { today, week, month, prevMonth };
}

export interface MonthCount {
  month: string; // "2026-08"
  n: number;
}

/** Помісячно за останній рік — щоб було видно, як іде рік. */
export function doneByMonth(viewer: User, months = 12): Promise<MonthCount[]> {
  const scope = doneScope(viewer);
  return queryAll<MonthCount>(
    `SELECT to_char(date_trunc('month', finished_at ${KYIV}), 'YYYY-MM') AS month,
            COUNT(*)::int AS n
     FROM tasks
     WHERE ${DONE}
       AND finished_at >= date_trunc('month', (now() ${KYIV}) - make_interval(months => ?))
       ${scope.sql}
     GROUP BY 1 ORDER BY 1 DESC`,
    months - 1,
    ...scope.params
  );
}

export interface RangeStats {
  total: number;
  byWorker: { name: string | null; n: number }[];
}

/** Довільний період: «скільки здали з 1 по 15 серпня». Межі включно. */
export async function doneInRange(
  viewer: User,
  from: string,
  to: string
): Promise<RangeStats> {
  const scope = doneScope(viewer);
  const period = `(t.finished_at ${KYIV})::date BETWEEN ?::date AND ?::date`;
  const mine = viewer.role === "miller" ? " AND t.worker_id = ?" : "";
  const where = `t.status = 'done' AND t.finished_at IS NOT NULL AND ${period}${mine}`;

  const [total, byWorker] = await Promise.all([
    count(
      `SELECT COUNT(*)::int AS n FROM tasks t WHERE ${where}`,
      from,
      to,
      ...scope.params
    ),
    queryAll<{ name: string | null; n: number }>(
      `SELECT u.name AS name, COUNT(*)::int AS n
       FROM tasks t LEFT JOIN users u ON u.id = t.worker_id
       WHERE ${where}
       GROUP BY u.name ORDER BY n DESC`,
      from,
      to,
      ...scope.params
    ),
  ]);

  return { total, byWorker };
}

/** Виконані задачі за період — списком, щоб можна було звірити руками. */
export function listDoneInRange(viewer: User, from: string, to: string): Promise<TaskListItem[]> {
  const scope = doneScope(viewer);
  const mine = viewer.role === "miller" ? " AND t.worker_id = ?" : "";
  return queryAll<TaskListItem>(
    `${TASK_SELECT}
     WHERE t.status = 'done' AND t.finished_at IS NOT NULL
       AND (t.finished_at ${KYIV})::date BETWEEN ?::date AND ?::date${mine}
     ORDER BY t.finished_at DESC LIMIT 200`,
    from,
    to,
    ...scope.params
  );
}
