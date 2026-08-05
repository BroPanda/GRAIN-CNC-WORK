"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { count, insertReturningId, queryAll, queryOne, run, transaction } from "./db";
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
import { deleteStoredFile, saveUploadedFile, statBlob } from "./storage";
import { extOf, kindForExt } from "./storage-shared";
import {
  PERMISSION_KEYS,
  type PermissionKey,
  type Priority,
  type Role,
  type Task,
  type TaskFile,
  type User,
} from "./types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const OK: ActionResult = { ok: true };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : "Невідома помилка" };
}

function touch(taskId: number): Promise<void> {
  return run("UPDATE tasks SET updated_at = now() WHERE id = ?", taskId);
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
async function nextCode(): Promise<string> {
  const total = await count("SELECT COUNT(*)::int AS n FROM tasks");
  return `C-${100 + total + 1}`;
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

    // Терміново або явне «на початок» → над усією чергою
    const bounds = await queryOne<{ lo: number | null; hi: number | null }>(
      `SELECT MIN(queue_pos) AS lo, MAX(queue_pos) AS hi FROM tasks
       WHERE status IN ('queued','in_progress','rework')`
    );
    const pos = toTop ? (bounds?.lo ?? 0) - 1 : (bounds?.hi ?? 0) + 1;

    const taskId = await insertReturningId(
      `INSERT INTO tasks (code, title, description, customer, order_no, material,
         thickness_mm, quantity, priority, due_date, assignee_id, queue_pos, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      await nextCode(),
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

    const task = (await getTaskRaw(taskId))!;

    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length) await attachFiles(taskId, files, user.id);

    // у хмарі файли вже лежать у сховищі — форма передає лише посилання
    const blobsRaw = str(fd, "blob_files");
    if (blobsRaw) await attachBlobs(taskId, JSON.parse(blobsRaw) as UploadedBlob[], user.id);

    await recordEvent(taskId, user.id, "created");
    await notify(
      [...(await millerAudience(task)), ...(await managementAudience())],
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
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    const title = str(fd, "title");
    if (!title) throw new Error("Вкажіть назву задачі");

    const assigneeRaw = str(fd, "assignee_id");
    const assigneeId = assigneeRaw ? Number(assigneeRaw) : null;

    await run(
      `UPDATE tasks SET title = ?, description = ?, customer = ?, order_no = ?,
         material = ?, thickness_mm = ?, quantity = ?, priority = ?, due_date = ?,
         assignee_id = ?, updated_at = now()
       WHERE id = ?`,
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

    await recordEvent(taskId, user.id, "edited");
    await notify(
      [...(await managementAudience()), ...(await millerAudience({ assignee_id: assigneeId }))],
      user,
      taskId,
      "edited",
      `${user.name} відредагував ${taskLabel(task)}`
    );

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
    const task = await getTaskRaw(taskId);
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

    await run(
      `UPDATE tasks SET status = 'in_progress', worker_id = ?,
         started_at = COALESCE(started_at, now()), updated_at = now()
       WHERE id = ?`,
      user.id,
      taskId
    );

    await recordEvent(taskId, user.id, "taken");
    await notify(
      await managementAudience(),
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
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!can(user, "can_take_tasks") && !can(user, "can_edit_tasks")) {
      throw new Error("Недостатньо прав для цієї дії");
    }
    const reason = comment.trim();
    if (reason.length < 3) throw new Error("Опишіть причину доопрацювання");
    if (task.status === "done" || task.status === "cancelled") {
      throw new Error("Задача вже закрита");
    }

    await run("UPDATE tasks SET status = 'rework', updated_at = now() WHERE id = ?", taskId);

    await recordEvent(taskId, user.id, "rework", reason);
    await notify(
      await managementAudience(),
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
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (task.status !== "rework") throw new Error("Задача не на доопрацюванні");

    await run("UPDATE tasks SET status = 'queued', updated_at = now() WHERE id = ?", taskId);

    await recordEvent(taskId, user.id, "returned", comment.trim());
    await notify(
      [...(await millerAudience(task)), ...(await managementAudience())],
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
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (task.status === "done") throw new Error("Задача вже виконана");
    if (task.status === "cancelled") throw new Error("Задача скасована");

    await run(
      `UPDATE tasks SET status = 'done', worker_id = COALESCE(worker_id, ?),
         finished_at = now(), updated_at = now()
       WHERE id = ?`,
      user.id,
      taskId
    );

    await recordEvent(taskId, user.id, "done", comment.trim());
    await notify(
      await managementAudience(),
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
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    const bounds = await queryOne<{ lo: number | null }>(
      "SELECT MIN(queue_pos) AS lo FROM tasks WHERE status IN ('queued','in_progress','rework')"
    );

    await run(
      `UPDATE tasks SET status = 'queued', finished_at = NULL, worker_id = NULL,
         queue_pos = ?, updated_at = now() WHERE id = ?`,
      (bounds?.lo ?? 0) - 1,
      taskId
    );

    await recordEvent(taskId, user.id, "reopened");
    await notify(
      [...(await millerAudience(task)), ...(await managementAudience())],
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
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    await run(
      "UPDATE tasks SET status = 'cancelled', finished_at = now(), updated_at = now() WHERE id = ?",
      taskId
    );

    await recordEvent(taskId, user.id, "cancelled", comment.trim());
    await notify(
      [...(await millerAudience(task)), ...(await managementAudience())],
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
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");

    await run("UPDATE tasks SET assignee_id = ?, updated_at = now() WHERE id = ?", userId, taskId);

    const type: EventType = userId ? "assigned" : "unassigned";
    const target = userId
      ? await queryOne<{ name: string }>("SELECT name FROM users WHERE id = ?", userId)
      : null;
    await recordEvent(taskId, user.id, type, target?.name ?? "");
    await notify(
      userId
        ? [userId, ...(await managementAudience())]
        : [...(await millerAudience(task)), ...(await managementAudience())],
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

function activeTasks(): Promise<ActiveRow[]> {
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
async function renumber(newQueuedOrder: number[]): Promise<void> {
  const active = await activeTasks();
  const queued = active.filter((t) => t.status === "queued").map((t) => t.id);
  const wanted = newQueuedOrder.filter((id) => queued.includes(id));
  const tail = queued.filter((id) => !wanted.includes(id)); // створені паралельно
  const order = [
    ...active.filter((t) => t.status === "in_progress").map((t) => t.id),
    ...wanted,
    ...tail,
    ...active.filter((t) => t.status === "rework").map((t) => t.id),
  ];

  await transaction(async (exec) => {
    for (const [i, id] of order.entries()) {
      await exec("UPDATE tasks SET queue_pos = ? WHERE id = ?", i + 1, id);
    }
  });
}

/** Новий порядок секції «У черзі»: масив id у потрібній послідовності. */
export async function reorderQueue(orderedIds: number[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_reorder_queue");
    await renumber(orderedIds);
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

    const queued = (await activeTasks())
      .filter((t) => t.status === "queued")
      .map((t) => t.id);
    const i = queued.indexOf(taskId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= queued.length) return OK;
    [queued[i], queued[j]] = [queued[j], queued[i]];

    await renumber(queued);
    await recordEvent(taskId, user.id, "reordered", dir === -1 ? "вище" : "нижче");
    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

export async function addComment(taskId: number, text: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!canSeeTask(user, task)) throw new Error("Немає доступу до задачі");
    const body = text.trim();
    if (!body) throw new Error("Порожній коментар");

    await recordEvent(taskId, user.id, "comment", body);
    await touch(taskId);
    await notify(
      [
        ...(await managementAudience()),
        ...(await millerAudience(task)),
        ...(task.worker_id ? [task.worker_id] : []),
      ],
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
  for (const file of files) {
    const saved = await saveUploadedFile(taskId, file);
    await run(
      `INSERT INTO task_files (task_id, kind, original_name, stored_name, ext, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      taskId,
      saved.kind,
      file.name,
      saved.storedName,
      saved.ext,
      saved.size,
      userId
    );
  }
}

/**
 * Файли, які браузер уже залив у Blob напряму — сервер отримує лише посилання.
 * Довіряти йому не можна, тому кожне звіряємо зі сховищем (statBlob).
 */
export interface UploadedBlob {
  url: string;
  name: string;
}

async function attachBlobs(taskId: number, blobs: UploadedBlob[], userId: number): Promise<void> {
  for (const blob of blobs) {
    const ext = extOf(blob.name);
    const kind = kindForExt(ext);
    if (!kind) throw new Error(`Формат .${ext || "?"} не підтримується`);

    const info = await statBlob(blob.url);
    if (!info) throw new Error(`Файл «${blob.name}» не знайдено у сховищі`);

    await run(
      `INSERT INTO task_files (task_id, kind, original_name, stored_name, ext, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      taskId,
      kind,
      blob.name,
      blob.url,
      ext,
      info.size,
      userId
    );
  }
}

/** Спільний хвіст для обох способів завантаження: подія в історії + сповіщення. */
async function announceFiles(
  task: Task,
  user: User,
  names: string[]
): Promise<void> {
  await recordEvent(task.id, user.id, "files_added", names.join(", "));
  await notify(
    [...(await managementAudience()), ...(await millerAudience(task))],
    user,
    task.id,
    "files_added",
    `${user.name} додав ${names.length} файл(ів) до ${taskLabel(task)}`
  );
}

export async function uploadTaskFiles(taskId: number, fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_upload_files");
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!canSeeTask(user, task)) throw new Error("Немає доступу до задачі");

    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error("Не вибрано файлів");
    await attachFiles(taskId, files, user.id);
    await announceFiles(task, user, files.map((f) => f.name));

    refresh(taskId);
    return OK;
  } catch (e) {
    return fail(e);
  }
}

/** Те саме, але файли вже у сховищі — браузер залив їх повз сервер. */
export async function attachUploadedBlobs(
  taskId: number,
  blobs: UploadedBlob[]
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertCan(user, "can_upload_files");
    const task = await getTaskRaw(taskId);
    if (!task) throw new Error("Задачу не знайдено");
    if (!canSeeTask(user, task)) throw new Error("Немає доступу до задачі");
    if (!blobs.length) throw new Error("Не вибрано файлів");

    await attachBlobs(taskId, blobs, user.id);
    await announceFiles(task, user, blobs.map((b) => b.name));

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
    const row = await queryOne<TaskFile>("SELECT * FROM task_files WHERE id = ?", fileId);
    if (!row) throw new Error("Файл не знайдено");

    await run("DELETE FROM task_files WHERE id = ?", fileId);
    await deleteStoredFile(row.task_id, row.stored_name);
    await recordEvent(row.task_id, user.id, "file_deleted", row.original_name);
    await touch(row.task_id);

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
    await markAllRead(user.id);
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
    const jobTitle = str(fd, "job_title") || null;
    const isActive = fd.get("is_active") === "on" ? 1 : 0;

    if (idRaw) {
      const perms = PERMISSION_KEYS.map((k) => (fd.get(k) === "on" ? 1 : 0));
      await run(
        `UPDATE users SET name = ?, telegram_username = ?, role = ?, job_title = ?, is_active = ?,
           ${PERMISSION_KEYS.map((k) => `${k} = ?`).join(", ")}
         WHERE id = ?`,
        name,
        tg,
        role,
        jobTitle,
        isActive,
        ...perms,
        Number(idRaw)
      );
    } else {
      const granted = DEFAULT_PERMS[role];
      const perms = PERMISSION_KEYS.map((k) => (granted.includes(k) ? 1 : 0));
      await run(
        `INSERT INTO users (name, telegram_username, role, job_title, is_active,
           ${PERMISSION_KEYS.join(", ")})
         VALUES (?, ?, ?, ?, ?, ${PERMISSION_KEYS.map(() => "?").join(", ")})`,
        name,
        tg,
        role,
        jobTitle,
        isActive,
        ...perms
      );
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
    const target = await queryOne<{ role: Role }>("SELECT role FROM users WHERE id = ?", userId);
    if (!target) throw new Error("Користувача не знайдено");
    if (target.role === "owner") throw new Error("Власник завжди має всі права");

    await run(`UPDATE users SET ${key} = ? WHERE id = ?`, value ? 1 : 0, userId);
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
    await run("UPDATE users SET is_active = ? WHERE id = ?", active ? 1 : 0, userId);
    refresh();
    return OK;
  } catch (e) {
    return fail(e);
  }
}
