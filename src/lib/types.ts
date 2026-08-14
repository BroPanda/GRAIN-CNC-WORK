export type Role = "owner" | "modeler" | "miller";
export type Status = "queued" | "in_progress" | "rework" | "done" | "cancelled";
export type Priority = "normal" | "urgent";
export type FileKind = "image" | "model" | "doc";

export const PERMISSION_KEYS = [
  "can_create_tasks",
  "can_edit_tasks",
  "can_reorder_queue",
  "can_upload_files",
  "can_take_tasks",
  "can_close_tasks",
  "can_manage_team",
  "can_see_budget",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_create_tasks: "Створювати задачі",
  can_edit_tasks: "Редагувати задачі",
  can_reorder_queue: "Міняти чергу",
  can_upload_files: "Завантажувати файли",
  can_take_tasks: "Брати задачі в роботу",
  can_close_tasks: "Закривати задачі",
  can_manage_team: "Керувати командою",
  can_see_budget: "Бачити бюджет",
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Власник",
  modeler: "Моделювання",
  miller: "Фрезерування",
};

export const STATUS_LABELS: Record<Status, string> = {
  queued: "У черзі",
  in_progress: "В роботі",
  rework: "На доопрацюванні",
  done: "Виконано",
  cancelled: "Скасовано",
};

export interface User {
  id: number;
  name: string;
  telegram_username: string | null;
  /** Номер у форматі +380…, за яким людину пускають у застосунок. */
  phone: string | null;
  /** id акаунта Telegram — з'являється після підтвердження номера в боті. */
  telegram_id: number | null;
  role: Role;
  /** Посада («Фрезерування», «Моделювання»…). `position` — небезпечне ім'я в SQL. */
  job_title: string | null;
  is_active: number;
  can_create_tasks: number;
  can_edit_tasks: number;
  can_reorder_queue: number;
  can_upload_files: number;
  can_take_tasks: number;
  can_close_tasks: number;
  can_manage_team: number;
  can_see_budget: number;
  created_at: string;
}

export interface Task {
  id: number;
  code: string | null;
  title: string;
  description: string;
  customer: string;
  order_no: string;
  material: string;
  thickness_mm: number | null;
  quantity: number;
  /**
   * Бюджет у гривнях. Поля може не бути зовсім: запит додає його лише тим,
   * хто має право `can_see_budget` — див. taskSelect() у queries.ts.
   */
  budget_uah?: number | null;
  priority: Priority;
  due_date: string | null;
  status: Status;
  assignee_id: number | null;
  worker_id: number | null;
  queue_pos: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface TaskFile {
  id: number;
  task_id: number;
  kind: FileKind;
  original_name: string;
  stored_name: string;
  ext: string;
  size_bytes: number;
  uploaded_by: number | null;
  created_at: string;
}

export interface TaskEvent {
  id: number;
  task_id: number;
  actor_id: number | null;
  type: string;
  comment: string;
  created_at: string;
  actor_name: string | null;
  actor_role: Role | null;
}

export interface Notification {
  id: number;
  user_id: number;
  task_id: number | null;
  actor_id: number | null;
  type: string;
  text: string;
  read_at: string | null;
  created_at: string;
  actor_name: string | null;
  task_title: string | null;
  task_code: string | null;
}

/** Задача, збагачена даними для списків. */
export interface TaskListItem extends Task {
  assignee_name: string | null;
  worker_name: string | null;
  author_name: string | null;
  image_count: number;
  model_count: number;
  file_count: number;
  /** id першого зображення — для прев'ю в списку. */
  cover: number | null;
}
