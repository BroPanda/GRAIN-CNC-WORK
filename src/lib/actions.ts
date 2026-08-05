"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { count, db, queryAll, queryOne } from "./db";
import { SESSION_COOKIE, assertCan, can, requireUser } from "./auth";
import { canSeeTask, getTaskRaw } from "./queries";
import {
  type EventType,
  managementAudience,
  markAllRead,
  millerAudience,
  notify,
  recordEvent,
  taskLabel,
} from "./notify";
import { deleteStoredFile, saveUploadedFile } from "./storage";
import {
  PERMISSION_KEYS,
  type PermissionKey,
  type Priority,
  type Role,
  type TaskFile,
} from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const OK: ActionResult = { ok: true };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Невідома помилка" };
}

function touch(taskId: number) {
  db.prepare("UPDATE tasks SET updated_at = datetime('now') WHERE id = ?").run(taskId);
}

function refresh(taskId?: number) {
  revalidatePath("/", "layout");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function numOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Наступний код задачі у форматі C-104. */
function nextCode(): string {
  return `C-${100 + count("SELECT COUNT(*) AS n FROM tasks") + 1}`;
}

/* ------------------------------------------------------------------ сесія */

export async function loginAs(userId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, String(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/queue");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

/* ------------------------------------------------------------------ задачі */

export async function createTask(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_create_tasks");

    const title = str(fd, "title");
    if (!title) throw new Error("Вкажіть назву задачі");

    const assigneeRaw = str(fd, "assignee_id");
    const assigneeId = assigneeRaw ? Number(assigneeRaw) : null;
    const priority = (str(fd, "priority") || "normal") as Priority;
    const toTop = fd.get("to_top") === "on" || priority === "urgent";

    // Терміново або явне «на початок» → над усією чергою.
    const bounds = queryOne<{ lo: number | null; hi: number | null }>(
      `SELECT MIN(queue_pos) AS lo, MAX(queue_pos) AS hi FROM tasks
       WHERE status IN ('queued','in_progress','rework')`
    );
    const pos = toTop ? (bounds?.lo ?? 0) - 1 : (bounds?.hi ?? 0) + 1;

    const info = db
      .prepare(
        `INSERT INTO tasks (code, title, description, customer, order_no, material,
           thickness_mm, quantity, priority, due_date, assignee_id, queue_pos, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        nextCode(),
        title,
        str(fd, "description"),
        str(fd, "customer"),
        str(fd, "order_no"),
        str(fd, "material"),
        numOrNull(fd, "thickness_mm"),
        Math.max(1, Number(str(fd, "quantity") || "1") || 1),
        priority === "urgent" ? "urgent" : "normal",
        str(fd, "due_date") || null,
        assigneeId,
        pos,
        user.id
      );

    const taskId = Number(info.lastInsertRowid);
    const task = getTaskRaw(taskId)!;

    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length) await attachFiles(taskId, files, user.id);

    recordEvent(taskId, user.id, "created");
    notify(
      [...millerAudience(task), ...managementAudience()],
      user,
      taskId,
      "created",
      `Нова задача ${taskLabel(task)}${priority === "urgent" ? " — ТЕРМІНОВО" : ""}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function updateTask(taskId: number, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_edit_tasks");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    const title = str(fd, "title");
    if (!title) throw new Error("Вкажіть назву задачі");

    const assigneeRaw = str(fd, "assignee_id");
    const assigneeId = assigneeRaw ? Number(assigneeRaw) : null;

    db.prepare(
      `UPDATE tasks SET title = ?, description = ?, customer = ?, order_no = ?,
         material = ?, thickness_mm = ?, quantity = ?, priority = ?, due_date = ?,
         assignee_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      title,
      str(fd, "description"),
      str(fd, "customer"),
      str(fd, "order_no"),
      str(fd, "material"),
      numOrNull(fd, "thickness_mm"),
      Math.max(1, Number(str(fd, "quantity") || "1") || 1),
      str(fd, "priority") === "urgent" ? "urgent" : "normal",
      str(fd, "due_date") || null,
      assigneeId,
      taskId
    );

    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length) {
      assertCan(user, "can_upload_files");
      await attachFiles(taskId, files, user.id);
    }

    recordEvent(taskId, user.id, "edited");
    const audience = [...managementAudience(), ...millerAudience({ assignee_id: assigneeId })];
    notify(audience, user, taskId, "edited", `${user.name} відредагував ${taskLabel(task)}`);

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/** Взяти в роботу (фрезерувальник). */
export async function takeTask(taskId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_take_tasks");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!canSeeTask(user, task)) throw new Error("Задача закріплена за іншим виконавцем");
    if (task.status === "in_progress") {
      throw new Error(`Задача вже в роботі${task.worker_id === user.id ? "" : " в іншого"}`);
    }
    if (task.status === "done" || task.status === "cancelled") {
      throw new Error("Задача вже закрита");
    }
    if (task.status === "rework") {
      throw new Error("Задача на доопрацюванні — спершу її мають повернути в чергу");
    }

    db.prepare(
      `UPDATE tasks SET status = 'in_progress', worker_id = ?,
         started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now')
       WHERE id = ?`
    ).run(user.id, taskId);

    recordEvent(taskId, user.id, "taken");
    notify(
      managementAudience(),
      user,
      taskId,
      "taken",
      `${user.name} взяв у роботу ${taskLabel(task)}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/** Відправити на доопрацювання — обов'язково з причиною. */
export async function sendToRework(taskId: number, comment: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!can(user, "can_take_tasks") && !can(user, "can_edit_tasks")) {
      throw new Error("Недостатньо прав для цієї дії");
    }
    const reason = comment.trim();
    if (reason.length < 3) throw new Error("Опишіть причину доопрацювання");
    if (task.status === "done" || task.status === "cancelled") {
      throw new Error("Задача вже закрита");
    }

    db.prepare(
      "UPDATE tasks SET status = 'rework', updated_at = datetime('now') WHERE id = ?"
    ).run(taskId);

    recordEvent(taskId, user.id, "rework", reason);
    notify(
      managementAudience(),
      user,
      taskId,
      "rework",
      `${user.name} відправив ${taskLabel(task)} на доопрацювання: ${reason}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/** Повернути доопрацьовану задачу в чергу (власник / моделювання). */
export async function returnToQueue(taskId: number, comment: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_edit_tasks");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (task.status !== "rework") throw new Error("Задача не на доопрацюванні");

    db.prepare(
      "UPDATE tasks SET status = 'queued', updated_at = datetime('now') WHERE id = ?"
    ).run(taskId);

    recordEvent(taskId, user.id, "returned", comment.trim());
    notify(
      [...millerAudience(task), ...managementAudience()],
      user,
      taskId,
      "returned",
      `${user.name} доопрацював і повернув у чергу ${taskLabel(task)}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/** Закрити як виконану. */
export async function completeTask(taskId: number, comment: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_close_tasks");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (task.status === "done") throw new Error("Задача вже виконана");
    if (task.status === "cancelled") throw new Error("Задача скасована");

    db.prepare(
      `UPDATE tasks SET status = 'done', worker_id = COALESCE(worker_id, ?),
         finished_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(user.id, taskId);

    recordEvent(taskId, user.id, "done", comment.trim());
    notify(
      managementAudience(),
      user,
      taskId,
      "done",
      `${user.name} виконав ${taskLabel(task)}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function reopenTask(taskId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_edit_tasks");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    const bounds = queryOne<{ lo: number | null }>(
      "SELECT MIN(queue_pos) AS lo FROM tasks WHERE status IN ('queued','in_progress','rework')"
    );

    db.prepare(
      `UPDATE tasks SET status = 'queued', finished_at = NULL, worker_id = NULL,
         queue_pos = ?, updated_at = datetime('now') WHERE id = ?`
    ).run((bounds?.lo ?? 0) - 1, taskId);

    recordEvent(taskId, user.id, "reopened");
    notify(
      [...millerAudience(task), ...managementAudience()],
      user,
      taskId,
      "reopened",
      `${user.name} перевідкрив ${taskLabel(task)}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function cancelTask(taskId: number, comment: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_edit_tasks");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    db.prepare(
      "UPDATE tasks SET status = 'cancelled', finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(taskId);

    recordEvent(taskId, user.id, "cancelled", comment.trim());
    notify(
      [...millerAudience(task), ...managementAudience()],
      user,
      taskId,
      "cancelled",
      `${user.name} скасував ${taskLabel(task)}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/** Закріпити задачу за конкретним фрезерувальником або вернути у спільний пул. */
export async function assignTask(taskId: number, userId: number | null): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_edit_tasks");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    db.prepare("UPDATE tasks SET assignee_id = ?, updated_at = datetime('now') WHERE id = ?").run(
      userId,
      taskId
    );

    const type: EventType = userId ? "assigned" : "unassigned";
    const target = userId
      ? queryOne<{ name: string }>("SELECT name FROM users WHERE id = ?", userId)
      : null;
    recordEvent(taskId, user.id, type, target?.name ?? "");
    notify(
      userId ? [userId, ...managementAudience()] : [...millerAudience(task), ...managementAudience()],
      user,
      taskId,
      type,
      userId
        ? `${taskLabel(task)} закріплено за ${target?.name ?? "виконавцем"}`
        : `${taskLabel(task)} відкрито для всіх фрезерувальників`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

interface ActiveRow {
  id: number;
  status: string;
}

function activeTasks(): ActiveRow[] {
  return queryAll<ActiveRow>(
    `SELECT id, status FROM tasks WHERE status IN ('queued','in_progress','rework')
     ORDER BY queue_pos ASC, id ASC`
  );
}

/**
 * Переставляє задачі в секції «У черзі» згідно з newQueuedOrder і перенумеровує
 * всі активні задачі: спочатку ті, що в роботі, далі черга, далі доопрацювання.
 * Так позиції завжди унікальні й послідовні.
 */
function renumber(newQueuedOrder: number[]): void {
  const active = activeTasks();
  const queued = active.filter((t) => t.status === "queued").map((t) => t.id);
  const wanted = newQueuedOrder.filter((id) => queued.includes(id));
  const tail = queued.filter((id) => !wanted.includes(id)); // створені паралельно
  const order = [
    ...active.filter((t) => t.status === "in_progress").map((t) => t.id),
    ...wanted,
    ...tail,
    ...active.filter((t) => t.status === "rework").map((t) => t.id),
  ];

  const stmt = db.prepare("UPDATE tasks SET queue_pos = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    order.forEach((id, i) => stmt.run(i + 1, id));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Новий порядок секції «У черзі»: масив id у потрібній послідовності. */
export async function reorderQueue(orderedIds: number[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_reorder_queue");
    renumber(orderedIds);
    refresh();
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/** Перемістити задачу на одну позицію вгору/вниз (кнопки-дублери для телефону). */
export async function nudgeTask(taskId: number, dir: -1 | 1): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_reorder_queue");

    const queued = activeTasks()
      .filter((t) => t.status === "queued")
      .map((t) => t.id);
    const i = queued.indexOf(taskId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= queued.length) return OK;
    [queued[i], queued[j]] = [queued[j], queued[i]];

    renumber(queued);
    recordEvent(taskId, user.id, "reordered", dir === -1 ? "вище" : "нижче");
    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function addComment(taskId: number, text: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!canSeeTask(user, task)) throw new Error("Немає доступу до задачі");
    const body = text.trim();
    if (!body) throw new Error("Порожній коментар");

    recordEvent(taskId, user.id, "comment", body);
    touch(taskId);
    notify(
      [...managementAudience(), ...millerAudience(task), ...(task.worker_id ? [task.worker_id] : [])],
      user,
      taskId,
      "comment",
      `${user.name} у ${taskLabel(task)}: ${body.slice(0, 120)}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------- файли */

async function attachFiles(taskId: number, files: File[], userId: number): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO task_files (task_id, kind, original_name, stored_name, ext, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const file of files) {
    const saved = await saveUploadedFile(taskId, file);
    stmt.run(taskId, saved.kind, file.name, saved.storedName, saved.ext, saved.size, userId);
  }
}

export async function uploadTaskFiles(taskId: number, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_upload_files");
    const task = getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!canSeeTask(user, task)) throw new Error("Немає доступу до задачі");

    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error("Не вибрано файлів");
    await attachFiles(taskId, files, user.id);

    recordEvent(taskId, user.id, "files_added", files.map((f) => f.name).join(", "));
    notify(
      [...managementAudience(), ...millerAudience(task)],
      user,
      taskId,
      "files_added",
      `${user.name} додав ${files.length} файл(ів) до ${taskLabel(task)}`
    );

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTaskFile(fileId: number): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_upload_files");
    const row = queryOne<TaskFile>("SELECT * FROM task_files WHERE id = ?", fileId);
    if (!row) throw new Error("Файл не знайдено");

    db.prepare("DELETE FROM task_files WHERE id = ?").run(fileId);
    deleteStoredFile(row.task_id, row.stored_name);
    recordEvent(row.task_id, user.id, "file_deleted", row.original_name);
    touch(row.task_id);

    refresh(row.task_id);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------- сповіщення / команда */

export async function readAllNotifications(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    markAllRead(user.id);
    refresh();
    return OK;
  } catch (e) {
    return fail(e);
  }
}

const DEFAULT_PERMS: Record<Role, PermissionKey[]> = {
  owner: [...PERMISSION_KEYS],
  modeler: ["can_create_tasks", "can_edit_tasks", "can_upload_files"],
  miller: ["can_take_tasks", "can_close_tasks", "can_upload_files"],
};

export async function saveTeamMember(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_manage_team");

    const idRaw = str(fd, "id");
    const name = str(fd, "name");
    if (!name) throw new Error("Вкажіть імʼя");
    const role = str(fd, "role") as Role;
    if (!["owner", "modeler", "miller"].includes(role)) throw new Error("Невідома роль");
    const tg = str(fd, "telegram_username").replace(/^@/, "") || null;
    const position = str(fd, "position") || null;
    const isActive = fd.get("is_active") === "on" ? 1 : 0;

    if (idRaw) {
      const perms = PERMISSION_KEYS.map((k) => (fd.get(k) === "on" ? 1 : 0));
      db.prepare(
        `UPDATE users SET name = ?, telegram_username = ?, role = ?, position = ?, is_active = ?,
           ${PERMISSION_KEYS.map((k) => `${k} = ?`).join(", ")}
         WHERE id = ?`
      ).run(name, tg, role, position, isActive, ...perms, Number(idRaw));
    } else {
      const granted = DEFAULT_PERMS[role];
      const perms = PERMISSION_KEYS.map((k) => (granted.includes(k) ? 1 : 0));
      db.prepare(
        `INSERT INTO users (name, telegram_username, role, position, is_active,
           ${PERMISSION_KEYS.join(", ")})
         VALUES (?, ?, ?, ?, ?, ${PERMISSION_KEYS.map(() => "?").join(", ")})`
      ).run(name, tg, role, position, isActive, ...perms);
    }

    refresh();
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function togglePermission(
  userId: number,
  key: PermissionKey,
  value: boolean
): Promise<ActionResult> {
  try {
    const actor = await requireUser();
    assertCan(actor, "can_manage_team");
    if (!PERMISSION_KEYS.includes(key)) throw new Error("Невідоме право");
    const target = queryOne<{ role: Role }>("SELECT role FROM users WHERE id = ?", userId);
    if (!target) throw new Error("Користувача не знайдено");
    if (target.role === "owner") throw new Error("Власник завжди має всі права");

    db.prepare(`UPDATE users SET ${key} = ? WHERE id = ?`).run(value ? 1 : 0, userId);
    refresh();
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function setUserActive(userId: number, active: boolean): Promise<ActionResult> {
  try {
    const actor = await requireUser();
    assertCan(actor, "can_manage_team");
    if (actor.id === userId) throw new Error("Не можна деактивувати себе");
    db.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(active ? 1 : 0, userId);
    refresh();
    return OK;
  } catch (e) {
    return fail(e);
  }
}
