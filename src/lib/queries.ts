import { can } from "./auth";
import { count, queryAll, queryOne } from "./db";
import { NOTIF_GROUPS, type NotifGroup, bucketForType, groupFilter } from "./notif-groups";
import type {
  Material,
  Notification,
  Status,
  Task,
  TaskEvent,
  TaskFile,
  TaskListItem,
  User,
} from "./types";

/**
 * Колонки задачі, які можна показувати будь-кому. Перелічені явно, а не через
 * `t.*`, свідомо: дані задачі летять у компоненти, що виконуються в браузері,
 * тож нове чутливе поле не має потрапляти туди саме собою. `budget_uah` тут
 * немає — його додає taskSelect() лише тим, хто має право.
 */
const TASK_COLUMNS = [
  "id", "code", "title", "description", "customer", "order_no", "material",
  "thickness_mm", "quantity", "priority", "due_date", "status", "assignee_id",
  "worker_id", "rework_to", "queue_pos", "created_by", "created_at", "updated_at",
  "started_at", "finished_at",
]
  .map((c) => `t.${c}`)
  .join(", ");

const taskSelect = (viewer: User) => `
  SELECT ${TASK_COLUMNS}${can(viewer, "can_see_budget") ? ", t.budget_uah" : ""},
    a.name AS assignee_name,
    w.name AS worker_name,
    c.name AS author_name,
    r.name AS rework_to_name,
    (SELECT COUNT(*)::int FROM task_files f WHERE f.task_id = t.id AND f.kind = 'image') AS image_count,
    (SELECT COUNT(*)::int FROM task_files f WHERE f.task_id = t.id AND f.kind = 'model') AS model_count,
    (SELECT COUNT(*)::int FROM task_files f WHERE f.task_id = t.id) AS file_count,
    (SELECT f.id FROM task_files f
       WHERE f.task_id = t.id AND f.kind = 'image' ORDER BY f.id LIMIT 1) AS cover
  FROM tasks t
  LEFT JOIN users a ON a.id = t.assignee_id
  LEFT JOIN users w ON w.id = t.worker_id
  LEFT JOIN users c ON c.id = t.created_by
  LEFT JOIN users r ON r.id = t.rework_to
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

/**
 * Хто може прийняти доопрацювання. Власник теж у списку: у малому цеху він
 * нерідко сам і моделює, а без нього при одному моделювальнику не було б
 * кому передати задачу, поки той у відпустці.
 */
export function listModelers(): Promise<User[]> {
  return queryAll<User>(
    `SELECT * FROM users WHERE role IN ('modeler','owner') AND is_active = 1
     ORDER BY CASE role WHEN 'modeler' THEN 0 ELSE 1 END, name`
  );
}

/** Довідник матеріалів — підказки у формі задачі. */
export function listMaterials(): Promise<Material[]> {
  return queryAll<Material>("SELECT * FROM materials ORDER BY sort, name");
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
  const sql = `${taskSelect(viewer)}
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
  const sql = `${taskSelect(viewer)}
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

export function getTask(viewer: User, id: number): Promise<TaskListItem | null> {
  return queryOne<TaskListItem>(`${taskSelect(viewer)} WHERE t.id = ?`, id);
}

/**
 * Задача з усіма колонками, включно з бюджетом. Тільки для серверних перевірок
 * прав — назовні (у браузер) її віддавати не можна, для цього є getTask().
 */
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

/** Кількість і гроші за період. `money` — null, якщо права бачити суми немає. */
export interface DonePeriod {
  n: number;
  money: number | null;
}

export interface DoneSummary {
  today: DonePeriod;
  week: DonePeriod;
  month: DonePeriod;
  prevMonth: DonePeriod;
}

export async function doneSummary(viewer: User): Promise<DoneSummary> {
  const scope = doneScope(viewer);
  const withMoney = can(viewer, "can_see_budget");

  const period = async (where: string): Promise<DonePeriod> => {
    const row = await queryOne<{ n: number; money: number | null }>(
      `SELECT COUNT(*)::int AS n,
              ${withMoney ? "COALESCE(SUM(budget_uah), 0)" : "NULL"} AS money
       FROM tasks WHERE ${DONE} AND ${where}${scope.sql}`,
      ...scope.params
    );
    return { n: row?.n ?? 0, money: withMoney ? (row?.money ?? 0) : null };
  };

  const [today, week, month, prevMonth] = await Promise.all([
    period(`(finished_at ${KYIV})::date = (now() ${KYIV})::date`),
    period(`date_trunc('week', finished_at ${KYIV}) = date_trunc('week', now() ${KYIV})`),
    period(`date_trunc('month', finished_at ${KYIV}) = date_trunc('month', now() ${KYIV})`),
    period(
      `date_trunc('month', finished_at ${KYIV})
       = date_trunc('month', (now() ${KYIV}) - interval '1 month')`
    ),
  ]);

  return { today, week, month, prevMonth };
}

export interface PeriodCount {
  /** «2026-08» для місяця, «2026-08-06» для дня. */
  key: string;
  n: number;
  money: number | null;
}

/** Скільки грошей рахувати — або NULL, якщо права немає. */
const moneySum = (allowed: boolean) =>
  allowed ? "COALESCE(SUM(budget_uah), 0)" : "NULL";

/** Помісячно за останній рік — щоб було видно, як іде рік. */
export function doneByMonth(viewer: User, months = 12): Promise<PeriodCount[]> {
  const scope = doneScope(viewer);
  return queryAll<PeriodCount>(
    `SELECT to_char(date_trunc('month', finished_at ${KYIV}), 'YYYY-MM') AS key,
            COUNT(*)::int AS n,
            ${moneySum(can(viewer, "can_see_budget"))} AS money
     FROM tasks
     WHERE ${DONE}
       AND finished_at >= date_trunc('month', (now() ${KYIV}) - make_interval(months => ?))
       ${scope.sql}
     GROUP BY 1 ORDER BY 1 DESC`,
    months - 1,
    ...scope.params
  );
}

/** По днях за вибраний період — дні без робіт просто відсутні. */
export function doneByDay(viewer: User, from: string, to: string): Promise<PeriodCount[]> {
  const scope = doneScope(viewer);
  return queryAll<PeriodCount>(
    `SELECT to_char((finished_at ${KYIV})::date, 'YYYY-MM-DD') AS key,
            COUNT(*)::int AS n,
            ${moneySum(can(viewer, "can_see_budget"))} AS money
     FROM tasks
     WHERE ${DONE}
       AND (finished_at ${KYIV})::date BETWEEN ?::date AND ?::date
       ${scope.sql}
     GROUP BY 1 ORDER BY 1 DESC`,
    from,
    to,
    ...scope.params
  );
}

export interface RangeStats {
  total: number;
  money: number | null;
  byWorker: { name: string | null; n: number; money: number | null }[];
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

  const withMoney = can(viewer, "can_see_budget");
  const sum = withMoney ? "COALESCE(SUM(t.budget_uah), 0)" : "NULL";

  const [totals, byWorker] = await Promise.all([
    queryOne<{ n: number; money: number | null }>(
      `SELECT COUNT(*)::int AS n, ${sum} AS money FROM tasks t WHERE ${where}`,
      from,
      to,
      ...scope.params
    ),
    queryAll<{ name: string | null; n: number; money: number | null }>(
      `SELECT u.name AS name, COUNT(*)::int AS n, ${sum} AS money
       FROM tasks t LEFT JOIN users u ON u.id = t.worker_id
       WHERE ${where}
       GROUP BY u.name ORDER BY n DESC`,
      from,
      to,
      ...scope.params
    ),
  ]);

  return {
    total: totals?.n ?? 0,
    money: withMoney ? (totals?.money ?? 0) : null,
    byWorker,
  };
}

/* --------------------------------------------------- очищення старих файлів */

/**
 * Закриті задачі, старші за вказану кількість місяців — саме їхні файли
 * пропонуємо прибрати. Задача й уся статистика лишаються, зникає тільки
 * важке: моделі, фото, креслення.
 */
export const PURGE_OLDER_THAN = "COALESCE(t.finished_at, t.updated_at)";

const purgeWhere = `t.status IN ('done','cancelled')
  AND ${PURGE_OLDER_THAN} < now() - (? || ' months')::interval`;

export interface PurgePreview {
  /** Скільки задач втратять файли. */
  tasks: number;
  files: number;
  bytes: number;
  /** Найсвіжіша дата серед задач, що потраплять під чистку. */
  newest: string | null;
}

export async function purgePreview(months: number): Promise<PurgePreview> {
  const row = await queryOne<{
    tasks: number;
    files: number;
    bytes: number;
    newest: string | null;
  }>(
    `SELECT COUNT(DISTINCT t.id)::int          AS tasks,
            COUNT(f.id)::int                   AS files,
            COALESCE(SUM(f.size_bytes), 0)::bigint AS bytes,
            MAX(${PURGE_OLDER_THAN})           AS newest
       FROM tasks t
       JOIN task_files f ON f.task_id = t.id
      WHERE ${purgeWhere}`,
    months
  );
  return {
    tasks: row?.tasks ?? 0,
    files: row?.files ?? 0,
    bytes: Number(row?.bytes ?? 0),
    newest: row?.newest ?? null,
  };
}

/** Самі файли під чистку — потрібні, щоб видалити їх ще й зі сховища. */
export function filesToPurge(months: number): Promise<TaskFile[]> {
  return queryAll<TaskFile>(
    `SELECT f.* FROM task_files f
       JOIN tasks t ON t.id = f.task_id
      WHERE ${purgeWhere}`,
    months
  );
}

/** Виконані задачі за період — списком, щоб можна було звірити руками. */
export function listDoneInRange(viewer: User, from: string, to: string): Promise<TaskListItem[]> {
  const scope = doneScope(viewer);
  const mine = viewer.role === "miller" ? " AND t.worker_id = ?" : "";
  return queryAll<TaskListItem>(
    `${taskSelect(viewer)}
     WHERE t.status = 'done' AND t.finished_at IS NOT NULL
       AND (t.finished_at ${KYIV})::date BETWEEN ?::date AND ?::date${mine}
     ORDER BY t.finished_at DESC LIMIT 200`,
    from,
    to,
    ...scope.params
  );
}
